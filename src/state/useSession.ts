import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionState } from '../types/session';
import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getShuffledWordIds, getDistractors, getWordsForLanguage } from '../data/words';
import { addKnownWordId, getKnownWordIds, getSpacedRepetitionMap, saveSpacedRepetitionMap } from '../lib/storage';
import { moveWordToKnownDeck } from '../lib/v11Storage';
import { trackEvent } from '../lib/analytics';
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
  includeDefaultWords?: boolean;
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

function normalizeAnswerText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

function stripParentheticalText(value: string): string {
  return value.replace(/\([^)]*\)/g, ' ');
}

function splitMeaningVariants(value: string): string[] {
  const withoutParens = stripParentheticalText(value)
    .replace(/\s+or\s+/gi, '/')
    .replace(/[;|]/g, '/')
    .trim();
  if (!withoutParens) return [];

  const rawParts = withoutParens
    .split(/[\/,]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (rawParts.length <= 1) return [normalizeAnswerText(withoutParens)];

  const first = rawParts[0];
  const firstHasTo = /^to\s+/i.test(first);
  const out = new Set<string>();
  for (const part of rawParts) {
    out.add(normalizeAnswerText(part));
    if (firstHasTo && !/^to\s+/i.test(part)) {
      out.add(normalizeAnswerText(`to ${part}`));
    }
  }
  return Array.from(out).filter(Boolean);
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;
  const prev = new Array(right.length + 1);
  const next = new Array(right.length + 1);
  for (let j = 0; j <= right.length; j += 1) prev[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    next[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost
      );
    }
    for (let j = 0; j <= right.length; j += 1) prev[j] = next[j];
  }
  return prev[right.length];
}

function isAnswerCloseEnough(typed: string, expected: string): boolean {
  if (!typed || !expected) return false;
  if (typed === expected) return true;
  if (typed.length >= 4 && expected.includes(typed)) return true;
  if (expected.length >= 4 && typed.includes(expected)) return true;
  const maxLen = Math.max(typed.length, expected.length);
  const allowedDistance = maxLen <= 5 ? 1 : maxLen <= 10 ? 2 : 3;
  return levenshteinDistance(typed, expected) <= allowedDistance;
}

function isTypedAnswerCorrect(typedAnswer: string, correctAnswer: string): boolean {
  const normalizedTyped = normalizeAnswerText(stripParentheticalText(typedAnswer));
  if (!normalizedTyped) return false;
  const variants = splitMeaningVariants(correctAnswer);
  const normalizedVariants = variants.length > 0
    ? variants
    : [normalizeAnswerText(stripParentheticalText(correctAnswer))];
  return normalizedVariants.some((expected) => isAnswerCloseEnough(normalizedTyped, expected));
}

