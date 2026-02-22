import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { isPracticeLanguage } from '../types/practiceLanguage';
import type { CardSchedule } from './spacedRepetition';

const KEY_BEST_CLEAR_MS = 'bestClearMs';
const KEY_RUNS_COUNT = 'runsCount';
const KEY_AUDIO_PLAYBACK_RATE = 'audioPlaybackRate';
const KEY_HAS_SEEN_GESTURE_DEMO = 'hasSeenGestureDemo';
const KEY_PRACTICE_LANGUAGE = 'practiceLanguage';
const KEY_CUSTOM_WORDS_LEGACY = 'customWords';
const KEY_SPACED_REPETITION_PREFIX = 'spacedRepetition:v1:';

export async function getBestClearMs(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(KEY_BEST_CLEAR_MS);
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export async function setBestClearMs(ms: number): Promise<void> {
  await AsyncStorage.setItem(KEY_BEST_CLEAR_MS, String(ms));
}

export async function getRunsCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_RUNS_COUNT);
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function incrementRunsCount(): Promise<number> {
  const count = await getRunsCount();
  const next = count + 1;
  await AsyncStorage.setItem(KEY_RUNS_COUNT, String(next));
  return next;
}

function normalizeMaybeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function toCustomWord(value: unknown): Word | null {
  if (value == null || typeof value !== 'object') return null;
  const maybe = value as Partial<Word> & { pt?: string };
  const id = normalizeMaybeString(maybe.id);
  const term = normalizeMaybeString(maybe.term) ?? normalizeMaybeString(maybe.pt);
  if (!id || !term) return null;
  return {
    id,
    term,
    en: normalizeMaybeString(maybe.en),
    pronHintEn: normalizeMaybeString(maybe.pronHintEn),
    isCustom: true,
    language: maybe.language,
  };
}

function getCustomWordsKey(language: PracticeLanguage): string {
  return `customWords:${language}`;
}

export async function getPracticeLanguage(): Promise<PracticeLanguage> {
  const raw = await AsyncStorage.getItem(KEY_PRACTICE_LANGUAGE);
  if (raw && isPracticeLanguage(raw)) return raw;
  return 'pt';
}

export async function setPracticeLanguage(language: PracticeLanguage): Promise<void> {
  await AsyncStorage.setItem(KEY_PRACTICE_LANGUAGE, language);
}

export async function getCustomWords(language: PracticeLanguage = 'pt'): Promise<Word[]> {
  const key = getCustomWordsKey(language);
  let raw = await AsyncStorage.getItem(key);
  if (raw == null && language === 'pt') {
    raw = await AsyncStorage.getItem(KEY_CUSTOM_WORDS_LEGACY);
  }
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toCustomWord)
      .filter((word): word is Word => word != null)
      .map((word) => ({ ...word, language }));
  } catch {
    return [];
  }
}

export async function saveCustomWords(words: Word[], language: PracticeLanguage = 'pt'): Promise<void> {
  const payload = words
    .filter((word) => word.isCustom && word.term.trim())
    .map((word) => ({
      id: word.id,
      term: word.term.trim(),
      en: normalizeMaybeString(word.en),
      pronHintEn: normalizeMaybeString(word.pronHintEn),
      language,
    }));
  await AsyncStorage.setItem(getCustomWordsKey(language), JSON.stringify(payload));
}

export async function clearCustomWords(language: PracticeLanguage = 'pt'): Promise<void> {
  await AsyncStorage.removeItem(getCustomWordsKey(language));
}

// --- Audio playback speed (v1.1) ---

const VALID_RATES = [0.5, 1.0, 1.5, 2.0] as const;
const DEFAULT_RATE = 0.5;

export async function getAudioPlaybackRate(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_AUDIO_PLAYBACK_RATE);
  if (raw == null) return DEFAULT_RATE;
  const n = parseFloat(raw);
  return VALID_RATES.includes(n as (typeof VALID_RATES)[number]) ? n : DEFAULT_RATE;
}

export async function setAudioPlaybackRate(rate: number): Promise<void> {
  const value = VALID_RATES.includes(rate as (typeof VALID_RATES)[number]) ? rate : DEFAULT_RATE;
  await AsyncStorage.setItem(KEY_AUDIO_PLAYBACK_RATE, String(value));
}

/** Cycle: 0.5 → 1.0 → 1.5 → 2.0 → repeat */
export function cycleAudioPlaybackRate(current: number): number {
  const i = VALID_RATES.indexOf(current as (typeof VALID_RATES)[number]);
  const next = i < 0 ? DEFAULT_RATE : VALID_RATES[(i + 1) % VALID_RATES.length];
  return next;
}

// --- Gesture demo (v1.1) ---

export async function getHasSeenGestureDemo(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(KEY_HAS_SEEN_GESTURE_DEMO);
  return raw === 'true';
}

