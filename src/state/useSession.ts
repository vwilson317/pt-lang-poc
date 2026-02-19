import { useCallback, useRef, useState } from 'react';
import type { SessionState } from '../types/session';
import {
  getShuffledWordIds,
  getDistractors,
  getWords,
} from '../data/words';

const DECK = getWords();
const DECK_COUNT = DECK.length;

function getRemaining(state: SessionState): number {
  return state.deckCount - state.correctSet.size;
}

function createInitialState(): SessionState {
  const queue = getShuffledWordIds();
  return {
    queue,
    correctSet: new Set(),
    rightCount: 0,
    wrongCount: 0,
    deckCount: DECK_COUNT,
    startedAt: Date.now(),
    cleared: false,
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

export function useSession() {
  const [state, setState] = useState<SessionState>(createInitialState);
  const clearedAtMs = useRef<number | null>(null);

  const remaining = getRemaining(state);

  const advanceToNextCard = useCallback(() => {
    setState((prev) => {
      if (prev.cleared) return prev;
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
      if (prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const id = prev.currentCardId;
      const newQueue = [...prev.queue.filter((x) => x !== id), id];
      return {
        ...prev,
        queue: newQueue,
        wrongCount: prev.wrongCount + 1,
        uiState: 'REVEAL_DONT_KNOW',
      };
    });
  }, []);

  const swipeRight = useCallback(() => {
    setState((prev) => {
      if (prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const word = DECK.find((w) => w.id === prev.currentCardId);
      const correctEn = word?.en ?? '';
      const distractors = getDistractors(correctEn, 2, prev.currentCardId);
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
      if (prev.uiState !== 'CHOICES' || prev.currentCardId === null) return prev;
      const word = DECK.find((w) => w.id === prev.currentCardId);
      const correctEn = word?.en;
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

      const newQueue = [...prev.queue.filter((x) => x !== prev.currentCardId), prev.currentCardId!];
      return {
        ...prev,
        queue: newQueue,
        wrongCount: prev.wrongCount + 1,
        uiState: 'FEEDBACK_WRONG',
        selectedChoiceIndex: choiceIndex,
        correctChoiceIndex: correctIndex,
      };
    });
  }, []);

  const startNewSession = useCallback(() => {
    clearedAtMs.current = null;
    setState(createInitialState());
  }, []);

  const getClearTimeMs = useCallback(() => {
    if (state.cleared && state.startedAt && clearedAtMs.current) {
      return clearedAtMs.current - state.startedAt;
    }
    return null;
  }, [state.cleared, state.startedAt]);

  /** Legacy: choice options are in state.choiceOptions; this avoids "getChoiceOptions is not defined" from cached bundles. */
  const getChoiceOptions = useCallback((_wordId: string) => state.choiceOptions ?? [], [state.choiceOptions]);

  return {
    state,
    remaining,
    swipeLeft,
    swipeRight,
    chooseOption,
    advanceToNextCard,
    getChoiceOptions,
    startNewSession,
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
