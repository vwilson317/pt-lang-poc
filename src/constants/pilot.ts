/** First N registered users are pilot users. */
export const PILOT_USER_CAP = 100;

/** Pilot users' likes refresh interval by default (hours). */
export const DEFAULT_REFRESH_HOURS = 12;

/** Minimum refresh interval for pilot users (hours). */
export const MIN_REFRESH_HOURS = 3;

/** Maximum default likes a pilot user can have. */
export const MAX_LIKES = 20;

/** Timer reduction per successful referral signup (minutes). */
export const REFERRAL_TIMER_REDUCTION_MINUTES = 15;

/** Initial default likes for a new pilot user. */
export const INITIAL_PILOT_DEFAULT_LIKES = 3;

export const DEFAULT_REFRESH_MINUTES = DEFAULT_REFRESH_HOURS * 60;
export const MIN_REFRESH_MINUTES = MIN_REFRESH_HOURS * 60;
