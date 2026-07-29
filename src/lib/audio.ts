import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { speakTts, isTtsAvailable, cancelTts } from './tts';
import type { PracticeLanguage } from '../types/practiceLanguage';

/** Playback rates: 0.5, 1.0, 1.5, 2.0 (default 1.5 per v1.1) */
export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const RATE_DEFAULT = 1.5;

/** Legacy / optional: decode, baseline, challenge */
export const RATE_DECODE = 0.75;
export const RATE_BASELINE = 1.0;
export const RATE_CHALLENGE = 1.25;

/** Pause between the set-speed play and the follow-up 1x play in playWordAudioTwice. */
const SEQUENCE_PAUSE_MS = 450;

type WordLike = { term: string; audioUrl?: string; language?: PracticeLanguage };

let sequenceToken = 0;
let pendingSequenceTimeout: ReturnType<typeof setTimeout> | null = null;

function clearPendingSequence(): void {
  if (pendingSequenceTimeout) {
    clearTimeout(pendingSequenceTimeout);
    pendingSequenceTimeout = null;
  }
}

/**
 * Stop any current word audio (TTS or expo-av). No overlapping audio.
 */
export function stopWordAudio(): void {
  sequenceToken += 1;
  clearPendingSequence();
  cancelTts();
  void unloadCurrentSound();
}

let sound: Audio.Sound | null = null;

async function unloadCurrentSound(): Promise<void> {
  if (sound) {
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
    sound = null;
  }
}

/**
 * Play word audio: prefers a recorded audioUrl (expo-av, works on web and native)
 * and falls back to Web Speech TTS on web (PWA) when no audioUrl is available.
 * Rate is applied to TTS and can be set on native Sound when supported.
 */
export function playWordAudio(word: WordLike | null | undefined, rate: number = RATE_DEFAULT): void {
  if (!word?.term) return;

  if (word.audioUrl) {
    void playWordAudioUrl(word.audioUrl, rate);
    return;
  }

  if (Platform.OS === 'web' && isTtsAvailable()) {
    speakTts(word.term, rate, word.language ?? 'pt');
  }
}

export async function playWordAudioUrl(
  audioUrl: string,
  rate: number = RATE_DEFAULT,
  onFinish?: () => void
): Promise<void> {
  if (!audioUrl) {
    onFinish?.();
    return;
  }
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: true, rate, shouldCorrectPitch: true }
    );
    sound = s;
    s.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        s.unloadAsync();
        sound = null;
        onFinish?.();
      }
    });
  } catch {
    onFinish?.();
  }
}

/**
 * Auto-play sequence for a card: plays once at `rate` (the user's set speed),
 * then after a slight pause, once more at `secondRate` (defaults to normal 1x
 * speed). Skips the second play if it would be identical to the first.
 * Cancelled by stopWordAudio() if the card changes mid-sequence.
 */
export function playWordAudioTwice(
  word: WordLike | null | undefined,
  rate: number,
  secondRate: number = RATE_BASELINE
): void {
  if (!word?.term) return;

  const token = ++sequenceToken;
  clearPendingSequence();

  const onFirstEnd = () => {
    if (token !== sequenceToken || secondRate === rate) return;
    pendingSequenceTimeout = setTimeout(() => {
      pendingSequenceTimeout = null;
      if (token !== sequenceToken) return;
      playWordAudio(word, secondRate);
    }, SEQUENCE_PAUSE_MS);
  };

  if (word.audioUrl) {
    void playWordAudioUrl(word.audioUrl, rate, onFirstEnd);
    return;
  }

  if (Platform.OS === 'web' && isTtsAvailable()) {
    speakTts(word.term, rate, word.language ?? 'pt', onFirstEnd);
  }
}
