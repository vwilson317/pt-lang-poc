export type Deck = {
  id: string;
  name: string;
  isSelected: boolean;
  createdAt: number;
  updatedAt: number;
};

export type CardType = 'word' | 'sentence' | 'phrase';

export type FlashCardRecord = {
  id: string;
  deckId: string;
  cardType: CardType;
  front: string;
  back: string;
  phraseId?: string;
  wordType?: string;
  sourceClipId?: string;
  sourceSegmentId?: string;
  createdAt: number;
};

export type ClipToken = {
  text: string;
  wordType?: string;
  translation?: string;
};

export type ClipSegment = {
  id: string;
  startMs: number;
  endMs: number;
  textOriginal: string;
  textTranslated: string;
  tokens?: ClipToken[];
};

export type ClipStatus = 'PROCESSING' | 'DONE' | 'FAILED_NO_AUDIO' | 'FAILED_TOO_LONG' | 'FAILED_TRANSCODE' | 'FAILED_TRANSCRIBE';

export type ClipRecord = {
  id: string;
  sourceLanguage: 'pt' | 'en';
  targetLanguage: 'en' | 'pt';
  transcriptOriginal: string;
  transcriptTranslated: string;
  segments: ClipSegment[];
  createdAt: number;
  status?: ClipStatus;
};

export type DeckCounts = {
  total: number;
  word: number;
  sentence: number;
};
