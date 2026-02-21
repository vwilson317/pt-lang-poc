import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { speakTts, isTtsAvailable, cancelTts } from './tts';

/** Playback rates: 0.5, 1.0, 1.5, 2.0 (default 1.5 per v1.1) */
export const RATE_MIN = 0.5;
export const RATE_MAX = 2;
export const RATE_DEFAULT = 1.5;

/** Legacy / optional: decode, baseline, challenge */
export const RATE_DECODE = 0.75;
export const RATE_BASELINE = 1.0;
export const RATE_CHALLENGE = 1.25;

type WordLike = { pt: string; audioUrl?: string };

/**
 * Stop any current word audio (TTS or expo-av). No overlapping audio.
 */
export function stopWordAudio(): void {
  if (Platform.OS === 'web') {
    cancelTts();
    return;
  }
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
 * Play word audio: Web Speech TTS on web (PWA), expo-av on native when audioUrl present.
 * Rate is applied to TTS and can be set on native Sound when supported.
 */
export function playWordAudio(word: WordLike | null | undefined, rate: number = RATE_DEFAULT): void {
  if (!word?.pt) return;

  if (Platform.OS === 'web' && isTtsAvailable()) {
    speakTts(word.pt, rate);
    return;
  }

  if (word.audioUrl) {
    playWordAudioUrl(word.audioUrl, rate);
  }
}

export async function playWordAudioUrl(audioUrl: string, rate: number = RATE_DEFAULT): Promise<void> {
  if (!audioUrl) return;
  try {
    if (sound) {
      await sound.unloadAsync();
      sound = null;
    }
    const { sound: s } = await Audio.Sound.createAsync(
      { uri: audioUrl },
      { shouldPlay: true }
    );
    sound = s;
    try {
      await s.setStatusAsync({ rate });
    } catch {
      // rate not supported on this platform
    }
    s.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        s.unloadAsync();
        sound = null;
      }
    });
  } catch {
    // ignore
  }
}
