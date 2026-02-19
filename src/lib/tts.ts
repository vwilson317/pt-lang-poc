/**
 * Web Speech API TTS – PWA only.
 * Uses speechSynthesis with Portuguese (pt-BR) when available.
 */

const PT_BR = 'pt-BR';

function isWeb(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function cancelTts(): void {
  if (!isWeb()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}

export function speakTts(text: string, rate: number): void {
  if (!text.trim()) return;
  if (!isWeb()) return;

  cancelTts();

  const u = new SpeechSynthesisUtterance(text.trim());
  u.lang = PT_BR;
  u.rate = rate;
  u.volume = 1;

  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

export function isTtsAvailable(): boolean {
  return isWeb();
}
