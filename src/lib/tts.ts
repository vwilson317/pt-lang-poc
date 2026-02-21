/**
 * Web Speech API TTS – PWA only.
 * Uses speechSynthesis with language-specific voice when available.
 */

import type { PracticeLanguage } from '../types/practiceLanguage';

const TTS_VOICE_BY_LANGUAGE: Record<PracticeLanguage, string> = {
  pt: 'pt-BR',
  fr: 'fr-FR',
};

function isWeb(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function cancelTts(): void {
  if (!isWeb()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function speakTts(
  text: string,
  rate: number,
  language: PracticeLanguage = 'pt'
): void {
  if (!text.trim()) return;
  if (!isWeb()) return;

  cancelTts();

  const u = new SpeechSynthesisUtterance(text.trim());
  u.lang = TTS_VOICE_BY_LANGUAGE[language];
  u.rate = rate;
  u.volume = 1;

  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

export function isTtsAvailable(): boolean {
  return isWeb();
}
