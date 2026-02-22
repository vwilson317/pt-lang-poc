export type ReviewGrade = 'again' | 'hard' | 'good' | 'guess';

export type CardSchedule = {
  dueAt: number;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;
const DEFAULT_EASE = 2.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createDefaultSchedule(nowMs: number): CardSchedule {
  return {
    dueAt: nowMs,
    intervalDays: 0,
    ease: DEFAULT_EASE,
    repetitions: 0,
    lapses: 0,
  };
}

export function isDue(schedule: CardSchedule, nowMs: number): boolean {
  return schedule.dueAt <= nowMs;
}

export function applyReviewGrade(
  schedule: CardSchedule | undefined,
  grade: ReviewGrade,
  nowMs: number
): CardSchedule {
  const current = schedule ?? createDefaultSchedule(nowMs);

  if (grade === 'again') {
    const ease = clamp(current.ease - 0.2, MIN_EASE, MAX_EASE);
    return {
      ...current,
      ease,
      lapses: current.lapses + 1,
      repetitions: 0,
      intervalDays: 1,
      dueAt: nowMs + DAY_MS,
      lastReviewedAt: nowMs,
    };
  }

  if (grade === 'hard') {
    const base = Math.max(1, current.intervalDays || 1);
    const intervalDays = Math.max(1, Math.round(base * 1.2));
    const ease = clamp(current.ease - 0.15, MIN_EASE, MAX_EASE);
    return {
      ...current,
      ease,
      repetitions: current.repetitions + 1,
      intervalDays,
      dueAt: nowMs + intervalDays * DAY_MS,
      lastReviewedAt: nowMs,
    };
  }

  if (grade === 'guess') {
    const base = Math.max(1, current.intervalDays || 1);
    const intervalDays = Math.max(1, Math.round(base * Math.max(1.15, current.ease * 0.75)));
    const ease = clamp(current.ease - 0.05, MIN_EASE, MAX_EASE);
    return {
      ...current,
      ease,
      repetitions: current.repetitions + 1,
      intervalDays,
      dueAt: nowMs + intervalDays * DAY_MS,
      lastReviewedAt: nowMs,
    };
  }

  const base = current.repetitions <= 1 ? 1 : Math.max(1, current.intervalDays || 1);
  const intervalDays =
    current.repetitions <= 1
      ? 2
      : Math.max(1, Math.round(base * current.ease));
  const ease = clamp(current.ease + 0.05, MIN_EASE, MAX_EASE);
  return {
    ...current,
    ease,
    repetitions: current.repetitions + 1,
    intervalDays,
    dueAt: nowMs + intervalDays * DAY_MS,
    lastReviewedAt: nowMs,
  };
}
