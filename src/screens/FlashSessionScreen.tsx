import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  TextInput,
  ScrollView,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import Slider from '@react-native-community/slider';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HeaderHUD } from '../components/HeaderHUD';
import { FlashCard } from '../components/FlashCard';
import { CompletionModal } from '../components/CompletionModal';
import { StopSessionModal } from '../components/StopSessionModal';
import { GestureDemoOverlay } from '../components/GestureDemoOverlay';
import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getPracticeLanguageLabel } from '../types/practiceLanguage';
import { useSession } from '../state/useSession';
import { getWordByIdForLanguage, DECK_LENGTH } from '../data/words';
import {
  addCards,
  createDeck,
  getDecks,
  getSelectedDeckId,
  setSelectedDeck,
} from '../lib/v11Storage';
import {
  getBestClearMs,
  setBestClearMs,
  incrementRunsCount,
  recordWordDontKnow,
  recordWordKnow,
  getCustomWords,
  saveCustomWords,
  clearCustomWords,
  getPracticeLanguage,
  getAudioPlaybackRate,
  setAudioPlaybackRate,
  cycleAudioPlaybackRate,
  getHasSeenGestureDemo,
  setHasSeenGestureDemo,
  setHasActivePracticeSession,
} from '../lib/storage';
import { playWordAudio, stopWordAudio } from '../lib/audio';
import { trackEvent } from '../lib/analytics';
import { theme } from '../theme';
import type { Deck, FlashCardRecord } from '../types/v11';

const bgImage = require('../../v1/bg.png');

const MIN_CARDS = 50;
const DEFAULT_CARDS = 200;
const MAX_CARDS = DECK_LENGTH;
const SWIPE_UP_THRESHOLD = 90;

type ParsedCustomEntry = {
  term: string;
  en?: string;
};

type ImportDeckMode = 'existing' | 'new';

type MissedWordExportItem = {
  id: string;
  term: string;
  en: string;
  pronHintEn?: string;
  skipped: number;
  incorrect: number;
  misses: number;
};

function normalizeWordToken(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function sanitizeWordSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 1) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function normalizeDefinitionToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function stripCustomLinePrefix(value: string): string {
  return value
    .trim()
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^[-*•]\s+/, '')
    .trim();
}

function parseStructuredCustomLine(cleanedLine: string): ParsedCustomEntry | null {
  const cleaned = cleanedLine.trim();
  if (!cleaned) return null;

  const colonOrEqualsMatch = cleaned.match(/^(.+?)\s*[:=]\s*(.+)$/);
  if (colonOrEqualsMatch) {
    const term = normalizeWordToken(colonOrEqualsMatch[1]);
    if (!term) return null;
    return {
      term,
      en: normalizeDefinitionToken(colonOrEqualsMatch[2]),
    };
  }

  const spacedDashMatch = cleaned.match(/^(.+?)\s[-–—]\s(.+)$/);
  if (spacedDashMatch) {
    const term = normalizeWordToken(spacedDashMatch[1]);
    if (!term) return null;
    return {
      term,
      en: normalizeDefinitionToken(spacedDashMatch[2]),
    };
  }

  return null;
}

function parseCustomWordInput(raw: string): ParsedCustomEntry[] {
  const parsed: ParsedCustomEntry[] = [];
  const seen = new Set<string>();
  const pushEntry = (entry: ParsedCustomEntry) => {
    const term = normalizeWordToken(entry.term);
    if (!term) return;
    const key = term.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    parsed.push({ term, en: normalizeDefinitionToken(entry.en) });
  };

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const cleanedLine = stripCustomLinePrefix(line);
    if (!cleanedLine) continue;

    const structured = parseStructuredCustomLine(cleanedLine);
    if (structured) {
      pushEntry(structured);
      continue;
    }

    const tokens = cleanedLine.match(/[^\s,;]+/g) ?? [];
    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];
      if (token === ':' || token === '=' || token === '-' || token === '–' || token === '—') {
        continue;
      }

      let termToken = token;
      let enToken: string | undefined;

      const inlineSep = token.match(/^(.+?)([:=])(.*)$/);
      if (inlineSep) {
        termToken = inlineSep[1];
        enToken = normalizeDefinitionToken(inlineSep[3]);
        if (
          !enToken &&
          tokens[i + 1] &&
          ![':', '=', '-', '–', '—'].includes(tokens[i + 1])
        ) {
          enToken = normalizeDefinitionToken(tokens[i + 1]);
          i += 1;
        }
      } else if ((tokens[i + 1] === ':' || tokens[i + 1] === '=') && tokens[i + 2]) {
        enToken = normalizeDefinitionToken(tokens[i + 2]);
        i += 2;
      } else if (
        (tokens[i + 1] === '-' || tokens[i + 1] === '–' || tokens[i + 1] === '—') &&
        tokens[i + 2]
      ) {
        enToken = normalizeDefinitionToken(tokens[i + 2]);
        i += 2;
      }

      pushEntry({ term: termToken, en: enToken });
    }
  }

  return parsed;
}

function stringifyParsedCustomInput(entries: ParsedCustomEntry[]): string {
  return entries
    .map((entry) => (entry.en ? `${entry.term}:${entry.en}` : entry.term))
    .join(' ');
}

