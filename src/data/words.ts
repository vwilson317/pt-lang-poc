import type { Word } from '../types/word';

/**
 * Static word data – local "API" for v1.
 * No database; all words in memory.
 */
const WORDS: Word[] = [
  { id: '1', pt: 'olá', en: 'hello', pronHintEn: 'oh-LAH' },
  { id: '2', pt: 'obrigado', en: 'thank you', pronHintEn: 'oh-bree-GAH-doo' },
  { id: '3', pt: 'sim', en: 'yes' },
  { id: '4', pt: 'não', en: 'no', pronHintEn: 'now' },
  { id: '5', pt: 'bom dia', en: 'good morning' },
  { id: '6', pt: 'boa noite', en: 'good night' },
  { id: '7', pt: 'por favor', en: 'please' },
  { id: '8', pt: 'desculpa', en: 'sorry / excuse me', pronHintEn: 'jesh-KOOL-pah' },
  { id: '9', pt: 'água', en: 'water', pronHintEn: 'AH-gwah' },
  { id: '10', pt: 'comida', en: 'food' },
  { id: '11', pt: 'casa', en: 'house / home' },
  { id: '12', pt: 'amor', en: 'love' },
  { id: '13', pt: 'família', en: 'family', pronHintEn: 'fah-MEE-lyah' },
  { id: '14', pt: 'amigo', en: 'friend (m)' },
  { id: '15', pt: 'amiga', en: 'friend (f)' },
  { id: '16', pt: 'tudo bem', en: 'all good / how are you' },
  { id: '17', pt: 'até logo', en: 'see you later' },
  { id: '18', pt: 'bom', en: 'good (m)' },
  { id: '19', pt: 'boa', en: 'good (f)' },
  { id: '20', pt: 'grande', en: 'big / great' },
  { id: '21', pt: 'pequeno', en: 'small', pronHintEn: 'peh-KEH-noo' },
  { id: '22', pt: 'novo', en: 'new' },
  { id: '23', pt: 'velho', en: 'old' },
  { id: '24', pt: 'bebida', en: 'drink' },
  { id: '25', pt: 'café', en: 'coffee', pronHintEn: 'kah-FEH' },
];

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Returns all words. In v1 this is the "deck". */
export function getWords(): Word[] {
  return [...WORDS];
}

/** Returns word by id, or undefined. */
export function getWordById(id: string): Word | undefined {
  return WORDS.find((w) => w.id === id);
}

/** Returns a new shuffled array of all word IDs for session start. */
export function getShuffledWordIds(): string[] {
  return shuffle(WORDS.map((w) => w.id));
}

/** Pick N random distractors (other words' en) excluding excludeEn. */
export function getDistractors(
  correctEn: string,
  count: number,
  excludeId?: string
): string[] {
  const others = WORDS.filter(
    (w) => w.en && w.en !== correctEn && w.id !== excludeId
  );
  const shuffled = shuffle(others);
  const enValues = new Set<string>();
  for (const w of shuffled) {
    if (w.en) enValues.add(w.en);
    if (enValues.size >= count) break;
  }
  return [...enValues].slice(0, count);
}
