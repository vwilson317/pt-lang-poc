import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { Word } from '../types/word';
import type { UIState } from '../types/session';
import { theme, cardSurfaceColors, audioButtonColors } from '../theme';

const SWIPE_THRESHOLD = 120;
const springConfig = { damping: 18, stiffness: 120 };
/** Time to show the "Don't know" reveal (word + translation) before advancing. */
const REVEAL_DONT_KNOW_MS = 1800;
const customCardSurfaceColors = [
  'rgba(255,255,255,0.24)',
  'rgba(156, 84, 213, 0.12)',
] as const;
const LONG_WORD_WRAP_CHUNK = 12;

function addSoftBreaksToLongWord(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (/[\s-]/.test(trimmed) || trimmed.length <= LONG_WORD_WRAP_CHUNK) return trimmed;
  const chunks: string[] = [];
  for (let index = 0; index < trimmed.length; index += LONG_WORD_WRAP_CHUNK) {
    chunks.push(trimmed.slice(index, index + LONG_WORD_WRAP_CHUNK));
  }
  return chunks.join('\u200B');
}

function getResponsiveWordSize(value: string, viewportWidth: number): number {
  const normalizedLength = value.replace(/\s+/g, '').length;
  let size = theme.wordSize;
  if (normalizedLength >= 14) size = 42;
  if (normalizedLength >= 20) size = 36;
  if (normalizedLength >= 28) size = 30;
  if (viewportWidth < 390) size -= 3;
  if (viewportWidth < 340) size -= 3;
  return Math.max(24, size);
}

