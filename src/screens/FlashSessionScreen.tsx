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
} from '../lib/storage';
import { playWordAudio, stopWordAudio } from '../lib/audio';
import { theme } from '../theme';

const bgImage = require('../../v1/bg.png');

const MIN_CARDS = 50;
const DEFAULT_CARDS = 200;
const MAX_CARDS = DECK_LENGTH;

type ParsedCustomEntry = {
  term: string;
  en?: string;
};

type MissedWordExportItem = {
  id: string;
  term: string;
  en: string;
  pronHintEn?: string;
  misses: number;
};

function normalizeWordToken(value: string): string {
  return value.replace(/\s+/g, '').trim();
}

function normalizeDefinitionToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function parseCustomWordInput(raw: string): ParsedCustomEntry[] {
  const tokens = raw.match(/[^\s,;]+/g) ?? [];
  const parsed: ParsedCustomEntry[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === ':' || token === '=' || token === '-') continue;

    let termToken = token;
    let enToken: string | undefined;

    const inlineSep = token.match(/^(.+?)([:=])(.*)$/);
    if (inlineSep) {
      termToken = inlineSep[1];
      enToken = normalizeDefinitionToken(inlineSep[3]);
      if (!enToken && tokens[i + 1] && ![':', '=', '-'].includes(tokens[i + 1])) {
        enToken = normalizeDefinitionToken(tokens[i + 1]);
        i += 1;
      }
    } else if ((tokens[i + 1] === ':' || tokens[i + 1] === '=') && tokens[i + 2]) {
      enToken = normalizeDefinitionToken(tokens[i + 2]);
      i += 2;
    } else if (tokens[i + 1] === '-' && tokens[i + 2]) {
      enToken = normalizeDefinitionToken(tokens[i + 2]);
      i += 2;
    }

    const term = normalizeWordToken(termToken);
    if (!term) continue;

    const key = term.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    parsed.push({ term, en: enToken });
  }

  return parsed;
}

function stringifyParsedCustomInput(entries: ParsedCustomEntry[]): string {
  return entries
    .map((entry) => (entry.en ? `${entry.term}:${entry.en}` : entry.term))
    .join(' ');
}

