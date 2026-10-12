import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { DECK_LENGTH, getWordByIdForLanguage, getWordsForLanguage } from './words';
import { VERB_DECK_LENGTH, getVerbDeckWords } from './verbs';

export const DEFAULT_DECK_ID = 'default';
export const VERBS_DECK_ID = 'verbs';

/** Built-in words for a deck, or an empty list for user-created decks. */
export function getBuiltInDeckWords(deckId: string | undefined, language: PracticeLanguage): Word[] {
  if (deckId === VERBS_DECK_ID) return getVerbDeckWords(language);
  if (deckId === DEFAULT_DECK_ID) return getWordsForLanguage(language);
  return [];
}

export function hasBuiltInWords(deckId: string): boolean {
  return deckId === DEFAULT_DECK_ID || deckId === VERBS_DECK_ID;
}

export function getBuiltInDeckLength(deckId: string): number {
  if (deckId === VERBS_DECK_ID) return VERB_DECK_LENGTH;
  if (deckId === DEFAULT_DECK_ID) return DECK_LENGTH;
  return 0;
}

/** Largest built-in deck (for slider max = "all"). */
export const MAX_BUILT_IN_DECK_LENGTH = Math.max(DECK_LENGTH, VERB_DECK_LENGTH);

/** Looks up a built-in word (core list or verb conjugation) by id. */
export function getBuiltInWordById(id: string, language: PracticeLanguage): Word | undefined {
  return (
    getWordByIdForLanguage(id, language) ??
    getVerbDeckWords(language).find((word) => word.id === id)
  );
}
