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
  Modal,
  Image,
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
  COGNATES_DECK_ID,
  createDeck,
  ensureCognatesCards,
  getDecks,
  getSelectedDeckId,
  getWordCards,
  setSelectedDeck,
  updateWordCardProgress,
} from '../lib/v11Storage';
import {
  getBestClearMs,
  setBestClearMs,
  incrementRunsCount,
  recordWordDontKnow,
  recordWordKnow,
  getPracticeLanguage,
  getAudioPlaybackRate,
  setAudioPlaybackRate,
  cycleAudioPlaybackRate,
  getHasSeenGestureDemo,
  setHasSeenGestureDemo,
  setHasActivePracticeSession,
  getAiBuilderConfig,
  setAiBuilderConfig,
} from '../lib/storage';
import { playWordAudio, stopWordAudio } from '../lib/audio';
import { trackEvent } from '../lib/analytics';
import { theme } from '../theme';
import { buildAiPrompt, createDefaultAiBuilderConfig, type AiBuilderConfig } from '../lib/aiPromptBuilder';
import type { CardPhotoHint, Deck, FlashCardRecord } from '../types/v11';
import {
  deleteStoredPhotoHint,
  pickAndStorePhotoHint,
  releasePhotoHintDisplayUri,
  resolvePhotoHintDisplayUri,
} from '../lib/photoHintStorage';

const bgImage = require('../../v1/bg.png');

const MIN_CARDS = 20;
const DEFAULT_CARDS = 20;
const CARD_COUNT_STEP = 50;
const MAX_CARDS = DECK_LENGTH;
const SWIPE_UP_THRESHOLD = 90;
const WEB_INPUT_FONT_SIZE = Platform.OS === 'web' ? 16 : 14;


const AI_THEME_OPTIONS = ['at the gym', 'while traveling', 'for dating', 'at work', 'for small talk'];
const AI_NATIVE_LANGUAGE_OPTIONS = ['English', 'Português', 'Français', 'Español'];
const AI_TONE_OPTIONS: Array<AiBuilderConfig['tone']> = ['casual', 'neutral', 'formal', 'flirty', 'business'];
const TONE_EMOJI: Record<string, string> = {
  flirty: '💋 ',
  casual: '😊 ',
  formal: '👔 ',
  business: '💼 ',
};
const AI_DIFFICULTY_OPTIONS: Array<AiBuilderConfig['difficulty']> = ['easy', 'standard', 'stretch'];
const AI_MIX_OPTIONS: Array<AiBuilderConfig['mix']> = ['balanced', 'vocabulary_heavy', 'conversation_heavy'];

type ParsedCustomEntry = {
  term: string;
  en?: string;
  pronHintEn?: string;
};

type CustomEditorSource = 'start_screen' | 'in_session';
type CustomInputSource = 'manual' | 'clipboard_prefill';

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

type WordHintState = {
  sourceCardId?: string;
  seenCount: number;
  wrongCount: number;
  photo?: CardPhotoHint;
  photoPromptDismissed: boolean;
};

const DEFAULT_DECK_ID = 'default';

