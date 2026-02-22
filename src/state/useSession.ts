import { useCallback, useRef, useState } from 'react';
import type { SessionState } from '../types/session';
import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getShuffledWordIds, getDistractors, getWordsForLanguage } from '../data/words';
import { getSpacedRepetitionMap, saveSpacedRepetitionMap } from '../lib/storage';
import {
  applyReviewGrade,
  createDefaultSchedule,
  isDue,
  type CardSchedule,
  type ReviewGrade,
} from '../lib/spacedRepetition';

type StartSessionOptions = {
  cardCount: number;
  customWords?: Word[];
  language?: PracticeLanguage;
};

type StartSessionInput = number | StartSessionOptions;
type SessionSelectionStats = {
  dueAvailable: number;
  newAvailable: number;
  selectedDue: number;
  selectedNew: number;
};

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
    guessedCount: 0,
    deckCount: queue.length,
    startedAt: Date.now(),
    cleared: isEmpty,
    currentCardId: queue[0] ?? null,
    uiState: 'PROMPT',
    currentCardWasGuess: false,
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
    return { cardCount: Math.max(0, Math.floor(input)), customWords: [], language: 'pt' };
  }
  return {
    cardCount: Math.max(0, Math.floor(input.cardCount)),
    customWords: input.customWords ?? [],
    language: input.language ?? 'pt',
  };
}

function sanitizeCustomWords(words: Word[]): Word[] {
  const out: Word[] = [];
  const seen = new Set<string>();
  for (const word of words) {
    const id = normalizeMaybeText(word.id);
    const term = normalizeMaybeText(word.term);
    if (!id || !term || seen.has(id)) continue;
    seen.add(id);
    out.push({
      ...word,
      id,
      term,
      en: normalizeMaybeText(word.en),
      pronHintEn: normalizeMaybeText(word.pronHintEn),
      isCustom: true,
    });
  }
  return out;
}

async function buildSessionDeck(options: StartSessionOptions): Promise<{
  deck: Word[];
  schedules: Record<string, CardSchedule>;
  selectionStats: SessionSelectionStats;
}> {
  const nowMs = Date.now();
  const defaultDeck = getWordsForLanguage(options.language ?? 'pt');
  const schedules = await getSpacedRepetitionMap(options.language ?? 'pt');
  const byId = new Map(defaultDeck.map((word) => [word.id, word]));

  const selectedByShuffle = getShuffledWordIds()
    .map((id) => byId.get(id))
    .filter((word): word is Word => word != null);
  const dueWords: Word[] = [];
  const newWords: Word[] = [];
  const futureWords: Word[] = [];
  for (const word of selectedByShuffle) {
    const schedule = schedules[word.id];
    if (!schedule) {
      newWords.push(word);
      continue;
    }
    if (isDue(schedule, nowMs)) {
      dueWords.push(word);
      continue;
    }
    futureWords.push(word);
  }

  dueWords.sort((a, b) => (schedules[a.id]?.dueAt ?? 0) - (schedules[b.id]?.dueAt ?? 0));
  futureWords.sort((a, b) => (schedules[a.id]?.dueAt ?? 0) - (schedules[b.id]?.dueAt ?? 0));

  const selectedDue = dueWords.slice(0, options.cardCount);
  const remainingAfterDue = Math.max(0, options.cardCount - selectedDue.length);
  const selectedNew = newWords.slice(0, remainingAfterDue);
  const remainingAfterNew = Math.max(0, remainingAfterDue - selectedNew.length);
  const selectedFuture = futureWords.slice(0, remainingAfterNew);
  const defaultWords = [...selectedDue, ...selectedNew, ...selectedFuture];

  const customWords = sanitizeCustomWords(options.customWords ?? []);
  const customOrdered = [...customWords].sort((a, b) => {
    const aSchedule = schedules[a.id] ?? createDefaultSchedule(nowMs);
    const bSchedule = schedules[b.id] ?? createDefaultSchedule(nowMs);
    return aSchedule.dueAt - bSchedule.dueAt;
  });
  return {
    deck: shuffleArray([...defaultWords, ...customOrdered]),
    schedules,
    selectionStats: {
      dueAvailable: dueWords.length,
      newAvailable: newWords.length,
      selectedDue: selectedDue.length,
      selectedNew: selectedNew.length,
    },
  };
}