function normalizeStartSessionInput(input: StartSessionInput): StartSessionOptions {
  if (typeof input === 'number') {
    return {
      cardCount: Math.max(0, Math.floor(input)),
      customWords: [],
      language: 'pt',
      includeDefaultWords: true,
    };
  }
  return {
    cardCount: Math.max(0, Math.floor(input.cardCount)),
    customWords: input.customWords ?? [],
    language: input.language ?? 'pt',
    includeDefaultWords: input.includeDefaultWords ?? true,
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
  const language = options.language ?? 'pt';
  const defaultDeck = options.includeDefaultWords === false ? [] : getWordsForLanguage(language);
  const knownWordIds = await getKnownWordIds(language);
  const schedules = await getSpacedRepetitionMap(language);
  const filteredDefaultDeck = defaultDeck.filter((word) => !knownWordIds.has(word.id));
  const byId = new Map(filteredDefaultDeck.map((word) => [word.id, word]));

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
  const delayedSpellingSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const markWordKnown = useCallback((wordId: string) => {
    const language = previousOptionsRef.current?.language ?? 'pt';
    const word = deckByIdRef.current.get(wordId);
    if (!word || word.isCustom) return;
    void addKnownWordId(wordId, language);
    void moveWordToKnownDeck(word);
  }, []);

  const startFromOptions = useCallback(async (input: StartSessionInput) => {
    if (delayedSpellingSuccessTimerRef.current) {
      clearTimeout(delayedSpellingSuccessTimerRef.current);
      delayedSpellingSuccessTimerRef.current = null;
    }
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
    void trackEvent('session_started', {
      language: options.language ?? 'pt',
      card_count_requested: options.cardCount,
      deck_size: deck.length,
      due_selected: selectionStats.selectedDue,
      new_selected: selectionStats.selectedNew,
      custom_words: (options.customWords ?? []).length,
    });
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

  const swipeRight = useCallback((typedAnswer?: string) => {
    if (!state || state.uiState !== 'PROMPT' || !state.currentCardId) return;
    const currentCardId = state.currentCardId;
    const word = deckByIdRef.current.get(currentCardId);
    const correctEn = normalizeMaybeText(word?.en);
    const normalizedTypedAnswer = normalizeMaybeText(typedAnswer);

    if (correctEn && normalizedTypedAnswer && isTypedAnswerCorrect(normalizedTypedAnswer, correctEn)) {
      void trackEvent('swipe_right_input_successful_match', {
        word_id: currentCardId,
        language: previousOptionsRef.current?.language ?? 'pt',
        typed_length: normalizedTypedAnswer.length,
      });
      if (delayedSpellingSuccessTimerRef.current) {
        clearTimeout(delayedSpellingSuccessTimerRef.current);
      }
      delayedSpellingSuccessTimerRef.current = setTimeout(() => {
        delayedSpellingSuccessTimerRef.current = null;
        setState((prev) => {
          if (!prev || prev.uiState !== 'PROMPT' || prev.currentCardId !== currentCardId) return prev;
          const id = prev.currentCardId;
          const newQueue = prev.queue.filter((x) => x !== id);
          const newCorrectSet = new Set(prev.correctSet);
          newCorrectSet.add(id);
          persistReview(id, 'good');
          markWordKnown(id);
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
            currentCardWasGuess: false,
            cleared,
          };
        });
      }, 500);
      return;
    }

    setState((prev) => {
      if (!prev || prev.uiState !== 'PROMPT' || !prev.currentCardId) return prev;
      const nextWord = deckByIdRef.current.get(prev.currentCardId);
      const nextCorrectEn = normalizeMaybeText(nextWord?.en);
      if (!nextCorrectEn) {
        const id = prev.currentCardId;
        const newQueue = prev.queue.filter((x) => x !== id);
        const newCorrectSet = new Set(prev.correctSet);
        newCorrectSet.add(id);
        markWordKnown(id);
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
        nextCorrectEn,
        2,
        prev.currentCardId,
        deckRef.current,
        nextWord
      );
      const options = shuffleArray([nextCorrectEn, ...distractors]);
      const correctChoiceIndex = options.indexOf(nextCorrectEn);
      return {
        ...prev,
        uiState: 'CHOICES',
        choiceOptions: options,
        correctChoiceIndex,
        currentCardWasGuess: false,
      };
    });
  }, [markWordKnown, persistReview, state]);

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
        markWordKnown(id);
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
  }, [markWordKnown, persistReview]);

  const startSession = useCallback((input: StartSessionInput) => {
    void startFromOptions(input);
  }, [startFromOptions]);

  const startNewSession = useCallback((cardCount?: number) => {
    const previous = previousOptionsRef.current;
    const nextOptions: StartSessionOptions = {
      cardCount: cardCount ?? previous?.cardCount ?? 0,
      customWords: previous?.customWords ?? [],
      language: previous?.language ?? 'pt',
      includeDefaultWords: previous?.includeDefaultWords ?? true,
    };
    void startFromOptions(nextOptions);
  }, [startFromOptions]);

  const stopSession = useCallback(() => {
    if (delayedSpellingSuccessTimerRef.current) {
      clearTimeout(delayedSpellingSuccessTimerRef.current);
      delayedSpellingSuccessTimerRef.current = null;
    }
    clearedAtMs.current = null;
    setState(null);
  }, []);

  const getClearTimeMs = useCallback(() => {
    if (!state || !state.cleared || !state.startedAt || !clearedAtMs.current) return null;
    return clearedAtMs.current - state.startedAt;
  }, [state?.cleared, state?.startedAt]);

  /** Legacy: choice options are in state.choiceOptions; this avoids "getChoiceOptions is not defined" from cached bundles. */
  const getChoiceOptions = useCallback((_wordId: string) => state?.choiceOptions ?? [], [state?.choiceOptions]);

  useEffect(() => {
    return () => {
      if (delayedSpellingSuccessTimerRef.current) {
        clearTimeout(delayedSpellingSuccessTimerRef.current);
        delayedSpellingSuccessTimerRef.current = null;
      }
    };
  }, []);

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