function buildMissedWordsListExport(items: MissedWordExportItem[]): string {
  const ordered = [...items].sort((a, b) => b.misses - a.misses || a.term.localeCompare(b.term));
  if (ordered.length === 0) return 'No missed words this session.';
  return ordered.map((item) => `${item.term} - ${item.en}`).join('\n');
}

async function resolveDefinitionForCustomWord(
  term: string,
  providedDefinition?: string
): Promise<string | undefined> {
  if (providedDefinition) return providedDefinition;
  // TODO: Fetch a definition when missing.
  void term;
  return undefined;
}

async function readClipboardText(): Promise<string> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        return await navigator.clipboard.readText();
      }
    } catch {
      // fallback to expo-clipboard below
    }
  }
  try {
    return await Clipboard.getStringAsync();
  } catch {
    return '';
  }
}

type FlashSessionScreenProps = {
  presetWords?: Word[];
  restartSessionKey?: string;
};

export function FlashSessionScreen({ presetWords = [], restartSessionKey }: FlashSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const hasPresetWords = presetWords.length > 0;
  const [cardCount, setCardCount] = React.useState(DEFAULT_CARDS);
  const {
    state,
    currentWord,
    remaining,
    swipeLeft,
    swipeRight,
    swipeUp,
    chooseOption,
    advanceToNextCard,
    startSession,
    startNewSession,
    stopSession,
    getClearTimeMs,
    spacedRepetitionDebug,
  } = useSession();

  const [customWords, setCustomWords] = React.useState<Word[]>([]);
  const [customInput, setCustomInput] = React.useState('');
  const [showCustomEditor, setShowCustomEditor] = React.useState(false);
  const [customFeedback, setCustomFeedback] = React.useState<string | null>(null);
  const [customError, setCustomError] = React.useState<string | null>(null);
  const [customWordsLoaded, setCustomWordsLoaded] = React.useState(false);
  const [availableDecks, setAvailableDecks] = React.useState<Deck[]>([]);
  const [importDeckMode, setImportDeckMode] = React.useState<ImportDeckMode>('existing');
  const [importDeckId, setImportDeckId] = React.useState<string>('default');
  const [newDeckName, setNewDeckName] = React.useState('');
  const [modalDismissed, setModalDismissed] = React.useState(false);
  const [stopModalVisible, setStopModalVisible] = React.useState(false);
  const [skippedCountsById, setSkippedCountsById] = React.useState<Record<string, number>>({});
  const [incorrectCountsById, setIncorrectCountsById] = React.useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = React.useState<number>(0.5);
  const [showGestureDemo, setShowGestureDemo] = React.useState(false);
  const [practiceLanguage, setPracticeLanguage] = React.useState<PracticeLanguage>('pt');
  const [showSchedulerDebug, setShowSchedulerDebug] = React.useState(false);
  const [typedAnswer, setTypedAnswer] = React.useState('');
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const lastClearedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRecordedCorrectIdRef = useRef<string | null>(null);
  const lastRecordedIncorrectIdRef = useRef<string | null>(null);
  const gestureDemoShownRef = useRef(false);
  const sessionInitRanRef = useRef(false);
  const hasHydratedLanguageRef = useRef(false);
  const presetSessionStartedRef = useRef(false);
  const lastRestartSessionKeyRef = useRef<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPracticeLanguage()
        .then(async (language) => {
          if (cancelled) return;
          const didLanguageChange =
            hasHydratedLanguageRef.current && language !== practiceLanguage;
          setPracticeLanguage(language);
          const words = await getCustomWords(language);
          if (cancelled) return;
          setCustomWords(words);
          if (didLanguageChange) {
            setModalDismissed(false);
            setStopModalVisible(false);
            setSkippedCountsById({});
            setIncorrectCountsById({});
            lastClearedRef.current = false;
            lastRecordedCorrectIdRef.current = null;
            lastRecordedIncorrectIdRef.current = null;
            startSession({
              cardCount: Math.round(cardCount),
              customWords: words,
              language,
            });
            const nextLanguageLabel = getPracticeLanguageLabel(language);
            setToastMessage(
              `Language switched to ${nextLanguageLabel}. Started a new session.`
            );
            if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
            toastTimerRef.current = setTimeout(() => {
              setToastMessage(null);
            }, 2400);
          }
          hasHydratedLanguageRef.current = true;
        })
        .finally(() => {
          if (!cancelled) setCustomWordsLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }, [cardCount, practiceLanguage, startSession])
  );

  useEffect(() => {
    if (!hasPresetWords) {
      presetSessionStartedRef.current = false;
      return;
    }
    if (state || presetSessionStartedRef.current) return;
    presetSessionStartedRef.current = true;
    startSession({
      cardCount: 0,
      customWords: presetWords,
      language: presetWords[0]?.language ?? practiceLanguage,
    });
  }, [hasPresetWords, practiceLanguage, presetWords, startSession, state]);

  useEffect(() => {
    if (customWords.length === 0 && cardCount < MIN_CARDS) {
      setCardCount(MIN_CARDS);
    }
  }, [customWords.length, cardCount]);

  // When session starts: load playback rate and show gesture demo once per app install
  useEffect(() => {
    if (!state || sessionInitRanRef.current) return;
    sessionInitRanRef.current = true;
    let cancelled = false;
    getAudioPlaybackRate().then((rate) => {
      if (!cancelled) setPlaybackRateState(rate);
    });
    getHasSeenGestureDemo().then((seen) => {
      if (cancelled) return;
      if (!seen) {
        setShowGestureDemo(true);
        gestureDemoShownRef.current = true;
        void setHasSeenGestureDemo();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [state]);
  useEffect(() => {
    if (!state) sessionInitRanRef.current = false;
  }, [state]);

  useEffect(() => {
    if (!state?.startedAt || state.cleared || stopModalVisible) return;
    const tick = () => setElapsedMs(Date.now() - state.startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state?.startedAt, state?.cleared, stopModalVisible]);

  useEffect(() => {
    if (!state?.startedAt) setElapsedMs(0);
  }, [state?.startedAt]);

  useEffect(() => {
    const isActiveSession = Boolean(state && !state.cleared);
    void setHasActivePracticeSession(isActiveSession);
  }, [state]);

  useEffect(() => {
    return () => {
      void setHasActivePracticeSession(false);
    };
  }, []);

  const refreshDeckTargets = useCallback(async () => {
    const [decks, selectedDeckId] = await Promise.all([getDecks(), getSelectedDeckId()]);
    setAvailableDecks(decks);
    setImportDeckId((prev) => {
      if (decks.some((deck) => deck.id === prev)) return prev;
      return selectedDeckId;
    });
  }, []);

  useEffect(() => {
    void refreshDeckTargets();
  }, [refreshDeckTargets]);

  useEffect(() => {
    if (hasPresetWords || !customWordsLoaded || !restartSessionKey) return;
    if (lastRestartSessionKeyRef.current === restartSessionKey) return;
    lastRestartSessionKeyRef.current = restartSessionKey;
    setModalDismissed(false);
    setStopModalVisible(false);
    setSkippedCountsById({});
    setIncorrectCountsById({});
    lastClearedRef.current = false;
    lastRecordedCorrectIdRef.current = null;
    lastRecordedIncorrectIdRef.current = null;
    startSession({
      cardCount: Math.round(cardCount),
      customWords,
      language: practiceLanguage,
    });
  }, [
    cardCount,
    customWords,
    customWordsLoaded,
    hasPresetWords,
    practiceLanguage,
    restartSessionKey,
    startSession,
  ]);

  const handleAddCustomWords = useCallback(async () => {
    const parsedEntries = parseCustomWordInput(customInput);
    if (parsedEntries.length === 0) {
      setCustomFeedback(null);
      setCustomError('Enter at least one word.');
      return;
    }
    const existingPt = new Set(
      customWords.map((word) => word.term.trim().toLocaleLowerCase())
    );
    const customSeed = Date.now();
    const additions: Word[] = [];
    for (let index = 0; index < parsedEntries.length; index += 1) {
      const entry = parsedEntries[index];
      const key = entry.term.toLocaleLowerCase();
      if (existingPt.has(key)) continue;
      existingPt.add(key);
      const resolvedDefinition = await resolveDefinitionForCustomWord(
        entry.term,
        entry.en
      );
      additions.push({
        id: `custom-${customSeed}-${index}`,
        term: entry.term,
        en: resolvedDefinition,
        isCustom: true,
        language: practiceLanguage,
      });
    }
    if (additions.length === 0) {
      setCustomFeedback(null);
      setCustomError('Those words are already in your custom cards.');
      return;
    }
    let targetDeckId = importDeckId;
    let targetDeckLabel = availableDecks.find((deck) => deck.id === importDeckId)?.name ?? 'selected deck';
    if (importDeckMode === 'new') {
      const trimmed = newDeckName.trim();
      if (!trimmed) {
        setCustomFeedback(null);
        setCustomError('Enter a name for the new deck.');
        return;
      }
      const createdDeck = await createDeck(trimmed);
      await setSelectedDeck(createdDeck.id);
      targetDeckId = createdDeck.id;
      targetDeckLabel = createdDeck.name;
    }
    const nextCustomWords = [...customWords, ...additions];
    setCustomWords(nextCustomWords);
    await saveCustomWords(nextCustomWords, practiceLanguage);
    const importSeed = Date.now();
    const importedCards: FlashCardRecord[] = [];
    for (let index = 0; index < additions.length; index += 1) {
      const word = additions[index];
      const slug = sanitizeWordSlug(word.term);
      if (!slug) continue;
      importedCards.push({
        id: `word-${targetDeckId}-${slug}`,
        deckId: targetDeckId,
        cardType: 'word',
        front: word.term,
        back: normalizeDefinitionToken(word.en) ?? word.term,
        createdAt: importSeed + index,
      });
    }
    await addCards(importedCards);
    await refreshDeckTargets();
    setCustomInput('');
    setNewDeckName('');
    setImportDeckMode('existing');
    setCustomError(null);
    setShowCustomEditor(false);
    setCustomFeedback(
      `Imported ${additions.length} word${additions.length === 1 ? '' : 's'} to ${targetDeckLabel}.`
    );
  }, [
    availableDecks,
    customInput,
    customWords,
    importDeckId,
    importDeckMode,
    newDeckName,
    practiceLanguage,
    refreshDeckTargets,
  ]);

  const handleClearCustomCards = useCallback(async () => {
    await clearCustomWords(practiceLanguage);
    setCustomWords([]);
    setCustomInput('');
    setCustomError(null);
    setShowCustomEditor(false);
    setCustomFeedback('Cleared all custom cards.');
  }, [practiceLanguage]);

  const handleToggleCustomEditor = useCallback(() => {
    const nextOpenState = !showCustomEditor;
    setShowCustomEditor(nextOpenState);
    if (!nextOpenState) return;
    void (async () => {
      try {
        await refreshDeckTargets();
        const clipboardText = await readClipboardText();
        const prefilledInput = stringifyParsedCustomInput(
          parseCustomWordInput(clipboardText)
        );
        if (!prefilledInput) return;
        setCustomInput(prefilledInput);
        setCustomFeedback(null);
        setCustomError(null);
      } catch {
        // ignore clipboard failures
      }
    })();
  }, [refreshDeckTargets, showCustomEditor]);

  const recordSessionSkip = useCallback((wordId: string) => {
    setSkippedCountsById((prev) => ({ ...prev, [wordId]: (prev[wordId] ?? 0) + 1 }));
  }, []);

  const recordSessionIncorrect = useCallback((wordId: string) => {
    setIncorrectCountsById((prev) => ({ ...prev, [wordId]: (prev[wordId] ?? 0) + 1 }));
  }, []);

  const handlePlayAudio = useCallback((rate: number) => {
    if (!currentWord) return;
    playWordAudio(currentWord, rate);
  }, [currentWord]);

  const handleTapToSkip = useCallback(() => {
    stopWordAudio();
    if (state?.uiState !== 'PROMPT') {
      advanceToNextCard();
    }
  }, [state?.uiState, advanceToNextCard]);

  const handleCycleSpeed = useCallback(() => {
    const next = cycleAudioPlaybackRate(playbackRate);
    setPlaybackRateState(next);
    void setAudioPlaybackRate(next);
    void trackEvent('speed_adjustment_clicked', {
      previous_rate: playbackRate,
      next_rate: next,
      word_id: currentWord?.id ?? null,
    });
  }, [currentWord?.id, playbackRate]);

  const handleSwipeLeft = useCallback(() => {
    if (state?.currentCardId) {
      recordWordDontKnow(state.currentCardId);
      recordSessionSkip(state.currentCardId);
    }
    setTypedAnswer('');
    swipeLeft();
  }, [recordSessionSkip, swipeLeft, state?.currentCardId]);

  const handleSwipeRight = useCallback(() => {
    swipeRight(typedAnswer);
  }, [swipeRight, typedAnswer]);

  const handleGlobalSwipeUp = useCallback(() => {
    if (
      !state ||
      state.uiState !== 'PROMPT' ||
      state.cleared ||
      stopModalVisible ||
      showGestureDemo
    ) {
      return;
    }
    void trackEvent('swipe_up_gesture', {
      word_id: state.currentCardId,
      ui_state: state.uiState,
    });
    swipeUp();
  }, [showGestureDemo, state, stopModalVisible, swipeUp]);

  const handleOpenInfo = useCallback(() => {
    void trackEvent('info_button_selected', {
      word_id: currentWord?.id ?? null,
      ui_state: state?.uiState ?? null,
    });
    setShowGestureDemo(true);
  }, [currentWord?.id, state?.uiState]);

  const globalSwipeUpGesture = Gesture.Pan()
    .enabled(Boolean(state && state.uiState === 'PROMPT' && !state.cleared && !stopModalVisible && !showGestureDemo))
    .activeOffsetX([-40, 40])
    .onEnd((event) => {
      const wentUp = event.translationY < -SWIPE_UP_THRESHOLD || event.velocityY < -280;
      if (wentUp) {
        handleGlobalSwipeUp();
      }
    });

  // Record "Know" once per card when feedback is correct
  useEffect(() => {
    if (
      state?.uiState === 'FEEDBACK_CORRECT' &&
      state?.currentCardId &&
      state.currentCardId !== lastRecordedCorrectIdRef.current
    ) {
      lastRecordedCorrectIdRef.current = state.currentCardId;
      recordWordKnow(state.currentCardId);
    }
  }, [state?.uiState, state?.currentCardId]);

  // Reset "recorded correct" when advancing to a new card
  useEffect(() => {
    if (state?.uiState === 'PROMPT') {
      lastRecordedCorrectIdRef.current = null;
    }
  }, [state?.uiState, state?.currentCardId]);

  // Record an incorrect guess once per card when answer feedback is wrong.
  useEffect(() => {
    if (
      state?.uiState === 'FEEDBACK_WRONG' &&
      state?.currentCardId &&
      state.currentCardId !== lastRecordedIncorrectIdRef.current
    ) {
      lastRecordedIncorrectIdRef.current = state.currentCardId;
      recordSessionIncorrect(state.currentCardId);
    }
  }, [recordSessionIncorrect, state?.uiState, state?.currentCardId]);

  useEffect(() => {
    if (state?.uiState === 'PROMPT') {
      lastRecordedIncorrectIdRef.current = null;
    }
  }, [state?.uiState, state?.currentCardId]);

  useEffect(() => {
    setTypedAnswer('');
  }, [state?.currentCardId, state?.uiState]);

  // Auto-play by default on every prompt card using persisted playback rate.
  useEffect(() => {
    if (state?.uiState !== 'PROMPT' || !currentWord) return;
    playWordAudio(currentWord, playbackRate);
  }, [state?.currentCardId, state?.uiState, currentWord, playbackRate]);

  // Auto-play when revealing "don't know" (hear the word at current speed)
  useEffect(() => {
    if (state?.uiState === 'REVEAL_DONT_KNOW' && currentWord) {
      playWordAudio(currentWord, playbackRate);
    }
  }, [state?.uiState, currentWord, playbackRate]);

  // When session clears: persist best time and runs count
  useEffect(() => {
    if (!state?.cleared || lastClearedRef.current) return;
    lastClearedRef.current = true;
    const clearMs = getClearTimeMs();
    if (clearMs != null) {
      getBestClearMs().then((best) => {
        if (best == null || clearMs < best) setBestClearMs(clearMs);
      });
      incrementRunsCount();
    }
  }, [state?.cleared, getClearTimeMs]);

  const handleRunAgain = useCallback(() => {
    setModalDismissed(false);
    setStopModalVisible(false);
    setSkippedCountsById({});
    setIncorrectCountsById({});
    lastClearedRef.current = false;
    lastRecordedCorrectIdRef.current = null;
    lastRecordedIncorrectIdRef.current = null;
    startNewSession();
  }, [startNewSession]);

  const handleDone = useCallback(() => {
    setModalDismissed(true);
  }, []);

  const showModal = Boolean(state?.cleared && !modalDismissed);
  const [bestTimeMs, setBestTimeMs] = React.useState<number | null>(null);

  const missedWordExportItems = React.useMemo(() => {
    const allMissedIds = new Set<string>([
      ...Object.keys(skippedCountsById),
      ...Object.keys(incorrectCountsById),
    ]);
    return Array.from(allMissedIds)
      .map((id) => {
        const skipped = skippedCountsById[id] ?? 0;
        const incorrect = incorrectCountsById[id] ?? 0;
        const misses = skipped + incorrect;
        if (misses <= 0) return null;

        const builtInWord = getWordByIdForLanguage(id, practiceLanguage);
        const customWord = builtInWord ? null : customWords.find((word) => word.id === id);
        const word = builtInWord ?? customWord;
        if (!word?.term) return null;

        const en = normalizeDefinitionToken(word.en) ?? word.term;
        return {
          id,
          term: word.term,
          en,
          pronHintEn: word.pronHintEn,
          skipped,
          incorrect,
          misses,
        } as MissedWordExportItem;
      })
      .filter((item): item is MissedWordExportItem => item != null)
      .sort((a, b) => b.misses - a.misses || a.term.localeCompare(b.term));
  }, [customWords, incorrectCountsById, practiceLanguage, skippedCountsById]);
  const uniqueMissCount = missedWordExportItems.length;

  const handleStartSession = useCallback(
    (count: number) => {
      setModalDismissed(false);
      setStopModalVisible(false);
      setSkippedCountsById({});
      setIncorrectCountsById({});
      lastClearedRef.current = false;
      lastRecordedCorrectIdRef.current = null;
      lastRecordedIncorrectIdRef.current = null;
      startSession({ cardCount: count, customWords, language: practiceLanguage });
    },
    [customWords, practiceLanguage, startSession]
  );

  const handleOpenStopModal = useCallback(() => {
    setStopModalVisible(true);
  }, []);

  const handleResumeSession = useCallback(() => {
    setStopModalVisible(false);
  }, []);

  const toastBottomOffset = (insets.bottom || 0) + (state && !state.cleared && !stopModalVisible ? 86 : 16);
  const customEditorBottomOffset =
    Math.max(insets.bottom || 0, 10) + (state && !state.cleared && !stopModalVisible ? 90 : 18);

  const showNativeCopyToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
    }
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 2200);
  }, []);

  const copyMissedWordsToClipboard = useCallback(async () => {
    const exportText = buildMissedWordsListExport(missedWordExportItems);
    await Clipboard.setStringAsync(exportText);
    const toastMessage =
      uniqueMissCount > 0
        ? `Copied ${uniqueMissCount} skipped/wrong words to clipboard`
        : 'Copied to clipboard';
    showNativeCopyToast(toastMessage);
  }, [missedWordExportItems, showNativeCopyToast, uniqueMissCount]);

  const handleExportMissedWords = useCallback(async () => {
    try {
      await copyMissedWordsToClipboard();
    } catch {
      Alert.alert('Copy failed', 'Could not copy the export to your clipboard.');
    }
  }, [copyMissedWordsToClipboard]);

  const handleStopAndCopy = useCallback(async () => {
    try {
      await copyMissedWordsToClipboard();
    } catch {
      Alert.alert('Copy failed', 'Could not copy the export to your clipboard.');
    } finally {
      setStopModalVisible(false);
      setModalDismissed(false);
      setSkippedCountsById({});
      setIncorrectCountsById({});
      lastClearedRef.current = false;
      lastRecordedCorrectIdRef.current = null;
      lastRecordedIncorrectIdRef.current = null;
      stopSession();
    }
  }, [copyMissedWordsToClipboard, stopSession]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (state?.cleared) {
      getBestClearMs().then(setBestTimeMs);
    }
  }, [state?.cleared]);


  const customEditorOverlay = showCustomEditor && (
    <View style={[styles.customEditorSheet, { bottom: customEditorBottomOffset }]}>
      <View style={styles.customEditorHeader}>
        <Text style={styles.customEditorTitle}>
          New {getPracticeLanguageLabel(practiceLanguage)} words
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.customEditorCloseButton,
            pressed && styles.customIconButtonPressed,
          ]}
          onPress={() => setShowCustomEditor(false)}
        >
          <FontAwesome5 name="times" size={14} color={theme.textPrimary} solid />
        </Pressable>
      </View>
      <Text style={styles.customEditorHint}>
        Paste words with optional definitions (ex: casa:house). Import while practicing.
      </Text>
      <TextInput
        style={styles.customInput}
        value={customInput}
        onChangeText={(value) => {
          setCustomInput(value);
          setCustomFeedback(null);
          setCustomError(null);
        }}
        multiline
        placeholder={practiceLanguage === 'fr' ? 'ex: maison voiture ami' : 'ex: casa carro amigo'}
        placeholderTextColor={theme.textMuted}
        textAlignVertical="top"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.customActionRow}>
        <Pressable
          style={({ pressed }) => [
            styles.customSaveButton,
            pressed && styles.customSaveButtonPressed,
          ]}
          onPress={() => {
            void handleAddCustomWords();
          }}
        >
          <Text style={styles.customSaveButtonLabel}>Import collection</Text>
        </Pressable>
        {customWords.length > 0 && (
          <Pressable
            style={({ pressed }) => [
              styles.customClearButton,
              pressed && styles.customClearButtonPressed,
            ]}
            onPress={() => {
              void handleClearCustomCards();
            }}
          >
            <Text style={styles.customClearButtonLabel}>Clear all</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.deckTargetSection}>
        <Text style={styles.deckTargetLabel}>Import target</Text>
        <View style={styles.deckModeRow}>
          <Pressable
            style={[
              styles.deckModeButton,
              importDeckMode === 'existing' && styles.deckModeButtonActive,
            ]}
            onPress={() => setImportDeckMode('existing')}
          >
            <Text style={styles.deckModeLabel}>Existing deck</Text>
          </Pressable>
          <Pressable
            style={[
              styles.deckModeButton,
              importDeckMode === 'new' && styles.deckModeButtonActive,
            ]}
            onPress={() => setImportDeckMode('new')}
          >
            <Text style={styles.deckModeLabel}>New deck</Text>
          </Pressable>
        </View>
        {importDeckMode === 'existing' ? (
          <View style={styles.deckChipsRow}>
            {availableDecks.map((deck) => (
              <Pressable
                key={deck.id}
                style={[
                  styles.deckChip,
                  importDeckId === deck.id && styles.deckChipActive,
                ]}
                onPress={() => setImportDeckId(deck.id)}
              >
                <Text style={styles.deckChipLabel}>{deck.name}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <TextInput
            style={styles.newDeckInput}
            value={newDeckName}
            onChangeText={setNewDeckName}
            placeholder="New deck name"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="words"
            autoCorrect={false}
          />
        )}
      </View>
      <Pressable
        style={({ pressed }) => [styles.debugToggleInline, pressed && styles.debugTogglePressed]}
        onPress={() => setShowSchedulerDebug((prev) => !prev)}
      >
        <Text style={styles.debugToggleLabel}>
          {showSchedulerDebug ? 'Hide debug' : 'Show debug'}
        </Text>
      </Pressable>
      {showSchedulerDebug && (
        <View style={styles.debugPanel}>
          <Text style={styles.debugTitle}>Scheduler</Text>
          <Text style={styles.debugLine}>
            Due selected: {spacedRepetitionDebug.stats.selectedDue} / available {spacedRepetitionDebug.stats.dueAvailable}
          </Text>
          <Text style={styles.debugLine}>
            New selected: {spacedRepetitionDebug.stats.selectedNew} / available {spacedRepetitionDebug.stats.newAvailable}
          </Text>
          <Text style={styles.debugLine}>
            Card dueAt: {spacedRepetitionDebug.currentCardSchedule?.dueAt ?? 'new'}
          </Text>
          <Text style={styles.debugLine}>
            Interval days: {spacedRepetitionDebug.currentCardSchedule?.intervalDays ?? 0}
          </Text>
          <Text style={styles.debugLine}>
            Ease: {spacedRepetitionDebug.currentCardSchedule?.ease?.toFixed(2) ?? '2.50'}
          </Text>
          <Text style={styles.debugLine}>
            Last review: {spacedRepetitionDebug.lastReview?.grade ?? '-'}
          </Text>
        </View>
      )}
    </View>
  );

  // Start screen: choose number of cards then begin
  if (!state && hasPresetWords) {
    return (
      <ImageBackground
        source={bgImage}
        style={[styles.screen, { paddingTop: (insets.top || 0) + theme.safeAreaTopOffset }]}
        resizeMode="cover"
      >
        <View style={styles.centerLoading}>
          <Text style={styles.startTitle}>Preparing phrase session...</Text>
        </View>
      </ImageBackground>
    );
  }

  if (!state) {
    const displayCount = Math.round(cardCount);
    const minCardsAllowed = customWords.length > 0 ? 0 : MIN_CARDS;
    const totalCardsPlanned = displayCount + customWords.length;
    const canStart = totalCardsPlanned > 0;
    return (
      <ImageBackground
        source={bgImage}
        style={[styles.screen, { paddingTop: (insets.top || 0) + theme.safeAreaTopOffset }]}
        resizeMode="cover"
      >
        <ScrollView
          contentContainerStyle={styles.startContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.startTitle}>Number of cards</Text>
          <Text style={styles.startHintText}>
            Study language: {getPracticeLanguageLabel(practiceLanguage)}
          </Text>
          <Text style={styles.startCount}>{displayCount}</Text>
          <Slider
            style={styles.slider}
            minimumValue={minCardsAllowed}
            maximumValue={MAX_CARDS}
            step={1}
            value={cardCount}
            onValueChange={setCardCount}
            minimumTrackTintColor={theme.brand}
            maximumTrackTintColor={theme.stroke}
            thumbTintColor={theme.brand}
          />
          <View style={styles.startHint}>
            <Text style={styles.startHintText}>
              {minCardsAllowed} - {MAX_CARDS} default cards
            </Text>
            <Text style={styles.startHintText}>
              Custom cards loaded: {customWordsLoaded ? customWords.length : '...'}
            </Text>
            {customWords.length > 0 && (
              <Text style={styles.startHintText}>
                Session total: {totalCardsPlanned}
              </Text>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              !canStart && styles.startButtonDisabled,
              pressed && canStart && styles.startButtonPressed,
            ]}
            onPress={() => handleStartSession(displayCount)}
            disabled={!canStart}
          >
            <Text style={styles.startButtonLabel}>Start</Text>
          </Pressable>
          {customError != null && (
            <Text style={styles.customErrorText}>{customError}</Text>
          )}
          {customFeedback != null && (
            <Text style={styles.customFeedbackText}>{customFeedback}</Text>
          )}
        </ScrollView>
        {customEditorOverlay}
        {toastMessage && (
          <View pointerEvents="none" style={[styles.webToastWrap, { bottom: toastBottomOffset }]}>
            <View style={styles.webToast}>
              <Text style={styles.webToastText}>{toastMessage}</Text>
            </View>
          </View>
        )}
      </ImageBackground>
    );
  }

  return (
    <GestureDetector gesture={globalSwipeUpGesture}>
      <ImageBackground
        source={bgImage}
        style={[styles.screen, { paddingTop: (insets.top || 0) + theme.safeAreaTopOffset }]}
        resizeMode="cover"
      >
        <HeaderHUD
          rightCount={state.rightCount}
          incorrectCount={state.incorrectCount}
          skippedCount={state.skippedCount}
          guessedCount={state.guessedCount}
          remaining={remaining}
        />
        {state.startedAt != null && (
          <View style={styles.utilityRail}>
            <View style={styles.timeChip}>
              <FontAwesome5 name="clock" size={12} color={theme.info} solid />
              <Text style={styles.timeChipText}>{formatElapsed(elapsedMs)}</Text>
            </View>
          </View>
        )}
        <View style={styles.content}>
          <FlashCard
            word={currentWord}
            uiState={state.uiState}
            choiceOptions={state.choiceOptions}
            correctChoiceIndex={state.correctChoiceIndex}
            selectedChoiceIndex={state.selectedChoiceIndex}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onChooseOption={chooseOption}
            onAdvance={advanceToNextCard}
            onPlayAudio={handlePlayAudio}
            onTapToSkip={handleTapToSkip}
            playbackRate={playbackRate}
            onCycleSpeed={handleCycleSpeed}
            typedAnswer={typedAnswer}
            onChangeTypedAnswer={setTypedAnswer}
            onSubmitTypedAnswer={handleSwipeRight}
            disabled={state.cleared || stopModalVisible || showGestureDemo}
            onOpenInfo={handleOpenInfo}
            onOpenAdd={handleToggleCustomEditor}
          />
        </View>
        {customEditorOverlay}
        <GestureDemoOverlay
        visible={showGestureDemo}
        onDismiss={() => setShowGestureDemo(false)}
        />
        {!state.cleared && !stopModalVisible && (
          <Pressable
          style={({ pressed }) => [
            styles.pauseButton,
            { bottom: (insets.bottom || 0) + 14 },
            pressed && styles.pauseButtonPressed,
          ]}
          onPress={handleOpenStopModal}
          >
            <FontAwesome5 name="pause-circle" size={18} color={theme.textPrimary} solid />
            <Text style={styles.pauseButtonText}>Pause</Text>
          </Pressable>
        )}
        <CompletionModal
        visible={showModal}
        bestTimeMs={bestTimeMs}
        uniqueMissCount={uniqueMissCount}
        onExportMissedWords={() => {
          void handleExportMissedWords();
        }}
        onRunAgain={handleRunAgain}
        onDone={handleDone}
        />
        <StopSessionModal
        visible={stopModalVisible}
        uniqueMissCount={uniqueMissCount}
        onResume={handleResumeSession}
        onStopAndCopy={handleStopAndCopy}
        />
      {toastMessage && (
          <View pointerEvents="none" style={[styles.webToastWrap, { bottom: toastBottomOffset }]}>
            <View style={styles.webToast}>
              <Text style={styles.webToastText}>{toastMessage}</Text>
            </View>
          </View>
        )}
      </ImageBackground>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg0,
  },
  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: theme.cardStagePaddingVertical,
    paddingHorizontal: 24,
  },
  utilityRail: {
    paddingHorizontal: 12,
    marginTop: -2,
    marginBottom: 2,
    alignItems: 'flex-end',
  },
  timeChip: {
    minHeight: 28,
    borderRadius: 14,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  timeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  startContent: {
    paddingVertical: 24,
    paddingBottom: 132,
    paddingHorizontal: 32,
  },
  startTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  startCount: {
    fontSize: 48,
    fontWeight: '800',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
  },
  slider: {
    width: '100%',
    height: 48,
  },
  startHint: {
    marginBottom: 20,
    gap: 4,
  },
  startHintText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
  },
  floatingButtons: {
    position: 'absolute',
    right: 18,
    flexDirection: 'column',
    gap: 10,
    alignItems: 'flex-end',
  },
  customIconButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    ...theme.cardShadow,
  },
  customInfoButton: {
    backgroundColor: theme.surfaceStrong,
  },
  customAddButton: {
    backgroundColor: 'rgba(156, 84, 213, 0.42)',
  },
  customIconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  hudActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hudActionButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hudInfoButton: {
    backgroundColor: theme.surface,
    borderColor: theme.strokeSoft,
  },
  hudAddButton: {
    backgroundColor: 'rgba(156, 84, 213, 0.24)',
    borderColor: 'rgba(201, 167, 255, 0.52)',
  },
  hudActionButtonPressed: {
    opacity: 0.92,
  },
  customEditorSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: theme.panelBg,
    padding: 14,
    gap: 10,
  },
  customEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  customEditorTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customEditorCloseButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customEditorHint: {
    fontSize: 12,
    lineHeight: 16,
    color: theme.textMuted,
  },
  customInput: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBgMuted,
    color: theme.textPrimary,
    padding: 10,
    fontSize: 14,
  },
  customActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deckTargetSection: {
    gap: 8,
  },
  deckTargetLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  deckModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  deckModeButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckModeButtonActive: {
    borderColor: theme.selectedBorder,
    backgroundColor: theme.selectedBg,
  },
  deckModeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  deckChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deckChip: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckChipActive: {
    borderColor: theme.selectedBorder,
    backgroundColor: theme.selectedBg,
  },
  deckChipLabel: {
    fontSize: 12,
    color: theme.textPrimary,
    fontWeight: '600',
  },
  newDeckInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBgMuted,
    color: theme.textPrimary,
    paddingHorizontal: 10,
    fontSize: 14,
  },
  customSaveButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.brand,
  },
  customSaveButtonPressed: {
    opacity: 0.92,
  },
  customSaveButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customClearButton: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
  },
  customClearButtonPressed: {
    opacity: 0.92,
  },
  customClearButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customErrorText: {
    fontSize: 13,
    color: theme.bad,
    textAlign: 'center',
    marginTop: 10,
  },
  customFeedbackText: {
    fontSize: 13,
    color: theme.success,
    textAlign: 'center',
    marginTop: 10,
  },
  startButton: {
    backgroundColor: theme.brand,
    minHeight: theme.ctaMinHeight,
    borderRadius: theme.ctaRadius,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonPressed: {
    opacity: 0.9,
  },
  startButtonDisabled: {
    opacity: 0.45,
  },
  startButtonLabel: {
    fontSize: theme.buttonLabelSize,
    fontWeight: theme.buttonLabelWeight,
    color: theme.textPrimary,
  },
  pauseButton: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.bad,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    zIndex: 20,
    elevation: 8,
  },
  pauseButtonPressed: {
    opacity: 0.93,
  },
  pauseButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  webToastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    zIndex: 40,
  },
  webToast: {
    minHeight: 44,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: theme.panelBg,
    borderWidth: 1,
    borderColor: theme.stroke,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
  },
  webToastText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  debugToggleInline: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBgMuted,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  debugTogglePressed: {
    opacity: 0.92,
  },
  debugToggleLabel: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  debugPanel: {
    width: 250,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBg,
    padding: 10,
    gap: 4,
  },
  debugTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  debugLine: {
    color: theme.textMuted,
    fontSize: 12,
  },
});
