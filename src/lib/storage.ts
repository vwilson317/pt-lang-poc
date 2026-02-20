import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Word } from '../types/word';

const KEY_BEST_CLEAR_MS = 'bestClearMs';
const KEY_RUNS_COUNT = 'runsCount';
const KEY_CUSTOM_WORDS = 'customWords';

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
  const maybe = value as Partial<Word>;
  const id = normalizeMaybeString(maybe.id);
  const pt = normalizeMaybeString(maybe.pt);
  if (!id || !pt) return null;
  return {
    id,
    pt,
    en: normalizeMaybeString(maybe.en),
    pronHintEn: normalizeMaybeString(maybe.pronHintEn),
    isCustom: true,
  };
}

export async function getCustomWords(): Promise<Word[]> {
  const raw = await AsyncStorage.getItem(KEY_CUSTOM_WORDS);
  if (raw == null) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(toCustomWord)
      .filter((word): word is Word => word != null);
  } catch {
    return [];
  }
}

export async function saveCustomWords(words: Word[]): Promise<void> {
  const payload = words
    .filter((word) => word.isCustom && word.pt.trim())
    .map((word) => ({
      id: word.id,
      pt: word.pt.trim(),
      en: normalizeMaybeString(word.en),
      pronHintEn: normalizeMaybeString(word.pronHintEn),
    }));
  await AsyncStorage.setItem(KEY_CUSTOM_WORDS, JSON.stringify(payload));
}

export async function clearCustomWords(): Promise<void> {
  await AsyncStorage.removeItem(KEY_CUSTOM_WORDS);
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
