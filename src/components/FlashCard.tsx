import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { Word } from '../types/word';
import type { UIState } from '../types/session';
import { theme } from '../theme';
import { RATE_BASELINE, RATE_DECODE, RATE_CHALLENGE } from '../lib/audio';

const SWIPE_THRESHOLD = 120;
const springConfig = { damping: 18, stiffness: 120 };

type FlashCardProps = {
  word: Word | null;
  uiState: UIState;
  choiceOptions?: string[];
  correctChoiceIndex?: number;
  selectedChoiceIndex?: number;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onChooseOption: (index: number) => void;
  onAdvance: () => void;
  onPlayAudio?: (rate: number) => void;
  disabled?: boolean;
};

const DOUBLE_TAP_MS = 300;
const SPEED_INDICATOR_MS = 600;

export function FlashCard({
  word,
  uiState,
  choiceOptions = [],
  correctChoiceIndex = 0,
  selectedChoiceIndex,
  onSwipeLeft,
  onSwipeRight,
  onChooseOption,
  onAdvance,
  onPlayAudio,
  disabled = false,
}: FlashCardProps) {
  const translateX = useSharedValue(0);
  const cardWidth = 320;

  const [speedIndicator, setSpeedIndicator] = useState<number | null>(null);
  const speedIndicatorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef<number>(0);

  const clearSpeedIndicator = useCallback(() => {
    if (speedIndicatorTimer.current) {
      clearTimeout(speedIndicatorTimer.current);
      speedIndicatorTimer.current = null;
    }
    setSpeedIndicator(null);
  }, []);

  const showSpeedThenClear = useCallback((rate: number) => {
    if (rate === RATE_BASELINE) return;
    setSpeedIndicator(rate);
    if (speedIndicatorTimer.current) clearTimeout(speedIndicatorTimer.current);
    speedIndicatorTimer.current = setTimeout(clearSpeedIndicator, SPEED_INDICATOR_MS);
  }, [clearSpeedIndicator]);

  const handlePlayAtRate = useCallback(
    (rate: number) => {
      onPlayAudio?.(rate);
      showSpeedThenClear(rate);
    },
    [onPlayAudio, showSpeedThenClear]
  );

  const handlePress = useCallback(() => {
    const now = Date.now();
    const isDoubleTap = now - lastTapTime.current <= DOUBLE_TAP_MS;
    lastTapTime.current = now;
    if (isDoubleTap) {
      handlePlayAtRate(RATE_CHALLENGE);
    } else {
      handlePlayAtRate(RATE_BASELINE);
    }
  }, [handlePlayAtRate]);

  const handleLongPress = useCallback(() => {
    handlePlayAtRate(RATE_DECODE);
  }, [handlePlayAtRate]);

  useEffect(() => {
    return () => {
      if (speedIndicatorTimer.current) clearTimeout(speedIndicatorTimer.current);
    };
  }, []);

  useEffect(() => {
    if (uiState === 'REVEAL_DONT_KNOW') {
      const t = setTimeout(onAdvance, 900);
      return () => clearTimeout(t);
    }
    if (uiState === 'FEEDBACK_CORRECT') {
      const t = setTimeout(onAdvance, 450);
      return () => clearTimeout(t);
    }
    if (uiState === 'FEEDBACK_WRONG') {
      const t = setTimeout(onAdvance, 900);
      return () => clearTimeout(t);
    }
  }, [uiState, onAdvance]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled && uiState === 'PROMPT')
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      const goLeft = translateX.value < -SWIPE_THRESHOLD || e.velocityX < -300;
      const goRight = translateX.value > SWIPE_THRESHOLD || e.velocityX > 300;
      if (goLeft) {
        translateX.value = withTiming(-cardWidth * 1.2, { duration: 200 }, () => {
          runOnJS(onSwipeLeft)();
          translateX.value = 0;
        });
      } else if (goRight) {
        translateX.value = withTiming(cardWidth * 1.2, { duration: 200 }, () => {
          runOnJS(onSwipeRight)();
          translateX.value = 0;
        });
      } else {
        translateX.value = withSpring(0, springConfig);
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  if (!word) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No card</Text>
      </View>
    );
  }

  const showChoices = uiState === 'CHOICES' || uiState === 'FEEDBACK_CORRECT' || uiState === 'FEEDBACK_WRONG';
  const isFeedback = uiState === 'FEEDBACK_CORRECT' || uiState === 'FEEDBACK_WRONG';

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.card, animatedCardStyle]}>
        <View style={styles.inner}>
          <Text style={styles.pt}>{word.pt}</Text>

          {uiState === 'PROMPT' && (
            <Pressable
              style={styles.audioButton}
              onPress={handlePress}
              onLongPress={handleLongPress}
              disabled={disabled}
            >
              {speedIndicator != null ? (
                <Text style={styles.speedLabel}>{speedIndicator}x</Text>
              ) : (
                <>
                  <FontAwesome5 name="volume-up" size={22} color={theme.gold} solid />
                  <Text style={styles.audioLabel}>Tap to play</Text>
                </>
              )}
            </Pressable>
          )}

          {uiState === 'REVEAL_DONT_KNOW' && (
            <View style={styles.reveal}>
              {word.en != null && (
                <Text style={styles.en}>{word.en}</Text>
              )}
              {word.pronHintEn != null && (
                <Text style={styles.pronHint}>{word.pronHintEn}</Text>
              )}
              <Text style={styles.autoAdvance}>Next in a moment…</Text>
            </View>
          )}

          {showChoices && (
            <View style={styles.choices}>
              {choiceOptions.map((opt, i) => {
                const isCorrect = i === correctChoiceIndex;
                const isSelected = i === selectedChoiceIndex;
                const optionStyle = [
                  styles.option,
                  isFeedback && isCorrect && styles.optionCorrect,
                  isFeedback && isSelected && !isCorrect && styles.optionWrong,
                ];
                return (
                  <TouchableOpacity
                    key={i}
                    style={optionStyle}
                    onPress={() => !isFeedback && onChooseOption(i)}
                    disabled={disabled || isFeedback}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.optionText}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    backgroundColor: theme.cardBg,
    borderRadius: theme.borderRadius,
    padding: 24,
    ...theme.shadow,
  },
  inner: {
    alignItems: 'center',
  },
  placeholder: {
    padding: 48,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    color: theme.textSecondary,
  },
  pt: {
    fontSize: 28,
    fontWeight: '800',
    color: theme.gold,
    marginBottom: 16,
    textAlign: 'center',
  },
  audioButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(244,196,48,0.15)',
  },
  speedLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.gold,
  },
  audioLabel: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  reveal: {
    alignItems: 'center',
    marginTop: 8,
  },
  en: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  pronHint: {
    fontSize: 16,
    color: theme.goldLight,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  autoAdvance: {
    fontSize: 12,
    color: theme.textSecondary,
  },
  choices: {
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCorrect: {
    backgroundColor: 'rgba(0,151,57,0.25)',
    borderColor: theme.green,
  },
  optionWrong: {
    backgroundColor: 'rgba(233,30,140,0.2)',
    borderColor: theme.pink,
  },
  optionText: {
    fontSize: 16,
    color: theme.textPrimary,
    textAlign: 'center',
  },
});