function buildMissedWordsListExport(items: MissedWordExportItem[]): string {
  const ordered = [...items].sort((a, b) => a.term.localeCompare(b.term));
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

export function FlashSessionScreen() {
  const insets = useSafeAreaInsets();
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
  const [showCustomTooltip, setShowCustomTooltip] = React.useState(false);
  const [customFeedback, setCustomFeedback] = React.useState<string | null>(null);
  const [customError, setCustomError] = React.useState<string | null>(null);
  const [customWordsLoaded, setCustomWordsLoaded] = React.useState(false);
  const [modalDismissed, setModalDismissed] = React.useState(false);
  const [stopModalVisible, setStopModalVisible] = React.useState(false);
  const [skippedCountsById, setSkippedCountsById] = React.useState<Record<string, number>>({});
  const [incorrectCountsById, setIncorrectCountsById] = React.useState<Record<string, number>>({});
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = React.useState<number>(0.5);
  const [showGestureDemo, setShowGestureDemo] = React.useState(false);
  const [practiceLanguage, setPracticeLanguage] = React.useState<PracticeLanguage>('pt');
  const [showSchedulerDebug, setShowSchedulerDebug] = React.useState(false);
  const lastClearedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userHasEnabledAudioRef = useRef(false);
  const lastRecordedCorrectIdRef = useRef<string | null>(null);
  const lastRecordedIncorrectIdRef = useRef<string | null>(null);
  const gestureDemoShownRef = useRef(false);
  const sessionInitRanRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void getPracticeLanguage()
        .then(async (language) => {
          if (cancelled) return;
          setPracticeLanguage(language);
          const words = await getCustomWords(language);
          if (cancelled) return;
          setCustomWords(words);
        })
        .finally(() => {
          if (!cancelled) setCustomWordsLoaded(true);
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

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
    const seed = Date.now();
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
        id: `custom-${seed}-${index}`,
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
    const nextCustomWords = [...customWords, ...additions];
    setCustomWords(nextCustomWords);
    await saveCustomWords(nextCustomWords, practiceLanguage);
    setCustomInput('');
    setCustomError(null);
    setShowCustomEditor(false);
    setCustomFeedback(
      `Added ${additions.length} custom card${additions.length === 1 ? '' : 's'}.`
    );
  }, [customInput, customWords, practiceLanguage]);

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
    setShowCustomTooltip(false);
    if (!nextOpenState) return;
    void (async () => {
      try {
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
  }, [showCustomEditor]);

  const recordSessionSkip = useCallback((wordId: string) => {
    setSkippedCountsById((prev) => ({ ...prev, [wordId]: (prev[wordId] ?? 0) + 1 }));
  }, []);

  const recordSessionIncorrect = useCallback((wordId: string) => {
    setIncorrectCountsById((prev) => ({ ...prev, [wordId]: (prev[wordId] ?? 0) + 1 }));
  }, []);

  const handlePlayAudio = useCallback((rate: number) => {
    if (!currentWord) return;
    userHasEnabledAudioRef.current = true;
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
  }, [playbackRate]);

  const handleSwipeLeft = useCallback(() => {
    if (state?.currentCardId) {
      recordWordDontKnow(state.currentCardId);
      recordSessionSkip(state.currentCardId);
    }
    swipeLeft();
  }, [recordSessionSkip, swipeLeft, state?.currentCardId]);

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

  // Optional autoplay: after first tap, on new card use persisted playback rate
  useEffect(() => {
    if (
      state?.uiState !== 'PROMPT' ||
      !currentWord ||
      !userHasEnabledAudioRef.current
    )
      return;
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
    const combinedCountsById: Record<string, number> = {};
    for (const [id, count] of Object.entries(skippedCountsById)) {
      combinedCountsById[id] = (combinedCountsById[id] ?? 0) + count;
    }
    for (const [id, count] of Object.entries(incorrectCountsById)) {
      combinedCountsById[id] = (combinedCountsById[id] ?? 0) + count;
    }
    return Object.entries(combinedCountsById)
      .map(([id, misses]) => {
        const word = getWordByIdForLanguage(id, practiceLanguage);
        if (!word?.en) return null;
        return {
          id,
          term: word.term,
          en: word.en,
          pronHintEn: word.pronHintEn,
          misses,
        } as MissedWordExportItem;
      })
      .filter((item): item is MissedWordExportItem => item != null)
      .sort((a, b) => b.misses - a.misses || a.term.localeCompare(b.term));
  }, [incorrectCountsById, practiceLanguage, skippedCountsById]);
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

  const showNativeCopyToast = useCallback((message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    if (Platform.OS === 'web') {
      setToastMessage(message);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 2200);
      return;
    }
    Alert.alert('Copied', message);
  }, []);

  const handleStopAndCopy = useCallback(async () => {
    const exportText = buildMissedWordsListExport(missedWordExportItems);
    try {
      await Clipboard.setStringAsync(exportText);
      const toastMessage =
        uniqueMissCount > 0
          ? `Copied ${uniqueMissCount} missed words to clipboard`
          : 'Copied to clipboard';
      showNativeCopyToast(toastMessage);
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
  }, [missedWordExportItems, showNativeCopyToast, stopSession, uniqueMissCount]);

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

  // Start screen: choose number of cards then begin
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
        {showCustomEditor && (
          <View
            style={[
              styles.customEditorSheet,
              { bottom: Math.max(insets.bottom || 0, 10) + 90 },
            ]}
          >
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
              Use spaces, commas, or new lines to separate words.
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
                <Text style={styles.customSaveButtonLabel}>Create cards</Text>
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
          </View>
        )}
        {showCustomTooltip && (
          <View
            style={[
              styles.customTooltip,
              { bottom: Math.max(insets.bottom || 0, 10) + 140 },
            ]}
          >
            <Text style={styles.customTooltipText}>
              Add words separated by spaces. Optional definition format:
              casa:house, casa=house, or casa - house.
            </Text>
          </View>
        )}
        <View
          style={[
            styles.floatingButtons,
            { bottom: Math.max(insets.bottom || 0, 10) + 16 },
          ]}
        >
          <Pressable
            style={({ pressed }) => [
              styles.customIconButton,
              styles.customInfoButton,
              pressed && styles.customIconButtonPressed,
            ]}
            onPress={() => {
              setShowCustomTooltip((prev) => !prev);
            }}
          >
            <FontAwesome5 name="info-circle" size={16} color={theme.textPrimary} solid />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.customIconButton,
              styles.customAddButton,
              pressed && styles.customIconButtonPressed,
            ]}
            onPress={() => {
              handleToggleCustomEditor();
            }}
          >
            <FontAwesome5 name="plus" size={18} color={theme.textPrimary} solid />
          </Pressable>
        </View>
        {Platform.OS === 'web' && toastMessage && (
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
    <ImageBackground
      source={bgImage}
      style={[styles.screen, { paddingTop: (insets.top || 0) + theme.safeAreaTopOffset }]}
      resizeMode="cover"
    >
      <HeaderHUD
        rightCount={state.rightCount}
        incorrectCount={state.incorrectCount}
        skippedCount={state.skippedCount}
        remaining={remaining}
        startedAt={state.startedAt}
        frozen={state.cleared || stopModalVisible}
      />
      <View style={styles.content}>
        <FlashCard
          word={currentWord}
          uiState={state.uiState}
          choiceOptions={state.choiceOptions}
          correctChoiceIndex={state.correctChoiceIndex}
          selectedChoiceIndex={state.selectedChoiceIndex}
          onSwipeLeft={handleSwipeLeft}
          onSwipeRight={swipeRight}
          onSwipeUp={swipeUp}
          onChooseOption={chooseOption}
          onAdvance={advanceToNextCard}
          onPlayAudio={handlePlayAudio}
          onTapToSkip={handleTapToSkip}
          playbackRate={playbackRate}
          onCycleSpeed={handleCycleSpeed}
          disabled={state.cleared || stopModalVisible || showGestureDemo}
        />
      </View>
      <View style={[styles.debugPanelWrap, { top: (insets.top || 0) + 62 }]}>
        <Pressable
          style={({ pressed }) => [styles.debugToggle, pressed && styles.debugTogglePressed]}
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
        onRunAgain={handleRunAgain}
        onDone={handleDone}
      />
      <StopSessionModal
        visible={stopModalVisible}
        uniqueMissCount={uniqueMissCount}
        onResume={handleResumeSession}
        onStopAndCopy={handleStopAndCopy}
      />
      {Platform.OS === 'web' && toastMessage && (
        <View pointerEvents="none" style={[styles.webToastWrap, { bottom: toastBottomOffset }]}>
          <View style={styles.webToast}>
            <Text style={styles.webToastText}>{toastMessage}</Text>
          </View>
        </View>
      )}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bg0,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: theme.cardStagePaddingVertical,
    paddingHorizontal: 24,
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
    borderColor: 'rgba(255,255,255,0.35)',
    ...theme.cardShadow,
  },
  customInfoButton: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  customAddButton: {
    backgroundColor: theme.brand,
  },
  customIconButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.97 }],
  },
  customTooltip: {
    position: 'absolute',
    right: 18,
    maxWidth: 270,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(5,11,28,0.96)',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  customTooltipText: {
    fontSize: 12,
    lineHeight: 17,
    color: theme.textPrimary,
  },
  customEditorSheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(9,14,34,0.97)',
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
    borderColor: 'rgba(255,255,255,0.3)',
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
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(3,7,20,0.8)',
    color: theme.textPrimary,
    padding: 10,
    fontSize: 14,
  },
  customActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  customSaveButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C4DFF',
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
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    color: '#FF7B91',
    textAlign: 'center',
    marginTop: 10,
  },
  customFeedbackText: {
    fontSize: 13,
    color: '#7CFFB5',
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
    borderColor: 'rgba(255,255,255,0.22)',
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
    backgroundColor: 'rgba(8,12,26,0.92)',
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
  debugPanelWrap: {
    position: 'absolute',
    right: 16,
    zIndex: 25,
    alignItems: 'flex-end',
    gap: 8,
  },
  debugToggle: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(5,11,28,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(5,11,28,0.92)',
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