function normalizeWordToken(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
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

function clampCardCount(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function buildDefaultImportDeckName(): string {
  return `Import ${new Date().toISOString().slice(0, 10)}`;
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

  // Handle AI prompt format: FRONT | BACK | HINT ||metadata
  if (cleaned.includes('|')) {
    const separatorIdx = cleaned.indexOf('||');
    const mainPart = separatorIdx >= 0 ? cleaned.slice(0, separatorIdx) : cleaned;
    const metaPart = separatorIdx >= 0 ? cleaned.slice(separatorIdx + 2) : '';
    const parts = mainPart.split('|').map((s) => s.trim());
    const meta: Record<string, string> = {};
    for (const kv of metaPart.split(';')) {
      const eqIdx = kv.indexOf('=');
      if (eqIdx > 0) {
        meta[kv.slice(0, eqIdx).trim().toLocaleLowerCase()] = kv.slice(eqIdx + 1).trim();
      }
    }
    const metadataPhonetic =
      meta['phonetic'] ?? meta['pronunciation'] ?? meta['pron'] ?? meta['phonetics'] ?? undefined;
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return {
        term: normalizeWordToken(parts[0]),
        en: normalizeDefinitionToken(parts[1]),
        pronHintEn: normalizeDefinitionToken(metadataPhonetic ?? parts[2]),
      };
    }
  }

  const colonOrEqualsMatch = cleaned.match(/^(.+?)\s*[:=：]\s*(.+)$/);
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

function parseCsvCells(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
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

    if (cleanedLine.includes(',')) {
      const csvCells = parseCsvCells(cleanedLine)
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (csvCells.length >= 2) {
        if (csvCells.length === 2) {
          pushEntry({
            term: csvCells[0],
            en: normalizeDefinitionToken(csvCells[1]),
          });
          continue;
        }
        if (csvCells.length % 2 === 0) {
          for (let index = 0; index < csvCells.length; index += 2) {
            pushEntry({
              term: csvCells[index],
              en: normalizeDefinitionToken(csvCells[index + 1]),
            });
          }
          continue;
        }
      }
    }

    const tokens = cleanedLine.match(/[^\s,;]+/g) ?? [];
    const shouldSplitAsWordList =
      tokens.length > 1 &&
      tokens.length <= 6 &&
      tokens.every((token) => /^[\p{L}\p{N}'’-]+$/u.test(token));

    if (shouldSplitAsWordList) {
      for (const token of tokens) {
        pushEntry({ term: token });
      }
      continue;
    }

    // Treat unmatched lines as a single term/phrase to avoid runaway token expansion.
    pushEntry({ term: cleanedLine });
  }

  return parsed;
}

function stringifyParsedCustomInput(entries: ParsedCustomEntry[]): string {
  return entries
    .map((entry) => (entry.en ? `${entry.term}:${entry.en}` : entry.term))
    .join('\n');
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

function toDeckWords(cards: FlashCardRecord[], language: PracticeLanguage): Word[] {
  return cards
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((card) => ({
      id: `imported-word-${card.id}`,
      sourceCardId: card.id,
      term: card.front,
      en: card.back,
      pronHintEn: card.pronHintEn,
      isCustom: true,
      language,
      wordType: card.wordType,
      photo: card.photo,
      seenCount: card.seenCount ?? 0,
      wrongCount: card.wrongCount ?? 0,
      photoPromptDismissed: card.photoPromptDismissed ?? false,
    }));
}

type FlashSessionScreenProps = {
  presetWords?: Word[];
  restartSessionKey?: string;
};

export function FlashSessionScreen({ presetWords = [], restartSessionKey }: FlashSessionScreenProps) {
  const insets = useSafeAreaInsets();
  const hasPresetWords = presetWords.length > 0;
  const [cardCount, setCardCount] = React.useState(DEFAULT_CARDS);
  const [cardCountInput, setCardCountInput] = React.useState(String(DEFAULT_CARDS));
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
  const [customEditorSource, setCustomEditorSource] = React.useState<CustomEditorSource>('start_screen');
  const [customInputSource, setCustomInputSource] = React.useState<CustomInputSource>('manual');
  const [customWordsLoaded, setCustomWordsLoaded] = React.useState(false);
  const [includeDefaultWords, setIncludeDefaultWords] = React.useState(true);
  const [availableDecks, setAvailableDecks] = React.useState<Deck[]>([]);
  const [importDeckMode, setImportDeckMode] = React.useState<ImportDeckMode>('new');
  const [importDeckId, setImportDeckId] = React.useState<string>('default');
  const [newDeckName, setNewDeckName] = React.useState(buildDefaultImportDeckName());
  const [isImporting, setIsImporting] = React.useState(false);
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
  const [aiBuilderConfig, setAiBuilderConfigState] = React.useState<AiBuilderConfig>(() =>
    createDefaultAiBuilderConfig('pt')
  );
  const [showAiBuilder, setShowAiBuilder] = React.useState(false);
  const [wordHintById, setWordHintById] = React.useState<Record<string, WordHintState>>({});
  const [photoLightboxVisible, setPhotoLightboxVisible] = React.useState(false);
  const [photoLightboxUri, setPhotoLightboxUri] = React.useState<string | null>(null);
  const [photoLightboxLoading, setPhotoLightboxLoading] = React.useState(false);
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
  const previousUiStateRef = useRef<string | null>(null);
  const previousCardIdRef = useRef<string | null>(null);
  const previousSelectedDeckIdRef = useRef<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPracticeLanguage()
        .then(async (language) => {
          if (cancelled) return;
          const didLanguageChange =
            hasHydratedLanguageRef.current && language !== practiceLanguage;
          setPracticeLanguage(language);
          const selectedDeckId = await getSelectedDeckId();
          const didDeckChange =
            hasHydratedLanguageRef.current && previousSelectedDeckIdRef.current !== selectedDeckId;
          if (selectedDeckId === COGNATES_DECK_ID) await ensureCognatesCards();
          const wordCards = await getWordCards(selectedDeckId);
          const shouldIncludeDefaultWords = selectedDeckId === DEFAULT_DECK_ID;
          const words = toDeckWords(wordCards, language);
          if (cancelled) return;
          previousSelectedDeckIdRef.current = selectedDeckId;
          setIncludeDefaultWords(shouldIncludeDefaultWords);
          setCustomWords(words);
          const savedAiConfig = await getAiBuilderConfig();
          setAiBuilderConfigState((prev) => ({
            ...(savedAiConfig ?? prev),
            targetLanguage: language,
          }));
          if (didLanguageChange || didDeckChange) {
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
              includeDefaultWords: shouldIncludeDefaultWords,
            });
            const nextLanguageLabel = getPracticeLanguageLabel(language);
            const deckSwitchMessage = didDeckChange ? 'Switched deck. Started a new session.' : '';
            setToastMessage(
              didLanguageChange
                ? `Language switched to ${nextLanguageLabel}. Started a new session.`
                : deckSwitchMessage
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
      includeDefaultWords: false,
    });
  }, [hasPresetWords, practiceLanguage, presetWords, startSession, state]);

  useEffect(() => {
    const minCardsAllowed = customWords.length > 0 ? 0 : MIN_CARDS;
    const normalized = clampCardCount(cardCount, minCardsAllowed, MAX_CARDS);
    if (normalized !== cardCount) {
      setCardCount(normalized);
      return;
    }
    setCardCountInput(String(normalized));
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

  useEffect(() => {
    void setAiBuilderConfig(aiBuilderConfig);
  }, [aiBuilderConfig]);

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
    void (async () => {
      const selectedDeckId = await getSelectedDeckId();
      if (selectedDeckId === COGNATES_DECK_ID) await ensureCognatesCards();
      const wordCards = await getWordCards(selectedDeckId);
      const shouldIncludeDefaultWords = selectedDeckId === DEFAULT_DECK_ID;
      const words = toDeckWords(wordCards, practiceLanguage);
      previousSelectedDeckIdRef.current = selectedDeckId;
      setIncludeDefaultWords(shouldIncludeDefaultWords);
      setCustomWords(words);
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
        language: practiceLanguage,
        includeDefaultWords: shouldIncludeDefaultWords,
      });
    })();
  }, [
    cardCount,
    customWordsLoaded,
    hasPresetWords,
    practiceLanguage,
    restartSessionKey,
    startSession,
  ]);

  useEffect(() => {
    if (!hasPresetWords) {
      setWordHintById({});
      return;
    }
    const next: Record<string, WordHintState> = {};
    for (const word of presetWords) {
      if (!word.sourceCardId) continue;
      next[word.id] = {
        sourceCardId: word.sourceCardId,
        seenCount: word.seenCount ?? 0,
        wrongCount: word.wrongCount ?? 0,
        photo: word.photo,
        photoPromptDismissed: word.photoPromptDismissed ?? false,
      };
    }
    setWordHintById(next);
  }, [hasPresetWords, presetWords]);

  const currentWordHint = React.useMemo<WordHintState | null>(() => {
    if (!currentWord?.sourceCardId) return null;
    const override = wordHintById[currentWord.id];
    return {
      sourceCardId: override?.sourceCardId ?? currentWord.sourceCardId,
      seenCount: override?.seenCount ?? currentWord.seenCount ?? 0,
      wrongCount: override?.wrongCount ?? currentWord.wrongCount ?? 0,
      photo: override?.photo ?? currentWord.photo,
      photoPromptDismissed:
        override?.photoPromptDismissed ?? currentWord.photoPromptDismissed ?? false,
    };
  }, [currentWord, wordHintById]);

  const currentWordWithHint = React.useMemo<Word | null>(() => {
    if (!currentWord || !currentWordHint) return currentWord;
    return {
      ...currentWord,
      seenCount: currentWordHint.seenCount,
      wrongCount: currentWordHint.wrongCount,
      photo: currentWordHint.photo,
      photoPromptDismissed: currentWordHint.photoPromptDismissed,
    };
  }, [currentWord, currentWordHint]);

  const patchCurrentWordHint = useCallback(
    (patch: {
      seenCount?: number;
      wrongCount?: number;
      photoPromptDismissed?: boolean;
      photo?: CardPhotoHint | null;
    }) => {
      if (!currentWord?.id || !currentWordHint?.sourceCardId) return;
      const next: WordHintState = {
        ...currentWordHint,
      };
      if (patch.seenCount != null) next.seenCount = Math.max(0, patch.seenCount);
      if (patch.wrongCount != null) next.wrongCount = Math.max(0, patch.wrongCount);
      if (patch.photoPromptDismissed != null) next.photoPromptDismissed = patch.photoPromptDismissed;
      if (patch.photo !== undefined) {
        if (patch.photo === null) {
          delete next.photo;
        } else {
          next.photo = patch.photo;
        }
      }
      setWordHintById((prev) => ({ ...prev, [currentWord.id]: next }));
      void updateWordCardProgress(currentWordHint.sourceCardId, {
        seenCount: patch.seenCount,
        wrongCount: patch.wrongCount,
        photoPromptDismissed: patch.photoPromptDismissed,
        photo: patch.photo,
      });
    },
    [currentWord?.id, currentWordHint]
  );

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

  const handleCardCountSliderChange = useCallback(
    (nextValue: number) => {
      const minCardsAllowed = customWords.length > 0 ? 0 : MIN_CARDS;
      const normalized = clampCardCount(nextValue, minCardsAllowed, MAX_CARDS);
      setCardCount(normalized);
    },
    [customWords.length]
  );

  const handleCardCountInputChange = useCallback(
    (value: string) => {
      const numericOnly = value.replace(/[^\d]/g, '');
      setCardCountInput(numericOnly);
      if (!numericOnly) return;
      const parsed = Number.parseInt(numericOnly, 10);
      if (!Number.isFinite(parsed)) return;
      const minCardsAllowed = customWords.length > 0 ? 0 : MIN_CARDS;
      const normalized = clampCardCount(parsed, minCardsAllowed, MAX_CARDS);
      setCardCount(normalized);
    },
    [customWords.length]
  );

  const handleCardCountInputBlur = useCallback(() => {
    const minCardsAllowed = customWords.length > 0 ? 0 : MIN_CARDS;
    const fallback = clampCardCount(cardCount, minCardsAllowed, MAX_CARDS);
    setCardCount(fallback);
    setCardCountInput(String(fallback));
  }, [cardCount, customWords.length]);

  const handleAddCustomWords = useCallback(async () => {
    if (isImporting) return;
    setIsImporting(true);
    try {
      const parsedEntries = parseCustomWordInput(customInput);
      if (parsedEntries.length === 0) {
        const message = 'No importable lines found. Use "word : translation" format.';
        setCustomFeedback(null);
        setCustomError(message);
        showNativeCopyToast(message);
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
          pronHintEn: entry.pronHintEn,
          isCustom: true,
          language: practiceLanguage,
        });
      }
      if (additions.length === 0) {
        const message = 'Those words are already in your custom cards.';
        setCustomFeedback(null);
        setCustomError(message);
        showNativeCopyToast(message);
        return;
      }
      let targetDeckId = importDeckId;
      let targetDeckLabel = availableDecks.find((deck) => deck.id === importDeckId)?.name ?? 'selected deck';
      if (importDeckMode === 'new') {
        const trimmed = newDeckName.trim();
        const deckName = trimmed || buildDefaultImportDeckName();
        const createdDeck = await createDeck(deckName);
        await setSelectedDeck(createdDeck.id);
        targetDeckId = createdDeck.id;
        targetDeckLabel = createdDeck.name;
      }
      await setSelectedDeck(targetDeckId);
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
          pronHintEn: normalizeDefinitionToken(word.pronHintEn),
          createdAt: importSeed + index,
        });
      }
      await addCards(importedCards);
      const refreshedTargetDeckCards = await getWordCards(targetDeckId);
      const targetDeckWords = toDeckWords(refreshedTargetDeckCards, practiceLanguage);
      setCustomWords(targetDeckWords);
      if (customEditorSource === 'start_screen' && customInputSource === 'clipboard_prefill') {
        void trackEvent('clipboard_start_screen_cards_added', {
          language: practiceLanguage,
          added_count: additions.length,
          parsed_count: parsedEntries.length,
          deck_mode: importDeckMode,
        });
      }
      await refreshDeckTargets();
      setCustomInput('');
      setNewDeckName(buildDefaultImportDeckName());
      setImportDeckMode('new');
      setCustomInputSource('manual');
      setCustomError(null);
      setShowCustomEditor(false);
      if (!hasPresetWords) {
        setModalDismissed(false);
        setStopModalVisible(false);
        setSkippedCountsById({});
        setIncorrectCountsById({});
        lastClearedRef.current = false;
        lastRecordedCorrectIdRef.current = null;
        lastRecordedIncorrectIdRef.current = null;
        startSession({
          cardCount: Math.round(cardCount),
          customWords: targetDeckWords,
          language: practiceLanguage,
          includeDefaultWords,
        });
      }
      const message =
        `Imported ${additions.length} word${additions.length === 1 ? '' : 's'} to ${targetDeckLabel}.`;
      setCustomFeedback(message);
      showNativeCopyToast(message);
    } catch {
      const message = 'Import failed. Please try again.';
      setCustomFeedback(null);
      setCustomError(message);
      showNativeCopyToast(message);
    } finally {
      setIsImporting(false);
    }
  }, [
    availableDecks,
    customInput,
    customWords,
    importDeckId,
    importDeckMode,
    newDeckName,
    customEditorSource,
    customInputSource,
    isImporting,
    practiceLanguage,
    refreshDeckTargets,
    hasPresetWords,
    cardCount,
    startSession,
    includeDefaultWords,
    showNativeCopyToast,
  ]);

  const handleClearCustomCards = useCallback(async () => {
    setCustomWords([]);
    setCustomInput('');
    setCustomError(null);
    setShowCustomEditor(false);
    setCustomFeedback('Cleared the import draft. Imported deck cards remain in their deck.');
  }, []);

  const handleToggleCustomEditor = useCallback(() => {
    const nextOpenState = !showCustomEditor;
    setShowCustomEditor(nextOpenState);
    if (!nextOpenState) return;
    const source: CustomEditorSource = state ? 'in_session' : 'start_screen';
    setCustomEditorSource(source);
    setImportDeckMode('new');
    if (!newDeckName.trim()) {
      setNewDeckName(buildDefaultImportDeckName());
    }
    setCustomInputSource('manual');
    void trackEvent('add_cards_button_clicked', {
      source,
      language: practiceLanguage,
    });
    void (async () => {
      try {
        await refreshDeckTargets();
        const clipboardText = await readClipboardText();
        const prefilledInput = stringifyParsedCustomInput(
          parseCustomWordInput(clipboardText)
        );
        if (!prefilledInput) {
          const message = 'Clipboard has no importable lines.';
          setCustomFeedback(null);
          setCustomError(message);
          showNativeCopyToast(message);
          return;
        }
        setCustomInput(prefilledInput);
        setCustomInputSource('clipboard_prefill');
        setCustomFeedback(null);
        setCustomError(null);
      } catch {
        // ignore clipboard failures
      }
    })();
  }, [newDeckName, practiceLanguage, refreshDeckTargets, showCustomEditor, showNativeCopyToast, state]);

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

  const showPhotoPromptCta = Boolean(
    state?.uiState === 'FEEDBACK_WRONG' &&
      currentWordHint &&
      currentWordHint.seenCount >= 2 &&
      !currentWordHint.photo &&
      !currentWordHint.photoPromptDismissed
  );

  const closePhotoLightbox = useCallback(() => {
    releasePhotoHintDisplayUri(photoLightboxUri);
    setPhotoLightboxUri(null);
    setPhotoLightboxVisible(false);
    setPhotoLightboxLoading(false);
  }, [photoLightboxUri]);

  const handleOpenPhotoHint = useCallback(() => {
    if (!currentWordHint?.photo) return;
    setPhotoLightboxVisible(true);
    setPhotoLightboxLoading(true);
    void resolvePhotoHintDisplayUri(currentWordHint.photo)
      .then((resolvedUri) => {
        setPhotoLightboxUri((previous) => {
          if (previous && previous !== resolvedUri) {
            releasePhotoHintDisplayUri(previous);
          }
          return resolvedUri;
        });
      })
      .finally(() => {
        setPhotoLightboxLoading(false);
      });
  }, [currentWordHint?.photo]);

  const handleAddPhotoHint = useCallback(() => {
    if (!currentWord?.id) return;
    void pickAndStorePhotoHint(currentWord.sourceCardId ?? currentWord.id).then(async (photo) => {
      if (!photo) return;
      if (currentWordHint?.photo) {
        await deleteStoredPhotoHint(currentWordHint.photo);
      }
      patchCurrentWordHint({
        photo,
        photoPromptDismissed: true,
      });
      showNativeCopyToast('Image hint added');
    });
  }, [currentWord, currentWordHint?.photo, patchCurrentWordHint, showNativeCopyToast]);

  const handleDismissPhotoPrompt = useCallback(() => {
    patchCurrentWordHint({ photoPromptDismissed: true });
  }, [patchCurrentWordHint]);

  const handleReplacePhotoHint = useCallback(() => {
    if (!currentWord?.id || !currentWordHint?.photo) return;
    void pickAndStorePhotoHint(currentWord.sourceCardId ?? currentWord.id).then(async (nextPhoto) => {
      if (!nextPhoto) return;
      await deleteStoredPhotoHint(currentWordHint.photo);
      patchCurrentWordHint({
        photo: nextPhoto,
        photoPromptDismissed: true,
      });
      closePhotoLightbox();
      showNativeCopyToast('Image hint replaced');
    });
  }, [closePhotoLightbox, currentWord, currentWordHint?.photo, patchCurrentWordHint, showNativeCopyToast]);

  const handleRemovePhotoHint = useCallback(() => {
    if (!currentWordHint?.photo) return;
    void deleteStoredPhotoHint(currentWordHint.photo).finally(() => {
      patchCurrentWordHint({
        photo: null,
        photoPromptDismissed: true,
      });
      closePhotoLightbox();
      showNativeCopyToast('Image hint removed');
    });
  }, [closePhotoLightbox, currentWordHint?.photo, patchCurrentWordHint, showNativeCopyToast]);

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
      if (currentWordHint) {
        patchCurrentWordHint({ wrongCount: currentWordHint.wrongCount + 1 });
      }
    }
  }, [
    currentWordHint,
    patchCurrentWordHint,
    recordSessionIncorrect,
    state?.uiState,
    state?.currentCardId,
  ]);

  useEffect(() => {
    if (state?.uiState === 'PROMPT') {
      lastRecordedIncorrectIdRef.current = null;
    }
  }, [state?.uiState, state?.currentCardId]);

  useEffect(() => {
    setTypedAnswer('');
  }, [state?.currentCardId, state?.uiState]);

  useEffect(() => {
    const nextUiState = state?.uiState ?? null;
    const nextCardId = state?.currentCardId ?? null;
    if (
      nextUiState === 'PROMPT' &&
      currentWordHint &&
      (previousUiStateRef.current !== 'PROMPT' || previousCardIdRef.current !== nextCardId)
    ) {
      patchCurrentWordHint({ seenCount: currentWordHint.seenCount + 1 });
    }
    previousUiStateRef.current = nextUiState;
    previousCardIdRef.current = nextCardId;
  }, [currentWordHint, patchCurrentWordHint, state?.currentCardId, state?.uiState]);

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
      startSession({
        cardCount: count,
        customWords,
        language: practiceLanguage,
        includeDefaultWords,
      });
    },
    [customWords, includeDefaultWords, practiceLanguage, startSession]
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

  const copyMissedWordsToClipboard = useCallback(async () => {
    const exportText = buildMissedWordsListExport(missedWordExportItems);
    await Clipboard.setStringAsync(exportText);
    const toastMessage =
      uniqueMissCount > 0
        ? `Copied ${uniqueMissCount} missed/unknown words to clipboard`
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
    return () => {
      releasePhotoHintDisplayUri(photoLightboxUri);
    };
  }, [photoLightboxUri]);

  useEffect(() => {
    if (state?.cleared) {
      getBestClearMs().then(setBestTimeMs);
    }
  }, [state?.cleared]);


  const aiSessionMode: 'words' | 'phrases' = hasPresetWords ? 'phrases' : 'words';
  const aiDerived = React.useMemo(
    () => buildAiPrompt(Math.round(cardCount), aiBuilderConfig, aiSessionMode),
    [aiBuilderConfig, aiSessionMode, cardCount]
  );

  const updateAiBuilder = useCallback((next: Partial<AiBuilderConfig>) => {
    setAiBuilderConfigState((prev) => ({ ...prev, ...next, touched: true }));
  }, []);

  const handleToggleTheme = useCallback((themeLabel: string) => {
    setAiBuilderConfigState((prev) => {
      const exists = prev.themes.includes(themeLabel);
      const themes = exists
        ? prev.themes.filter((value) => value !== themeLabel)
        : [...prev.themes, themeLabel].slice(0, 3);
      return { ...prev, themes, touched: true };
    });
  }, []);

  const handleCopyAiPrompt = useCallback(async () => {
    try {
      await Clipboard.setStringAsync(aiDerived.compiledPrompt);
      showNativeCopyToast('Full AI prompt copied');
    } catch {
      Alert.alert('Copy failed', 'Could not copy the AI prompt to your clipboard.');
    }
  }, [aiDerived.compiledPrompt, showNativeCopyToast]);

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
        Paste words with optional definitions (ex: casa:house or casa,house). Import while practicing.
      </Text>
      <TextInput
        style={styles.customInput}
        value={customInput}
        onChangeText={(value) => {
          setCustomInput(value);
          setCustomInputSource('manual');
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
            isImporting && styles.startButtonDisabled,
            pressed && styles.customSaveButtonPressed,
          ]}
          onPress={() => {
            void handleAddCustomWords();
          }}
          disabled={isImporting}
        >
          <Text style={styles.customSaveButtonLabel}>
            {isImporting ? 'Importing...' : 'Import collection'}
          </Text>
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
            disabled={isImporting}
          >
            <Text style={styles.customClearButtonLabel}>Clear all</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.deckTargetSection}>
        <Text style={styles.deckTargetLabel}>Import target (defaults to new deck)</Text>
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
          <View style={styles.cardCountInputRow}>
            <Text style={styles.startHintText}>Manual input</Text>
            <TextInput
              style={styles.cardCountInput}
              value={cardCountInput}
              onChangeText={handleCardCountInputChange}
              onBlur={handleCardCountInputBlur}
              keyboardType="number-pad"
              placeholder={String(minCardsAllowed)}
              placeholderTextColor={theme.textMuted}
              maxLength={4}
            />
          </View>
          <Slider
            style={styles.slider}
            minimumValue={minCardsAllowed}
            maximumValue={MAX_CARDS}
            step={CARD_COUNT_STEP}
            value={cardCount}
            onValueChange={handleCardCountSliderChange}
            minimumTrackTintColor={theme.brand}
            maximumTrackTintColor={theme.stroke}
            thumbTintColor={theme.brand}
          />
          <View style={styles.startHint}>
            <Text style={styles.startHintText}>
              {minCardsAllowed} - {MAX_CARDS} default cards · slider snaps by {CARD_COUNT_STEP}
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
          <Pressable
            style={({ pressed }) => [
              styles.aiInlineCard,
              pressed && styles.aiInlineCardPressed,
            ]}
            onPress={() => setShowAiBuilder(true)}
          >
            <View style={styles.aiInlineHeaderRow}>
              <Text style={styles.aiInlineLabel}>Custom AI Deck (optional)</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.aiCopyButton,
                  !aiDerived.copyEnabled && styles.aiCopyButtonDisabled,
                  pressed && aiDerived.copyEnabled && styles.aiCopyButtonPressed,
                ]}
                onPress={handleCopyAiPrompt}
                disabled={!aiDerived.copyEnabled}
              >
                <Text style={styles.aiCopyButtonLabel}>Copy</Text>
              </Pressable>
            </View>
            {!aiDerived.copyEnabled ? (
              <Text style={styles.aiInlinePreview}>Generate AI flashcards for a custom topic</Text>
            ) : (
              <View style={styles.aiPromptSummary}>
                <View style={styles.aiPromptRow}>
                  <Text style={styles.aiPromptText}>Make </Text>
                  <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{String(Math.round(cardCount))}</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> </Text>
                  <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{getPracticeLanguageLabel(aiBuilderConfig.targetLanguage)}</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> cards</Text>
                </View>
                {(aiBuilderConfig.themes.length > 0 || Boolean(aiBuilderConfig.customTheme)) && (
                  <View style={styles.aiPromptRow}>
                    <Text style={styles.aiPromptText}>for </Text>
                    {aiBuilderConfig.themes.map((t) => (
                      <React.Fragment key={t}>
                        <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                          <Text style={styles.aiInlinePillText}>{t}</Text>
                        </Pressable>
                        <Text style={styles.aiPromptText}> </Text>
                      </React.Fragment>
                    ))}
                    {Boolean(aiBuilderConfig.customTheme) && (
                      <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                        <Text style={styles.aiInlinePillText}>{aiBuilderConfig.customTheme}</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                <View style={styles.aiPromptRow}>
                  <Pressable style={[styles.aiInlinePill, styles.aiInlinePillTone]} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{(TONE_EMOJI[aiBuilderConfig.tone] ?? '')}{aiBuilderConfig.tone}</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> · </Text>
                  <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{aiBuilderConfig.difficulty}</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> · </Text>
                  <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{aiBuilderConfig.mix.replace(/_/g, ' ')}</Text>
                  </Pressable>
                </View>
                <View style={styles.aiPromptRow}>
                  <Pressable style={[styles.aiInlinePill, styles.aiInlinePillA1]} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{aiDerived.a1Count} A1</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> + </Text>
                  <Pressable style={[styles.aiInlinePill, styles.aiInlinePillA2]} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{aiDerived.a2Count} A2</Text>
                  </Pressable>
                  <Text style={styles.aiPromptText}> · </Text>
                  <Pressable style={styles.aiInlinePill} onPress={() => setShowAiBuilder(true)}>
                    <Text style={styles.aiInlinePillText}>{aiDerived.phraseCount}p / {aiDerived.wordCount}w</Text>
                  </Pressable>
                </View>
              </View>
            )}
            <Text style={styles.aiInlineFooter}>🔒 Optimized format for import</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.startSecondaryButton,
              pressed && styles.startSecondaryButtonPressed,
            ]}
            onPress={handleToggleCustomEditor}
          >
            <Text style={styles.startSecondaryButtonLabel}>Add from clipboard</Text>
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
        <Modal visible={showAiBuilder} animationType="slide" onRequestClose={() => setShowAiBuilder(false)}>
          <View style={styles.aiBuilderModal}>
            <View style={[styles.aiBuilderTopBar, { paddingTop: (insets.top || 0) + 6 }]}>
              <Pressable style={styles.aiTopBarButton} onPress={() => setShowAiBuilder(false)}>
                <Text style={styles.aiTopBarButtonLabel}>← Back</Text>
              </Pressable>
              <Text style={styles.aiBuilderTitle}>Build AI Deck</Text>
              <Pressable style={styles.aiTopBarButton} onPress={() => setShowAiBuilder(false)}>
                <Text style={styles.aiTopBarButtonLabel}>Save</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={[styles.aiBuilderContent, { paddingBottom: (insets.bottom || 0) + 24 }]}>
              <Text style={styles.aiSectionTitle}>Intent</Text>
              <TextInput
                style={styles.aiIntentInput}
                value={aiBuilderConfig.intent ?? ''}
                onChangeText={(value) => updateAiBuilder({ intent: value })}
                placeholder="What situations do you want to practice?"
                placeholderTextColor="rgba(255,255,255,0.55)"
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.aiSectionTitle}>Tokens</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.aiChipRow}>
                <Pressable style={styles.aiChip} onPress={() => updateAiBuilder({ targetLanguage: aiBuilderConfig.targetLanguage === 'pt' ? 'fr' : 'pt' })}>
                  <Text style={styles.aiChipLabel}>{getPracticeLanguageLabel(aiBuilderConfig.targetLanguage)}</Text>
                </Pressable>
                <Pressable style={styles.aiChip} onPress={() => {
                  const current = AI_NATIVE_LANGUAGE_OPTIONS.indexOf(aiBuilderConfig.nativeLanguage);
                  const next = AI_NATIVE_LANGUAGE_OPTIONS[(current + 1 + AI_NATIVE_LANGUAGE_OPTIONS.length) % AI_NATIVE_LANGUAGE_OPTIONS.length];
                  updateAiBuilder({ nativeLanguage: next });
                }}>
                  <Text style={styles.aiChipLabel}>{aiBuilderConfig.nativeLanguage}</Text>
                </Pressable>
                <Pressable style={styles.aiChip} onPress={() => {
                  const idx = AI_TONE_OPTIONS.indexOf(aiBuilderConfig.tone);
                  updateAiBuilder({ tone: AI_TONE_OPTIONS[(idx + 1) % AI_TONE_OPTIONS.length] });
                }}>
                  <Text style={styles.aiChipLabel}>Tone: {aiBuilderConfig.tone}</Text>
                </Pressable>
                <Pressable style={styles.aiChip} onPress={() => {
                  const idx = AI_DIFFICULTY_OPTIONS.indexOf(aiBuilderConfig.difficulty);
                  updateAiBuilder({ difficulty: AI_DIFFICULTY_OPTIONS[(idx + 1) % AI_DIFFICULTY_OPTIONS.length] });
                }}>
                  <Text style={styles.aiChipLabel}>Difficulty: {aiBuilderConfig.difficulty}</Text>
                </Pressable>
                <Pressable style={styles.aiChip} onPress={() => {
                  const idx = AI_MIX_OPTIONS.indexOf(aiBuilderConfig.mix);
                  updateAiBuilder({ mix: AI_MIX_OPTIONS[(idx + 1) % AI_MIX_OPTIONS.length] });
                }}>
                  <Text style={styles.aiChipLabel}>Mix: {aiBuilderConfig.mix}</Text>
                </Pressable>
              </ScrollView>
              <View style={styles.aiThemeWrap}>
                {AI_THEME_OPTIONS.map((themeOption) => {
                  const selected = aiBuilderConfig.themes.includes(themeOption);
                  return (
                    <Pressable
                      key={themeOption}
                      style={[styles.aiThemeChip, selected && styles.aiThemeChipSelected]}
                      onPress={() => handleToggleTheme(themeOption)}
                    >
                      <Text style={styles.aiThemeChipLabel}>{themeOption}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.aiCustomThemeInput}
                value={aiBuilderConfig.customTheme ?? ''}
                onChangeText={(value) => updateAiBuilder({ customTheme: value })}
                placeholder="Custom theme (optional)"
                placeholderTextColor="rgba(255,255,255,0.55)"
              />
              <Text style={styles.aiCountText}>Number of cards: {Math.round(cardCount)}</Text>
            </ScrollView>
          </View>
        </Modal>
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
          deckCount={state.deckCount}
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
            word={currentWordWithHint}
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
            showPhotoPromptCta={showPhotoPromptCta}
            onAddPhotoHint={handleAddPhotoHint}
            onDismissPhotoPrompt={handleDismissPhotoPrompt}
            showPhotoHintLink={Boolean(state.uiState !== 'PROMPT' && currentWordHint?.photo)}
            onOpenPhotoHint={handleOpenPhotoHint}
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
      <Modal
        visible={photoLightboxVisible}
        transparent
        animationType="fade"
        onRequestClose={closePhotoLightbox}
      >
        <View style={styles.photoModalBackdrop}>
          <View style={styles.photoModalTopRow}>
            <Pressable style={styles.photoModalClose} onPress={closePhotoLightbox}>
              <Text style={styles.photoModalCloseLabel}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.photoModalImageWrap}>
            {photoLightboxLoading ? (
              <Text style={styles.photoModalLoading}>Loading image…</Text>
            ) : photoLightboxUri ? (
              <Image
                source={{ uri: photoLightboxUri }}
                resizeMode="contain"
                style={styles.photoModalImage}
              />
            ) : (
              <Text style={styles.photoModalLoading}>Image unavailable</Text>
            )}
          </View>
          <View style={[styles.photoModalActions, { paddingBottom: (insets.bottom || 0) + 16 }]}>
            <Pressable style={styles.photoModalActionPrimary} onPress={handleReplacePhotoHint}>
              <Text style={styles.photoModalActionPrimaryLabel}>Replace image</Text>
            </Pressable>
            <Pressable style={styles.photoModalActionSecondary} onPress={handleRemovePhotoHint}>
              <Text style={styles.photoModalActionSecondaryLabel}>Remove image</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  cardCountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  cardCountInput: {
    minWidth: 88,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.textPrimary,
    backgroundColor: theme.surface,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
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
    fontSize: WEB_INPUT_FONT_SIZE,
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
    fontSize: WEB_INPUT_FONT_SIZE,
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
  startSecondaryButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
  },
  startSecondaryButtonPressed: {
    opacity: 0.9,
  },
  startSecondaryButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  aiInlineCard: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
    padding: 16,
    gap: 8,
  },
  aiInlineCardPressed: {
    opacity: 0.93,
  },
  aiInlineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  aiInlineLabel: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: '600',
  },
  aiInlinePreview: {
    fontSize: 18,
    color: theme.textPrimary,
    fontWeight: '700',
  },
  aiPromptSummary: {
    gap: 6,
  },
  aiPromptRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  aiPromptText: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  aiInlinePill: {
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: theme.selectedBg,
    borderWidth: 1,
    borderColor: theme.selectedBorder,
  },
  aiInlinePillTone: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warningBorder,
  },
  aiInlinePillA1: {
    backgroundColor: theme.successBg,
    borderColor: theme.successBorder,
  },
  aiInlinePillA2: {
    backgroundColor: theme.warningBg,
    borderColor: theme.warningBorder,
  },
  aiInlinePillText: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  aiInlineFooter: {
    fontSize: 12,
    color: theme.textMuted,
  },
  aiCopyButton: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBgMuted,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  aiCopyButtonDisabled: {
    opacity: 0.4,
  },
  aiCopyButtonPressed: {
    opacity: 0.92,
  },
  aiCopyButtonLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 12,
  },
  aiBuilderModal: {
    flex: 1,
    backgroundColor: theme.bg0,
  },
  aiBuilderTopBar: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: theme.stroke,
  },
  aiBuilderTitle: {
    color: theme.textPrimary,
    fontSize: 17,
    fontWeight: '700',
  },
  aiTopBarButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  aiTopBarButtonLabel: {
    color: theme.link,
    fontSize: 14,
    fontWeight: '700',
  },
  aiBuilderContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  aiSectionTitle: {
    color: theme.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  aiIntentInput: {
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBg,
    color: theme.textPrimary,
    padding: 10,
    fontSize: WEB_INPUT_FONT_SIZE,
  },
  aiChipRow: {
    gap: 8,
    paddingVertical: 2,
  },
  aiChip: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  aiChipLabel: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  aiThemeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aiThemeChip: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
    paddingHorizontal: 10,
    justifyContent: 'center',
  },
  aiThemeChipSelected: {
    backgroundColor: theme.selectedBg,
    borderColor: theme.selectedBorder,
  },
  aiThemeChipLabel: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  aiCustomThemeInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
    backgroundColor: theme.panelBg,
    color: theme.textPrimary,
    paddingHorizontal: 10,
    fontSize: WEB_INPUT_FONT_SIZE,
  },
  aiCountText: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '600',
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
  photoModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8, 8, 12, 0.94)',
  },
  photoModalTopRow: {
    paddingTop: 48,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
  },
  photoModalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  photoModalCloseLabel: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  photoModalImageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  photoModalImage: {
    width: '100%',
    height: '100%',
  },
  photoModalLoading: {
    color: theme.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  photoModalActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  photoModalActionPrimary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: theme.selectedBorder,
    backgroundColor: theme.selectedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalActionPrimaryLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  photoModalActionSecondary: {
    flex: 1,
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoModalActionSecondaryLabel: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
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
