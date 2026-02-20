import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ImageBackground, Pressable, Alert } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { HeaderHUD } from '../components/HeaderHUD';
import { FlashCard } from '../components/FlashCard';
import { CompletionModal } from '../components/CompletionModal';
import { StopSessionModal } from '../components/StopSessionModal';
import { useSession } from '../state/useSession';
import { getWordById, DECK_LENGTH } from '../data/words';
import {
  getBestClearMs,
  setBestClearMs,
  incrementRunsCount,
  recordWordDontKnow,
  recordWordKnow,
  getSuggestedSpeedAndConsume,
} from '../lib/storage';
import { playWordAudio, RATE_BASELINE } from '../lib/audio';
import { theme } from '../theme';

const bgImage = require('../../v1/bg.png');

const MIN_CARDS = 50;
const DEFAULT_CARDS = 200;
const MAX_CARDS = DECK_LENGTH;

type MissedWordExportItem = {
  id: string;
  pt: string;
  en: string;
  pronHintEn?: string;
  misses: number;
};

function buildMissedWordsListExport(items: MissedWordExportItem[]): string {
  const ordered = [...items].sort((a, b) => a.pt.localeCompare(b.pt));
  if (ordered.length === 0) return 'No missed words this session.';
  return ordered.map((item) => `${item.pt} - ${item.en}`).join('\n');
}