export function useSession() {
  const [state, setState] = useState<SessionState | null>(null);
  const clearedAtMs = useRef<number | null>(null);
  const deckRef = useRef<Word[]>([]);
  const deckByIdRef = useRef<Map<string, Word>>(new Map());
  const previousOptionsRef = useRef<StartSessionOptions | null>(null);
  const schedulesByIdRef = useRef<Record<string, CardSchedule>>({});
  const sessionSelectionStatsRef = useRef<SessionSelectionStats>({
    dueAvailable: 0,
    newAvailable: 0,
    selectedDue: 0,
    selectedNew: 0,
  });
  const lastReviewRef = useRef<{ wordId: string; grade: ReviewGrade; schedule: CardSchedule } | null>(null);
  const startRequestIdRef = useRef(0);

  const remaining = state ? getRemaining(state) : 0;
  const currentWord = state?.currentCardId
    ? deckByIdRef.current.get(state.currentCardId) ?? null
    : null;

  const persistReview = useCallback((wordId: string, grade: ReviewGrade) => {
    const nowMs = Date.now();
    const nextSchedule = applyReviewGrade(schedulesByIdRef.current[wordId], grade, nowMs);
    const nextMap = { ...schedulesByIdRef.current, [wordId]: nextSchedule };
    schedulesByIdRef.current = nextMap;
    lastReviewRef.current = { wordId, grade, schedule: nextSchedule };
    const language = previousOptionsRef.current?.language ?? 'pt';
    void saveSpacedRepetitionMap(nextMap, language);
  }, []);

  const startFromOptions = useCallback(async (input: StartSessionInput) => {
    const requestId = startRequestIdRef.current + 1;
    startRequestIdRef.current = requestId;
    const options = normalizeStartSessionInput(input);
    const { deck, schedules, selectionStats } = await buildSessionDeck(options);
    if (requestId !== startRequestIdRef.current) return;
    deckRef.current = deck;
    deckByIdRef.current = new Map(deck.map((word) => [word.id, word]));
    schedulesByIdRef.current = schedules;
    sessionSelectionStatsRef.current = selectionStats;
    lastReviewRef.current = null;
    previousOptionsRef.current = options;
    clearedAtMs.current = null;
    setState(createInitialStateFromDeck(deck));
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
        currentCardWasGuess: false,
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
      persistReview(id, 'again');
      return {
        ...prev,
        queue: newQueue,
        skippedCount: prev.skippedCount + 1,
        uiState: 'REVEAL_DONT_KNOW',
        currentCardWasGuess: false,
      };
    });
  }, [persistReview]);

  const swipeUp = useCallback(() => {
    setState((prev) => {
      if (!prev || prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const word = deckByIdRef.current.get(prev.currentCardId);
      const correctEn = normalizeMaybeText(word?.en);
      if (!correctEn) return prev;
      const distractors = getDistractors(
        correctEn,
        2,
        prev.currentCardId,
        deckRef.current,
        word
      );
      const options = shuffleArray([correctEn, ...distractors]);
      const correctChoiceIndex = options.indexOf(correctEn);
      return {
        ...prev,
        uiState: 'CHOICES',
        choiceOptions: options,
        correctChoiceIndex,
        guessedCount: prev.guessedCount + 1,
        currentCardWasGuess: true,
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
        deckRef.current,
        word
      );
      const options = shuffleArray([correctEn, ...distractors]);
      const correctChoiceIndex = options.indexOf(correctEn);
      return {
        ...prev,
        uiState: 'CHOICES',
        choiceOptions: options,
        correctChoiceIndex,
        currentCardWasGuess: false,
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
        persistReview(id, prev.currentCardWasGuess ? 'guess' : 'good');
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
          currentCardWasGuess: false,
          cleared,
        };
      }

      const id = prev.currentCardId;
      const newQueue = [...prev.queue.filter((x) => x !== id), id];
      persistReview(id, 'hard');
      return {
        ...prev,
        queue: newQueue,
        incorrectCount: prev.incorrectCount + 1,
        uiState: 'FEEDBACK_WRONG',
        selectedChoiceIndex: choiceIndex,
        correctChoiceIndex: correctIndex,
        currentCardWasGuess: false,
      };
    });
  }, [persistReview]);

  const startSession = useCallback((input: StartSessionInput) => {
    void startFromOptions(input);
  }, [startFromOptions]);

  const startNewSession = useCallback((cardCount?: number) => {
    const previous = previousOptionsRef.current;
    const nextOptions: StartSessionOptions = {
      cardCount: cardCount ?? previous?.cardCount ?? 0,
      customWords: previous?.customWords ?? [],
      language: previous?.language ?? 'pt',
    };
    void startFromOptions(nextOptions);
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
    swipeUp,
    advanceToNextCard,
    getChoiceOptions,
    startSession,
    startNewSession,
    stopSession,
    getClearTimeMs,
    spacedRepetitionDebug: {
      stats: sessionSelectionStatsRef.current,
      currentCardSchedule:
        currentWord != null ? schedulesByIdRef.current[currentWord.id] ?? null : null,
      lastReview: lastReviewRef.current,
    },
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
