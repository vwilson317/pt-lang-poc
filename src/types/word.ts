import type { PracticeLanguage } from './practiceLanguage';

export type Word = {
  id: string;
  term: string;
  en?: string;
  audioUrl?: string;
  pronHintEn?: string;
  isCustom?: boolean;
  language?: PracticeLanguage;
  /** noun, verb, adjective, etc. */
  wordType?: string;
  /** masculine | feminine (if noun) */
  gender?: string;
  /** infinitive, past tense, etc. (if verb) */
  verbLabel?: string;
};
