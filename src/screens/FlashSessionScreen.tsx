import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Pressable,
  TextInput,
  ScrollView,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderHUD } from '../components/HeaderHUD';
import { FlashCard } from '../components/FlashCard';
import { CompletionModal } from '../components/CompletionModal';
import type { Word } from '../types/word';
import { useSession } from '../state/useSession';
import { DECK_LENGTH } from '../data/words';
import {
  getBestClearMs,
  setBestClearMs,
  incrementRunsCount,
  recordWordDontKnow,
  recordWordKnow,
  getSuggestedSpeedAndConsume,
  getCustomWords,
  saveCustomWords,
  clearCustomWords,
} from '../lib/storage';
import { playWordAudio, RATE_BASELINE } from '../lib/audio';
import { theme } from '../theme';

const bgImage = require('../../v1/bg.png');

const MIN_CARDS = 50;
const DEFAULT_CARDS = 200;
const MAX_CARDS = DECK_LENGTH;

type ParsedCustomWord = {
  pt: string;
  en?: string;
};

function normalizeCustomText(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseCustomWordInput(raw: string): ParsedCustomWord[] {
  const entries = raw
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsed: ParsedCustomWord[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const pairWithEqualsOrColon = entry.match(/^(.+?)\s*(?:=|:)\s*(.+)$/);
    const pairWithDashedSeparator = entry.match(/^(.+?)\s+-\s+(.+)$/);
    const lhs = pairWithEqualsOrColon?.[1] ?? pairWithDashedSeparator?.[1];
    const rhs = pairWithEqualsOrColon?.[2] ?? pairWithDashedSeparator?.[2];
    const pt = normalizeCustomText(lhs ?? entry);
    const en = normalizeCustomText(rhs);
    if (!pt) continue;
    const key = pt.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ pt, en });
  }
  return parsed;
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
    chooseOption,
    advanceToNextCard,
    startSession,
    startNewSession,
    getClearTimeMs,
  } = useSession();

  const [customWords, setCustomWords] = React.useState<Word[]>([]);
  const [customInput, setCustomInput] = React.useState('');
  const [showCustomEditor, setShowCustomEditor] = React.useState(false);
  const [customFeedback, setCustomFeedback] = React.useState<string | null>(null);
  const [customError, setCustomError] = React.useState<string | null>(null);
  const [customWordsLoaded, setCustomWordsLoaded] = React.useState(false);
  const [modalDismissed, setModalDismissed] = React.useState(false);
  const lastClearedRef = useRef(false);
  const userHasEnabledAudioRef = useRef(false);
  const lastRecordedCorrectIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCustomWords()
      .then((words) => {
        if (cancelled) return;
        setCustomWords(words);
      })
      .finally(() => {
        if (!cancelled) setCustomWordsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (customWords.length === 0 && cardCount < MIN_CARDS) {
      setCardCount(MIN_CARDS);
    }
  }, [customWords.length, cardCount]);

  const handleAddCustomWords = useCallback(async () => {
    const parsedWords = parseCustomWordInput(customInput);
    if (parsedWords.length === 0) {
      setCustomFeedback(null);
      setCustomError('Enter at least one Portuguese word.');
      return;
    }
    const existingPt = new Set(
      customWords.map((word) => word.pt.trim().toLocaleLowerCase())
    );
    const seed = Date.now();
    const additions: Word[] = [];
    parsedWords.forEach((word, index) => {
      const key = word.pt.toLocaleLowerCase();
      if (existingPt.has(key)) return;
      existingPt.add(key);
      additions.push({
        id: `custom-${seed}-${index}`,
        pt: word.pt,
        en: word.en,
        isCustom: true,
      });
    });
    if (additions.length === 0) {
      setCustomFeedback(null);
      setCustomError('Those words are already in your custom cards.');
      return;
    }
    const nextCustomWords = [...customWords, ...additions];
    setCustomWords(nextCustomWords);
    await saveCustomWords(nextCustomWords);
    setCustomInput('');
    setCustomError(null);
    setCustomFeedback(
      `Added ${additions.length} custom card${additions.length === 1 ? '' : 's'}.`
    );
  }, [customInput, customWords]);

  const handleClearCustomCards = useCallback(async () => {
    await clearCustomWords();
    setCustomWords([]);
    setCustomInput('');
    setCustomError(null);
    setCustomFeedback('Cleared all custom cards.');
  }, []);

  const handlePlayAudio = useCallback((rate: number) => {
    if (!currentWord) return;
    userHasEnabledAudioRef.current = true;
    playWordAudio(currentWord, rate);
  }, [currentWord]);

  const handleSwipeLeft = useCallback(() => {
    if (state?.currentCardId) recordWordDontKnow(state.currentCardId);
    swipeLeft();
  }, [swipeLeft, state?.currentCardId]);

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
    lastClearedRef.current = false;
    startNewSession();
  }, [startNewSession]);

  const handleDone = useCallback(() => {
    setModalDismissed(true);
  }, []);

  const showModal = Boolean(state?.cleared && !modalDismissed);
  const [bestTimeMs, setBestTimeMs] = React.useState<number | null>(null);

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
          <View style={styles.customSection}>
            <View style={styles.customHeader}>
              <Text style={styles.customTitle}>Custom Portuguese cards</Text>
              <Pressable
                style={({ pressed }) => [
                  styles.customToggleButton,
                  pressed && styles.customToggleButtonPressed,
                ]}
                onPress={() => setShowCustomEditor((prev) => !prev)}
              >
                <Text style={styles.customToggleButtonLabel}>
                  {showCustomEditor ? 'Hide' : 'Add words'}
                </Text>
              </Pressable>
            </View>
            <Text style={styles.customBodyText}>
              Add one word or many words (comma/new line). Optional translation with
              {' '}
              <Text style={styles.customBodyStrong}>casa = house</Text>
            </Text>
            {showCustomEditor && (
              <View style={styles.customEditor}>
                <TextInput
                  style={styles.customInput}
                  value={customInput}
                  onChangeText={(value) => {
                    setCustomInput(value);
                    setCustomFeedback(null);
                    setCustomError(null);
                  }}
                  multiline
                  placeholder={'ex: saudade\nobrigado = thanks\ncidade, praia'}
                  placeholderTextColor={theme.textMuted}
                  textAlignVertical="top"
                  autoCapitalize="none"
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
                {customError != null && (
                  <Text style={styles.customErrorText}>{customError}</Text>
                )}
                {customFeedback != null && (
                  <Text style={styles.customFeedbackText}>{customFeedback}</Text>
                )}
              </View>
            )}
          </View>
          <Pressable
            style={({ pressed }) => [
              styles.startButton,
              !canStart && styles.startButtonDisabled,
              pressed && canStart && styles.startButtonPressed,
            ]}
            onPress={() =>
              startSession({ cardCount: displayCount, customWords })
            }
            disabled={!canStart}
          >
            <Text style={styles.startButtonLabel}>Start</Text>
          </Pressable>
        </ScrollView>
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
        frozen={state.cleared}
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
          disabled={state.cleared}
        />
      </View>
      <CompletionModal
        visible={showModal}
        bestTimeMs={bestTimeMs}
        onRunAgain={handleRunAgain}
        onDone={handleDone}
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
    paddingVertical: 24,
    paddingBottom: 40,
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
  customSection: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(10,14,32,0.55)',
    padding: 14,
    marginBottom: 20,
  },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 10,
  },
  customTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customToggleButton: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(106,92,255,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(106,92,255,0.7)',
  },
  customToggleButtonPressed: {
    opacity: 0.9,
  },
  customToggleButtonLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customBodyText: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.textMuted,
  },
  customBodyStrong: {
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customEditor: {
    marginTop: 12,
    gap: 10,
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
  },
  customFeedbackText: {
    fontSize: 13,
    color: '#7CFFB5',
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
});