export async function setHasSeenGestureDemo(): Promise<void> {
  await AsyncStorage.setItem(KEY_HAS_SEEN_GESTURE_DEMO, 'true');
}

function getSpacedRepetitionKey(language: PracticeLanguage): string {
  return `${KEY_SPACED_REPETITION_PREFIX}${language}`;
}

type RawScheduleMap = Record<string, Partial<CardSchedule>>;
export type SpacedRepetitionMap = Record<string, CardSchedule>;

function toValidSchedule(value: Partial<CardSchedule> | undefined): CardSchedule | null {
  if (!value) return null;
  const dueAt = typeof value.dueAt === 'number' ? value.dueAt : Date.now();
  const intervalDays = typeof value.intervalDays === 'number' ? value.intervalDays : 0;
  const ease = typeof value.ease === 'number' ? value.ease : 2.5;
  const repetitions = typeof value.repetitions === 'number' ? value.repetitions : 0;
  const lapses = typeof value.lapses === 'number' ? value.lapses : 0;
  const lastReviewedAt =
    typeof value.lastReviewedAt === 'number' ? value.lastReviewedAt : undefined;

  if (!Number.isFinite(dueAt) || !Number.isFinite(intervalDays) || !Number.isFinite(ease)) {
    return null;
  }
  return {
    dueAt,
    intervalDays: Math.max(0, intervalDays),
    ease: Math.max(1.3, Math.min(3.0, ease)),
    repetitions: Math.max(0, repetitions),
    lapses: Math.max(0, lapses),
    lastReviewedAt,
  };
}

export async function getSpacedRepetitionMap(
  language: PracticeLanguage = 'pt'
): Promise<SpacedRepetitionMap> {
  const raw = await AsyncStorage.getItem(getSpacedRepetitionKey(language));
  if (raw == null) return {};
  try {
    const parsed = JSON.parse(raw) as RawScheduleMap;
    if (parsed == null || typeof parsed !== 'object') return {};
    const out: SpacedRepetitionMap = {};
    for (const [id, schedule] of Object.entries(parsed)) {
      const normalizedId = normalizeMaybeString(id);
      if (!normalizedId) continue;
      const valid = toValidSchedule(schedule);
      if (!valid) continue;
      out[normalizedId] = valid;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveSpacedRepetitionMap(
  schedules: SpacedRepetitionMap,
  language: PracticeLanguage = 'pt'
): Promise<void> {
  await AsyncStorage.setItem(getSpacedRepetitionKey(language), JSON.stringify(schedules));
}

// --- Per-word audio adaptation (optional, local only) ---

export type WordAudioState = {
  playSlowOnce?: boolean;
  knowStreak?: number;
};

const KEY_WORD_AUDIO_PREFIX = 'wordAudio:';

export async function getWordAudioState(wordId: string): Promise<WordAudioState> {
  const raw = await AsyncStorage.getItem(KEY_WORD_AUDIO_PREFIX + wordId);
  if (raw == null) return {};
  try {
    const o = JSON.parse(raw) as WordAudioState;
    return {
      playSlowOnce: Boolean(o.playSlowOnce),
      knowStreak: typeof o.knowStreak === 'number' ? o.knowStreak : 0,
    };
  } catch {
    return {};
  }
}

export async function setWordAudioState(wordId: string, state: WordAudioState): Promise<void> {
  await AsyncStorage.setItem(KEY_WORD_AUDIO_PREFIX + wordId, JSON.stringify(state));
}

/** Record "Don't Know" (swipe left): next appearance may auto-play at 0.75x once. */
export async function recordWordDontKnow(wordId: string): Promise<void> {
  const s = await getWordAudioState(wordId);
  await setWordAudioState(wordId, { ...s, playSlowOnce: true, knowStreak: 0 });
}

/** Record "Know" (correct answer): update streak for occasional 1.25x. */
export async function recordWordKnow(wordId: string): Promise<void> {
  const s = await getWordAudioState(wordId);
  const streak = (s.knowStreak ?? 0) + 1;
  await setWordAudioState(wordId, { ...s, knowStreak: streak, playSlowOnce: false });
}

/**
 * Suggested speed for this word: 0.75 once after don't know, else 1.25 with 1/5 chance after 3+ know streak, else 1.0.
 * Consumes playSlowOnce when returning 0.75.
 */
export async function getSuggestedSpeedAndConsume(wordId: string): Promise<number> {
  const s = await getWordAudioState(wordId);
  if (s.playSlowOnce) {
    await setWordAudioState(wordId, { ...s, playSlowOnce: false });
    return 0.75;
  }
  if ((s.knowStreak ?? 0) >= 3 && Math.random() < 0.2) {
    return 1.25;
  }
  return 1.0;
}
