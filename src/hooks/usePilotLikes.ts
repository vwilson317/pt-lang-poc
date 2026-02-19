import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  getCurrentUserProfile,
  ensureProfileForCurrentUser,
  applyScheduledRefreshIfNeeded,
  decrementLikes as decrementLikesApi,
  getAndClearReferralSlug,
} from '../lib/pilot';
import type { UserProfile } from '../types/user';

const FALLBACK_LIKES = 3;

export interface PilotLikesState {
  /** Current likes remaining (from profile or fallback). */
  likesRemaining: number;
  /** Whether the user is a pilot user (first 100). */
  isPilot: boolean;
  /** Shareable referral link (only for pilot users). */
  referralLink: string | null;
  /** Next refresh at (pilot only). */
  nextRefreshAt: Date | null;
  /** Default likes for this pilot user. */
  defaultLikes: number;
  /** Loading or no auth: use fallback behavior. */
  isReady: boolean;
  /** Refetch profile (e.g. after returning from referral click). */
  refetch: () => Promise<void>;
  /** Decrement likes by 1 (call on swipe right). Returns new count. */
  decrementLikes: () => Promise<number | null>;
}

/** Build referral URL for a given slug (web origin + /r/slug). */
export function getReferralLink(slug: string): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/r/${slug}`;
  }
  return `/r/${slug}`;
}

export function usePilotLikes(): PilotLikesState {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isReady, setIsReady] = useState(false);

  const fetchAndApplyRefresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProfile(null);
      setIsReady(true);
      return;
    }

    let p = await getCurrentUserProfile();
    if (!p) {
      const referralSlug = typeof window !== 'undefined' ? getAndClearReferralSlug() : null;
      p = await ensureProfileForCurrentUser(referralSlug);
    }
    if (p) {
      p = (await applyScheduledRefreshIfNeeded(p)) ?? p;
      setProfile(p);
    } else {
      setProfile(null);
    }
    setIsReady(true);
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error || !mounted) {
          setIsReady(true);
          return;
        }
      }
      await fetchAndApplyRefresh();
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
      if (!mounted) return;
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        await fetchAndApplyRefresh();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchAndApplyRefresh]);

  const decrementLikes = useCallback(async (): Promise<number | null> => {
    if (!profile) return null;
    const newCount = await decrementLikesApi(profile.id);
    if (newCount !== null) {
      setProfile((prev) => (prev ? { ...prev, likes_remaining: newCount } : null));
    }
    return newCount;
  }, [profile]);

  const likesRemaining = profile?.likes_remaining ?? FALLBACK_LIKES;
  const isPilot = profile?.is_pilot ?? false;
  const referralLink = profile?.referral_slug ? getReferralLink(profile.referral_slug) : null;
  const nextRefreshAt = profile?.next_refresh_at ? new Date(profile.next_refresh_at) : null;
  const defaultLikes = profile?.default_likes ?? FALLBACK_LIKES;

  return {
    likesRemaining,
    isPilot,
    referralLink,
    nextRefreshAt,
    defaultLikes,
    isReady,
    refetch: fetchAndApplyRefresh,
    decrementLikes,
  };
}
