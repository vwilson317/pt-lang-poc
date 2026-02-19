/** App user profile stored in Supabase (profiles table). */
export interface UserProfile {
  id: string;
  created_at: string;
  referral_slug: string;
  is_pilot: boolean;
  default_likes: number;
  likes_remaining: number;
  /** Refresh interval in minutes (pilot only). */
  refresh_interval_minutes: number;
  /** Next refresh at (ISO string). */
  next_refresh_at: string;
}

export type ReferralEventType = 'click' | 'signup';
