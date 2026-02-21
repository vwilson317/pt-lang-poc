import { useCallback, useRef, useState } from 'react';
import type { SessionState } from '../types/session';
import type { Word } from '../types/word';
import { getShuffledWordIds, getDistractors, getWords } from '../data/words';

type StartSessionOptions = {
  cardCount: number;
  customWords?: Word[];
};

type StartSessionInput = number | StartSessionOptions;

function getRemaining(state: SessionState): number {
  return state.deckCount - state.correctSet.size;
}

function createInitialStateFromDeck(deck: Word[]): SessionState {
  const queue = shuffleArray(deck.map((word) => word.id));
  const isEmpty = queue.length === 0;
  return {
    queue,
    correctSet: new Set(),
    rightCount: 0,
    incorrectCount: 0,
    skippedCount: 0,
    deckCount: queue.length,
    startedAt: Date.now(),
    cleared: isEmpty,
    currentCardId: queue[0] ?? null,
    uiState: 'PROMPT',
  };
}

/** Pop from queue until we get an ID not in correctSet. Returns that ID or null. */
function peekNextCardId(state: SessionState): string | null {
  const { queue, correctSet } = state;
  for (const id of queue) {
    if (!correctSet.has(id)) return id;
  }
  return null;
}

function normalizeMaybeText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStartSessionInput(input: StartSessionInput): StartSessionOptions {
  if (typeof input === 'number') {
    return { cardCount: Math.max(0, Math.floor(input)), customWords: [] };
  }
  return {
    cardCount: Math.max(0, Math.floor(input.cardCount)),
    customWords: input.customWords ?? [],
  };
}

function sanitizeCustomWords(words: Word[]): Word[] {
  const out: Word[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const id = normalizeMaybeText(word.id);
    const pt = normalizeMaybeText(word.pt);
    if (!id || !pt || seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...word,
      id,
      pt,
      en: normalizeMaybeText(word.en),
      pronHintEn: normalizeMaybeText(word.pronHintEn),
      isCustom: true,
    });
  }
  return out;
}

function buildSessionDeck(options: StartSessionOptions): Word[] {
  const defaultDeck = getWords();
  const byId = new Map(defaultDeck.map((word) => [word.id, word]));
  const defaultWords = getShuffledWordIds(options.cardCount)
    .map((id) => byId.get(id))
    .filter((word): word is Word => word != null);
  const customWords = sanitizeCustomWords(options.customWords ?? []);
  return shuffleArray([...defaultWords, ...customWords]);
}

