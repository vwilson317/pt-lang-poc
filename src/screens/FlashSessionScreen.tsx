import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  Alert,
  Platform,
  ToastAndroid,
} from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
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
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const lastClearedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      setMissedCountsById({});
      lastClearedRef.current = false;
      lastRecordedCorrectIdRef.current = null;
      lastRecordedWrongIdRef.current = null;
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
        {Platform.OS === 'web' && toastMessage && (
          <View pointerEvents="none" style={[styles.webToastWrap, { bottom: (insets.bottom || 0) + 16 }]}>
            <View style={styles.webToast}>
              <FontAwesome5 name="check-circle" size={16} color={theme.good} solid />
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
        wrongCount={state.wrongCount}
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
          onChooseOption={chooseOption}
          onAdvance={advanceToNextCard}
          onPlayAudio={handlePlayAudio}
          disabled={state.cleared || stopModalVisible}
        />
      </View>
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
        <View pointerEvents="none" style={[styles.webToastWrap, { bottom: (insets.bottom || 0) + 16 }]}>
          <View style={styles.webToast}>
            <FontAwesome5 name="check-circle" size={16} color={theme.good} solid />
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
});
