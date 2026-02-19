export type UIState =
  | 'PROMPT'
  | 'REVEAL_DONT_KNOW'
  | 'CHOICES'
  | 'FEEDBACK_CORRECT'
  | 'FEEDBACK_WRONG';

export type SessionState = {
  queue: string[];
  correctSet: Set<string>;
  rightCount: number;
  wrongCount: number;
  deckCount: number;
  startedAt: number;
  cleared: boolean;
  currentCardId: string | null;
  uiState: UIState;
  /** For CHOICES / feedback: selected option index */
  selectedChoiceIndex?: number;
  /** Index of correct answer in choiceOptions */
  correctChoiceIndex?: number;
  /** Ordered options for CHOICES (correct at correctChoiceIndex) */
  choiceOptions?: string[];
};
