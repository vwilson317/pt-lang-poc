import React, { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderHUD } from '../components/HeaderHUD';
import { FlashCard } from '../components/FlashCard';
import { CompletionModal } from '../components/CompletionModal';
import { useSession } from '../state/useSession';
import { getWordById } from '../data/words';
import { getBestClearMs, setBestClearMs, incrementRunsCount } from '../lib/storage';
import { playWordAudio } from '../lib/audio';
import { theme } from '../theme';

export function FlashSessionScreen() {
  const insets = useSafeAreaInsets();
  const {
    state,
    remaining,
    swipeLeft,
    swipeRight,
    chooseOption,
    advanceToNextCard,
    startNewSession,
    getClearTimeMs,
  } = useSession();

  const [modalDismissed, setModalDismissed] = React.useState(false);
  const lastClearedRef = useRef(false);

  const currentWord = state.currentCardId
    ? getWordById(state.currentCardId) ?? null
    : null;

  const handlePlayAudio = useCallback(() => {
    if (currentWord?.audioUrl) playWordAudio(currentWord.audioUrl);
  }, [currentWord?.audioUrl]);

  // Auto-play audio when revealing "don't know" (design)
  useEffect(() => {
    if (state.uiState === 'REVEAL_DONT_KNOW' && currentWord?.audioUrl) {
      playWordAudio(currentWord.audioUrl);
    }
  }, [state.uiState, currentWord?.audioUrl]);

  // When session clears: persist best time and runs count
  useEffect(() => {
    if (!state.cleared || lastClearedRef.current) return;
    lastClearedRef.current = true;
    const clearMs = getClearTimeMs();
    if (clearMs != null) {
      getBestClearMs().then((best) => {
        if (best == null || clearMs < best) setBestClearMs(clearMs);
      });
      incrementRunsCount();
    }
  }, [state.cleared, getClearTimeMs]);

  const handleRunAgain = useCallback(() => {
    setModalDismissed(false);
    lastClearedRef.current = false;
    startNewSession();
  }, [startNewSession]);

  const handleDone = useCallback(() => {
    setModalDismissed(true);
  }, []);

  const showModal = state.cleared && !modalDismissed;
  const [bestTimeMs, setBestTimeMs] = React.useState<number | null>(null);

  useEffect(() => {
    if (state.cleared) {
      getBestClearMs().then(setBestTimeMs);
    }
  }, [state.cleared]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
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
          onSwipeLeft={swipeLeft}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.bgDark,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
});