export function FlashSessionScreen() {
  const insets = useSafeAreaInsets();
  const [cardCount, setCardCount] = React.useState(DEFAULT_CARDS);
  const {
    state,
    remaining,
    swipeLeft,
    swipeRight,
    chooseOption,
    advanceToNextCard,
    startSession,
    startNewSession,
    stopSession,
    getClearTimeMs,
  } = useSession();

  const [modalDismissed, setModalDismissed] = React.useState(false);
  const [stopModalVisible, setStopModalVisible] = React.useState(false);
  const [missedCountsById, setMissedCountsById] = React.useState<Record<string, number>>({});
  const lastClearedRef = useRef(false);
  const userHasEnabledAudioRef = useRef(false);
  const lastRecordedCorrectIdRef = useRef<string | null>(null);
  const lastRecordedWrongIdRef = useRef<string | null>(null);

  const currentWord = state?.currentCardId
    ? getWordById(state.currentCardId) ?? null
    : null;

  const recordSessionMiss = useCallback((wordId: string) => {
    setMissedCountsById((prev) => ({ ...prev, [wordId]: (prev[wordId] ?? 0) + 1 }));
  }, []);

  const handlePlayAudio = useCallback((rate: number) => {
    if (!currentWord) return;
    userHasEnabledAudioRef.current = true;
    playWordAudio(currentWord, rate);
  }, [currentWord]);

  const handleSwipeLeft = useCallback(() => {
    if (state?.currentCardId) {
      recordWordDontKnow(state.currentCardId);
      recordSessionMiss(state.currentCardId);
    }
    swipeLeft();
  }, [recordSessionMiss, swipeLeft, state?.currentCardId]);

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

  // Record a miss once per card when answer feedback is wrong.
  useEffect(() => {
    if (
      state?.uiState === 'FEEDBACK_WRONG' &&
      state?.currentCardId &&
      state.currentCardId !== lastRecordedWrongIdRef.current
    ) {
      lastRecordedWrongIdRef.current = state.currentCardId;
      recordSessionMiss(state.currentCardId);
    }
  }, [recordSessionMiss, state?.uiState, state?.currentCardId]);

  useEffect(() => {
    if (state?.uiState === 'PROMPT') {
      lastRecordedWrongIdRef.current = null;
    }
  }, [state?.uiState, state?.currentCardId]);

  // Optional autoplay: after first tap, on new card use suggested speed (0.75 once after don't know, or 1.25 1/5 after 3+ know)
  useEffect(() => {
    if (
      state?.uiState !== 'PROMPT' ||
      !currentWord ||
      !userHasEnabledAudioRef.current
    )
      return;
    let cancelled = false;
    getSuggestedSpeedAndConsume(currentWord.id).then((rate) => {
      if (!cancelled) playWordAudio(currentWord, rate);
    });
    return () => {
      cancelled = true;
    };
  }, [state?.currentCardId, state?.uiState, currentWord]);

  // Auto-play when revealing "don't know" (hear the word at baseline)
  useEffect(() => {
    if (state?.uiState === 'REVEAL_DONT_KNOW' && currentWord) {
      playWordAudio(currentWord, RATE_BASELINE);
    }
  }, [state?.uiState, currentWord]);

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
    setMissedCountsById({});
    lastClearedRef.current = false;
    lastRecordedCorrectIdRef.current = null;
    lastRecordedWrongIdRef.current = null;
    startNewSession();
  }, [startNewSession]);

  const handleDone = useCallback(() => {
    setModalDismissed(true);
  }, []);

  const showModal = Boolean(state?.cleared && !modalDismissed);
  const [bestTimeMs, setBestTimeMs] = React.useState<number | null>(null);

  const missedWordExportItems = React.useMemo(() => {
    return Object.entries(missedCountsById)
      .map(([id, misses]) => {
        const word = getWordById(id);
        if (!word?.en) return null;
        return {
          id,
          pt: word.pt,
          en: word.en,
          pronHintEn: word.pronHintEn,
          misses,
        } as MissedWordExportItem;
      })
      .filter((item): item is MissedWordExportItem => item != null)
      .sort((a, b) => b.misses - a.misses || a.pt.localeCompare(b.pt));
  }, [missedCountsById]);
  const uniqueMissCount = missedWordExportItems.length;
  const totalMissCount = React.useMemo(
    () => missedWordExportItems.reduce((acc, item) => acc + item.misses, 0),
    [missedWordExportItems]
  );

  const handleStartSession = useCallback(
    (count: number) => {
      setModalDismissed(false);
      setStopModalVisible(false);
      setMissedCountsById({});
      lastClearedRef.current = false;
      lastRecordedCorrectIdRef.current = null;
      lastRecordedWrongIdRef.current = null;
      startSession(count);
    },
    [startSession]
  );

  const handleOpenStopModal = useCallback(() => {
    setStopModalVisible(true);
  }, []);

  const handleResumeSession = useCallback(() => {
    setStopModalVisible(false);
  }, []);

  const handleStopAndCopy = useCallback(async () => {
    const exportText = buildMissedWordsListExport(missedWordExportItems);
    try {
      await Clipboard.setStringAsync(exportText);
      Alert.alert(
        'Copied to clipboard',
        uniqueMissCount > 0
          ? `Missed words export copied (${uniqueMissCount} words).`
          : 'Session export copied.'
      );
    } catch {
      Alert.alert('Copy failed', 'Could not copy the export to your clipboard.');
    } finally {
      setStopModalVisible(false);
      setModalDismissed(false);
      setMissedCountsById({});
      lastClearedRef.current = false;
      lastRecordedCorrectIdRef.current = null;
      lastRecordedWrongIdRef.current = null;
      stopSession();
    }
  }, [missedWordExportItems, stopSession, uniqueMissCount]);

  useEffect(() => {
    if (state?.cleared) {
      getBestClearMs().then(setBestTimeMs);
    }
  }, [state?.cleared]);

  // Start screen: choose number of cards then begin
  if (!state) {
    const displayCount = Math.round(cardCount);
    return (
      <ImageBackground
        source={bgImage}
        style={[styles.screen, { paddingTop: (insets.top || 0) + theme.safeAreaTopOffset }]}
        resizeMode="cover"
      >
        <View style={styles.startContent}>
          <Text style={styles.startTitle}>Number of cards</Text>
          <Text style={styles.startCount}>{displayCount}</Text>
          <Slider
            style={styles.slider}
            minimumValue={MIN_CARDS}
            maximumValue={MAX_CARDS}
            step={1}
            value={cardCount}
            onValueChange={setCardCount}
            minimumTrackTintColor={theme.brand}
            maximumTrackTintColor={theme.stroke}
            thumbTintColor={theme.brand}
          />
          <View style={styles.startHint}>
            <Text style={styles.startHintText}>{MIN_CARDS} – {MAX_CARDS} (all)</Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.startButton, pressed && styles.startButtonPressed]}
            onPress={() => handleStartSession(displayCount)}
          >
            <Text style={styles.startButtonLabel}>Start</Text>
          </Pressable>
        </View>
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
        wrongCount={state.wrongCount}
        remaining={remaining}
        startedAt={state.startedAt}
        frozen={state.cleared || stopModalVisible}
        onStopPress={handleOpenStopModal}
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
          onChooseOption={chooseOption}
          onAdvance={advanceToNextCard}
          onPlayAudio={handlePlayAudio}
          disabled={state.cleared || stopModalVisible}
        />
      </View>
      <CompletionModal
        visible={showModal}
        bestTimeMs={bestTimeMs}
        onRunAgain={handleRunAgain}
        onDone={handleDone}
      />
      <StopSessionModal
        visible={stopModalVisible}
        uniqueMissCount={uniqueMissCount}
        totalMissCount={totalMissCount}
        onResume={handleResumeSession}
        onStopAndCopy={handleStopAndCopy}
      />
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
    flex: 1,
    justifyContent: 'center',
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
    marginBottom: 32,
  },
  startHintText: {
    fontSize: 14,
    color: theme.textMuted,
    textAlign: 'center',
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
  startButtonLabel: {
    fontSize: theme.buttonLabelSize,
    fontWeight: theme.buttonLabelWeight,
    color: theme.textPrimary,
  },
});