function wordMetadataLine(word: Word): string | null {
  const parts: string[] = [];
  const normalizedEn = word.en?.trim().toLocaleLowerCase();
  const inferredVerb =
    !word.wordType &&
    typeof normalizedEn === 'string' &&
    (normalizedEn.startsWith('to ') ||
      normalizedEn.includes('/to ') ||
      normalizedEn.startsWith("let's "));
  const resolvedWordType = word.wordType ?? (inferredVerb ? 'verb' : undefined);
  const resolvedVerbLabel = word.verbLabel ?? (inferredVerb ? 'infinitive' : undefined);
  if (resolvedWordType) parts.push(resolvedWordType.toUpperCase());
  if (word.gender) parts.push(word.gender.toUpperCase());
  if (resolvedVerbLabel) parts.push(resolvedVerbLabel);
  return parts.length > 0 ? parts.join(' · ') : null;
}

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
  onTapToSkip?: () => void;
  playbackRate?: number;
  onCycleSpeed?: () => void;
  typedAnswer?: string;
  onChangeTypedAnswer?: (value: string) => void;
  onSubmitTypedAnswer?: () => void;
  disabled?: boolean;
  onOpenInfo?: () => void;
  onOpenAdd?: () => void;
};

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
  onTapToSkip,
  playbackRate = 0.5,
  onCycleSpeed,
  typedAnswer,
  onChangeTypedAnswer,
  onSubmitTypedAnswer,
  disabled = false,
  onOpenInfo,
  onOpenAdd,
}: FlashCardProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const cardWidth = Math.max(220, Math.min(360, viewportWidth - 52));

  const handlePlayAtRate = useCallback(() => {
    onPlayAudio?.(playbackRate);
  }, [onPlayAudio, playbackRate]);

  useEffect(() => {
    if (uiState === 'REVEAL_DONT_KNOW') {
      const t = setTimeout(onAdvance, REVEAL_DONT_KNOW_MS);
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
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      const goLeft = translateX.value < -SWIPE_THRESHOLD || e.velocityX < -300;
      const goRight = translateX.value > SWIPE_THRESHOLD || e.velocityX > 300;
      if (goLeft) {
        translateX.value = withTiming(-cardWidth * 1.2, { duration: 200 }, () => {
          runOnJS(onSwipeLeft)();
          translateX.value = 0;
          translateY.value = 0;
        });
      } else if (goRight) {
        translateX.value = withTiming(cardWidth * 1.2, { duration: 200 }, () => {
          runOnJS(onSwipeRight)();
          translateX.value = 0;
          translateY.value = 0;
        });
      } else {
        translateX.value = withSpring(0, springConfig);
        translateY.value = withSpring(0, springConfig);
      }
    });

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  if (!word) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>No card</Text>
      </View>
    );
  }

  const showChoices =
    (uiState === 'CHOICES' || uiState === 'FEEDBACK_CORRECT' || uiState === 'FEEDBACK_WRONG') &&
    choiceOptions.length > 0;
  const isFeedback = uiState === 'FEEDBACK_CORRECT' || uiState === 'FEEDBACK_WRONG';
  const isCustomWord = Boolean(word.isCustom);
  const metadataLine = wordMetadataLine(word);
  const displayTerm = addSoftBreaksToLongWord(word.term);
  const responsiveWordSize = getResponsiveWordSize(word.term, viewportWidth);
  const responsiveWordLineHeight = Math.round(responsiveWordSize * 1.15);
  const cardPadding = viewportWidth < 360 ? 18 : 24;

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.card,
          { width: cardWidth },
          isCustomWord && styles.customCard,
          animatedCardStyle,
        ]}
      >
        <LinearGradient
          colors={[...(isCustomWord ? customCardSurfaceColors : cardSurfaceColors)]}
          style={[styles.cardGradient, { padding: cardPadding }]}
        >
          <Pressable
            style={styles.innerPressable}
            onPress={onTapToSkip}
            disabled={disabled}
          >
            <View style={styles.inner}>
              {isCustomWord && (
                <View style={styles.customBadge}>
                  <Text style={styles.customBadgeText}>Custom</Text>
                </View>
              )}
              {playbackRate != null && onCycleSpeed && uiState === 'PROMPT' && (
                <Pressable
                  style={styles.speedBadge}
                  onPress={(e) => {
                    e.stopPropagation();
                    onCycleSpeed();
                  }}
                  disabled={disabled}
                >
                  <Text style={styles.speedBadgeText}>{playbackRate}x</Text>
                </Pressable>
              )}
              <Text
                style={[
                  styles.pt,
                  {
                    fontSize: responsiveWordSize,
                    lineHeight: responsiveWordLineHeight,
                  },
                ]}
              >
                {displayTerm}
              </Text>
              {metadataLine != null && (
                <Text style={styles.wordMetadata}>{metadataLine}</Text>
              )}
              {word.pronHintEn != null && (
                <Text style={styles.pronHint}>{word.pronHintEn}</Text>
              )}
              {uiState === 'PROMPT' && onChangeTypedAnswer && (
                <TextInput
                  value={typedAnswer ?? ''}
                  onChangeText={onChangeTypedAnswer}
                  placeholder="Type English if you know it... or guess?"
                  placeholderTextColor="#FFFFFF"
                  autoCorrect={false}
                  autoCapitalize="none"
                  returnKeyType="done"
                  onSubmitEditing={onSubmitTypedAnswer}
                  editable={!disabled}
                  style={styles.answerInput}
                />
              )}

              {uiState === 'PROMPT' && (
                <Pressable
                  style={({ pressed }) => [styles.audioButton, pressed && styles.audioButtonPressed]}
                  onPress={(e) => {
                    e?.stopPropagation?.();
                    handlePlayAtRate();
                  }}
                  disabled={disabled}
                >
                  <LinearGradient
                    colors={[...audioButtonColors]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                  />
                  <View style={styles.audioButtonContent}>
                    <FontAwesome5 name="volume-up" size={theme.iconSizeButton} color={theme.textPrimary} solid />
                    <Text style={styles.audioLabel}>Play again</Text>
                  </View>
                </Pressable>
              )}
              {(onOpenInfo || onOpenAdd) && uiState === 'PROMPT' && (
                <View style={styles.cardUtilityButtonsRow}>
                  {onOpenInfo && (
                    <Pressable style={styles.cardUtilityButton} onPress={onOpenInfo} disabled={disabled}>
                      <FontAwesome5 name="info-circle" size={13} color={theme.textPrimary} solid />
                    </Pressable>
                  )}
                  {onOpenAdd && (
                    <Pressable style={[styles.cardUtilityButton, styles.cardUtilityButtonAdd]} onPress={onOpenAdd} disabled={disabled}>
                      <FontAwesome5 name="plus" size={13} color={theme.textPrimary} solid />
                    </Pressable>
                  )}
                </View>
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
              {uiState === 'FEEDBACK_CORRECT' && !showChoices && (
                <View style={styles.reveal}>
                  <Text style={styles.correctText}>Great!</Text>
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
          </Pressable>
        </LinearGradient>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    maxWidth: 360,
    minHeight: theme.cardMinHeight,
    alignSelf: 'center',
    borderRadius: theme.cardRadius,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
    ...theme.cardShadow,
  },
  customCard: {
    borderColor: theme.selectedBorder,
    borderWidth: 2,
  },
  cardGradient: {
    flex: 1,
    padding: 24,
    borderRadius: theme.cardRadius,
  },
  innerPressable: {
    flex: 1,
  },
  inner: {
    width: '100%',
    alignItems: 'center',
  },
  speedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: theme.selectedBg,
    borderWidth: 1,
    borderColor: theme.selectedBorder,
  },
  speedBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  customBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    backgroundColor: theme.accentBg,
    borderWidth: 1,
    borderColor: theme.accent400,
  },
  customBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: theme.support700,
    textTransform: 'uppercase',
  },
  placeholder: {
    padding: 48,
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 18,
    color: theme.textMuted,
  },
  pt: {
    fontWeight: theme.wordWeight,
    letterSpacing: theme.wordLetterSpacing,
    color: theme.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
    width: '100%',
    maxWidth: '100%',
    flexShrink: 1,
  },
  wordMetadata: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  answerInput: {
    width: '100%',
    minHeight: 48,
    borderRadius: 0,
    borderWidth: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(70, 41, 100, 0.36)',
    backgroundColor: 'transparent',
    color: '#FFFFFF',
    fontSize: 15,
    paddingHorizontal: 2,
    paddingBottom: 8,
    marginTop: 6,
  },
  audioButton: {
    minHeight: theme.ctaMinHeight,
    borderRadius: theme.ctaRadius,
    overflow: 'hidden',
    marginTop: 8,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
  },
  audioButtonPressed: {
    opacity: 0.98,
    transform: [{ scale: 0.98 }],
  },
  audioButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  audioLabel: {
    fontSize: theme.buttonLabelSize,
    fontWeight: theme.buttonLabelWeight,
    color: theme.textPrimary,
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
    color: '#FFFFFF',
    fontStyle: 'italic',
    marginBottom: 12,
  },
  autoAdvance: {
    fontSize: theme.hudLabelSize,
    color: '#FFFFFF',
  },
  correctText: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.good,
  },
  choices: {
    width: '100%',
    marginTop: 16,
    gap: 12,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.optionRadius,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  optionCorrect: {
    borderColor: theme.good,
    borderWidth: 2,
  },
  optionWrong: {
    borderColor: theme.bad,
    borderWidth: 2,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  cardUtilityButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  cardUtilityButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cardUtilityButtonAdd: {
    backgroundColor: 'rgba(156, 84, 213, 0.26)',
    borderColor: 'rgba(201, 167, 255, 0.54)',
  },
});
