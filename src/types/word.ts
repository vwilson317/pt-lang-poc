export type Word = {
  id: string;
  pt: string;
  en?: string;
  audioUrl?: string;
  pronHintEn?: string;
  isCustom?: boolean;
  /** noun, verb, adjective, etc. */
  wordType?: string;
  /** masculine | feminine (if noun) */
  gender?: string;
  /** infinitive, past tense, etc. (if verb) */
  verbLabel?: string;
};
