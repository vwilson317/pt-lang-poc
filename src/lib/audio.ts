import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { speakTts, isTtsAvailable } from './tts';

/** Playback rates per PWA spec: 0.75 decode, 1.0 baseline, 1.25 challenge */
export const RATE_DECODE = 0.75;
export const RATE_BASELINE = 1.0;
export const RATE_CHALLENGE = 1.25;

type WordLike = { pt: string; audioUrl?: string };

/**
 * Play word audio: Web Speech TTS on web (PWA), expo-av on native when audioUrl present.
 * Rate is used only for TTS (0.75 | 1.0 | 1.25).
 */
export function playWordAudio(word: WordLike | null | undefined, rate: number = RATE_BASELINE): void {
  if (!word?.pt) return;

  if (Platform.OS === 'web' && isTtsAvailable()) {
    speakTts(word.pt, rate);
    return;
  }

  if (word.audioUrl) {
    playWordAudioUrl(word.audioUrl);
  }
}

let sound: Audio.Sound | null = null;

export async function playWordAudioUrl(audioUrl: string): Promise<void> {
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