export function useSession() {
  const [state, setState] = useState<SessionState | null>(null);
  const clearedAtMs = useRef<number | null>(null);
  const deckRef = useRef<Word[]>([]);
  const deckByIdRef = useRef<Map<string, Word>>(new Map());
  const previousOptionsRef = useRef<StartSessionOptions | null>(null);

  const remaining = state ? getRemaining(state) : 0;
  const currentWord = state?.currentCardId
    ? deckByIdRef.current.get(state.currentCardId) ?? null
    : null;

  const startFromOptions = useCallback((input: StartSessionInput) => {
    const options = normalizeStartSessionInput(input);
    const nextDeck = buildSessionDeck(options);
    deckRef.current = nextDeck;
    deckByIdRef.current = new Map(nextDeck.map((word) => [word.id, word]));
    previousOptionsRef.current = options;
    clearedAtMs.current = null;
    setState(createInitialStateFromDeck(nextDeck));
  }, []);

  const advanceToNextCard = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.cleared) return prev;
      const nextId = peekNextCardId(prev);
      if (nextId === null) {
        return {
          ...prev,
          currentCardId: null,
          cleared: true,
          uiState: 'PROMPT',
        };
      }
      return {
        ...prev,
        currentCardId: nextId,
        uiState: 'PROMPT',
        selectedChoiceIndex: undefined,
        correctChoiceIndex: undefined,
        choiceOptions: undefined,
      };
    });
  }, []);

  const swipeLeft = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const id = prev.currentCardId;
      const newQueue = [...prev.queue.filter((x) => x !== id), id];
      return {
        ...prev,
        queue: newQueue,
        skippedCount: prev.skippedCount + 1,
        uiState: 'REVEAL_DONT_KNOW',
      };
    });
  }, []);

  const swipeRight = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const word = deckByIdRef.current.get(prev.currentCardId);
      const correctEn = normalizeMaybeText(word?.en);
      if (!correctEn) {
        const id = prev.currentCardId;
        const newQueue = prev.queue.filter((x) => x !== id);
        const newCorrectSet = new Set(prev.correctSet);
        newCorrectSet.add(id);
        const cleared = newCorrectSet.size === prev.deckCount;
        if (cleared) clearedAtMs.current = Date.now();
        return {
          ...prev,
          queue: newQueue,
          correctSet: newCorrectSet,
          rightCount: prev.rightCount + 1,
          uiState: 'FEEDBACK_CORRECT',
          selectedChoiceIndex: undefined,
          correctChoiceIndex: undefined,
          choiceOptions: undefined,
          cleared,
        };
      }
      const distractors = getDistractors(
        correctEn,
        2,
        prev.currentCardId,
        deckRef.current
      );
      const options = shuffleArray([correctEn, ...distractors]);
      const correctChoiceIndex = options.indexOf(correctEn);
      return {
        ...prev,
        uiState: 'CHOICES',
        choiceOptions: options,
        correctChoiceIndex,
      };
    });
  }, []);

  const chooseOption = useCallback((choiceIndex: number) => {
    setState((prev) => {
      if (!prev || prev.uiState !== 'CHOICES' || prev.currentCardId === null) return prev;
      const word = deckByIdRef.current.get(prev.currentCardId);
      const correctEn = normalizeMaybeText(word?.en);
      if (!correctEn) return prev;

      const correctIndex = prev.correctChoiceIndex ?? 0;
      const isCorrect = choiceIndex === correctIndex;

      if (isCorrect) {
        const id = prev.currentCardId;
        const newQueue = prev.queue.filter((x) => x !== id);
        const newCorrectSet = new Set(prev.correctSet);
        newCorrectSet.add(id);
        const cleared = newCorrectSet.size === prev.deckCount;
        if (cleared) clearedAtMs.current = Date.now();
        return {
          ...prev,
          queue: newQueue,
          correctSet: newCorrectSet,
          rightCount: prev.rightCount + 1,
          uiState: 'FEEDBACK_CORRECT',
          selectedChoiceIndex: choiceIndex,
          correctChoiceIndex: correctIndex,
          cleared,
        };
      }

      const id = prev.currentCardId;
      const newQueue = [...prev.queue.filter((x) => x !== id), id];
      return {
        ...prev,
        queue: newQueue,
        incorrectCount: prev.incorrectCount + 1,
        uiState: 'FEEDBACK_WRONG',
        selectedChoiceIndex: choiceIndex,
        correctChoiceIndex: correctIndex,
      };
    });
  }, []);

  const startSession = useCallback((input: StartSessionInput) => {
    startFromOptions(input);
  }, [startFromOptions]);

  const startNewSession = useCallback((cardCount?: number) => {
    const previous = previousOptionsRef.current;
    const nextOptions: StartSessionOptions = {
      cardCount: cardCount ?? previous?.cardCount ?? 0,
      customWords: previous?.customWords ?? [],
    };
    startFromOptions(nextOptions);
  }, [startFromOptions]);

  const stopSession = useCallback(() => {
    clearedAtMs.current = null;
    setState(null);
  }, []);

  const getClearTimeMs = useCallback(() => {
    if (!state || !state.cleared || !state.startedAt || !clearedAtMs.current) return null;
    return clearedAtMs.current - state.startedAt;
  }, [state?.cleared, state?.startedAt]);

  /** Legacy: choice options are in state.choiceOptions; this avoids "getChoiceOptions is not defined" from cached bundles. */
  const getChoiceOptions = useCallback((_wordId: string) => state?.choiceOptions ?? [], [state?.choiceOptions]);

  return {
    state,
    currentWord,
    remaining,
    swipeLeft,
    swipeRight,
    chooseOption,
    advanceToNextCard,
    getChoiceOptions,
    startSession,
    startNewSession,
    stopSession,
    getClearTimeMs,
  };
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
