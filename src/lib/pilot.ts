import { supabase } from './supabase';
import type { UserProfile } from '../types/user';
import {
  DEFAULT_REFRESH_MINUTES,
  MIN_REFRESH_MINUTES,
  INITIAL_PILOT_DEFAULT_LIKES,
} from '../constants/pilot';

/** Fetch the current user's profile (requires auth). */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

const REFERRAL_SLUG_STORAGE_KEY = 'referral_slug';

/** Get stored referral slug (web: sessionStorage). Clear after read so we don't double-credit. */
export function getAndClearReferralSlug(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const slug = sessionStorage.getItem(REFERRAL_SLUG_STORAGE_KEY);
    if (slug) sessionStorage.removeItem(REFERRAL_SLUG_STORAGE_KEY);
    return slug;
  } catch {
    return null;
  }
}

/** Store referral slug (call from referral landing page). */
export function setReferralSlug(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(REFERRAL_SLUG_STORAGE_KEY, slug);
  } catch {
    // ignore
  }
}

/** Ensure profile exists for current user (call after sign-up). Creates row; trigger sets pilot fields. */
export async function ensureProfileForCurrentUser(
  referralSlugFromLanding?: string | null
): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (existing) return existing as UserProfile;

  const { data: inserted, error } = await supabase
    .from('profiles')
    .insert({ id: user.id })
    .select()
    .single();

  if (error || !inserted) return null;

  if (referralSlugFromLanding) {
    await recordReferralSignup(referralSlugFromLanding, user.id);
    const { data: updated } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (updated) return updated as UserProfile;
  }

  return inserted as UserProfile;
}

/** Apply scheduled refresh if pilot user and next_refresh_at has passed. Returns updated profile or null. */
export async function applyScheduledRefreshIfNeeded(profile: UserProfile): Promise<UserProfile | null> {
  if (!profile.is_pilot) return profile;
  const next = new Date(profile.next_refresh_at).getTime();
  if (Date.now() < next) return profile;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return profile;

  const intervalMin = Math.max(MIN_REFRESH_MINUTES, profile.refresh_interval_minutes);
  const nextRefresh = new Date(Date.now() + intervalMin * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('profiles')
    .update({
      likes_remaining: profile.default_likes,
      next_refresh_at: nextRefresh,
    })
    .eq('id', user.id)
    .select()
    .single();

  if (error || !data) return profile;
  return data as UserProfile;
}

/** Decrement likes_remaining by 1 for the current user. */
export async function decrementLikes(userId: string): Promise<number | null> {
  const { data: row } = await supabase
    .from('profiles')
    .select('likes_remaining')
    .eq('id', userId)
    .single();

  if (!row) return null;
  const next = Math.max(0, row.likes_remaining - 1);

  await supabase
    .from('profiles')
    .update({ likes_remaining: next })
    .eq('id', userId);

  return next;
}

/** Record a referral link click (refreshes referrer's likes; timer unchanged). Call from landing page. */
export async function recordReferralClick(referrerSlug: string): Promise<void> {
  await supabase.rpc('record_referral_click', { referrer_slug: referrerSlug });
}

/** Record a referral sign-up (increase default, refresh likes, reduce timer). Call after new user signs up. */
export async function recordReferralSignup(referrerSlug: string, newUserId: string): Promise<void> {
  await supabase.rpc('record_referral_signup', {
    referrer_slug: referrerSlug,
    new_user_id: newUserId,
  });
}
