import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import { theme } from '../theme';

const AUTO_DISMISS_MS = 3000;

type GestureDemoOverlayProps = {
  visible: boolean;
  onDismiss: () => void;
};

export function GestureDemoOverlay({ visible, onDismiss }: GestureDemoOverlayProps) {
  const arrowX = useSharedValue(0);
  const hintOpacity = useSharedValue(0.45);
  const pulseScale = useSharedValue(1);

  const dismiss = useCallback(() => {
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible, dismiss]);

  useEffect(() => {
    if (!visible) return;
    arrowX.value = withRepeat(
      withTiming(12, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    hintOpacity.value = withRepeat(
      withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    pulseScale.value = withRepeat(
      withTiming(1.04, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [visible, arrowX, hintOpacity, pulseScale]);

  const leftArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -arrowX.value }],
    opacity: hintOpacity.value,
  }));
  const rightArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: arrowX.value }],
    opacity: hintOpacity.value,
  }));
  const ctaStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: hintOpacity.value,
  }));

  if (!visible) return null;

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={dismiss}
      accessibilityLabel="Dismiss gesture demo"
    >
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>Quick controls</Text>
          <Text style={styles.subtitle}>Learn these once, then practice flows naturally.</Text>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Swipe actions</Text>
            <View style={styles.row}>
              <Animated.View style={[styles.directionBadge, rightArrowStyle]}>
                <Text style={styles.directionArrow}>→</Text>
              </Animated.View>
              <Text style={styles.rowLabel}>Know this word</Text>
            </View>
            <View style={styles.row}>
              <Animated.View style={[styles.directionBadge, leftArrowStyle]}>
                <Text style={styles.directionArrow}>←</Text>
              </Animated.View>
              <Text style={styles.rowLabel}>Skip for now</Text>
            </View>
            <View style={styles.row}>
              <View style={[styles.directionBadge, styles.directionBadgeStatic]}>
                <Text style={styles.directionArrow}>↑</Text>
              </View>
              <Text style={styles.rowLabel}>Guess anywhere on screen</Text>
            </View>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Tap actions</Text>
            <Text style={styles.metaLabel}>Tap while reviewing to continue</Text>
            <Text style={styles.metaLabel}>Tap during prompt to stop audio</Text>
            <Text style={styles.metaLabel}>Tap speed badge to change playback speed</Text>
          </View>

          <View style={styles.group}>
            <Text style={styles.groupLabel}>Session tip</Text>
            <Text style={styles.metaLabel}>At the end, missed and unknown words are copied to clipboard.</Text>
            <Text style={styles.metaLabel}>Know it? Type the English answer, then swipe right.</Text>
          </View>

          <Animated.View style={[styles.ctaWrap, ctaStyle]}>
            <Text style={styles.cta}>Tap anywhere to start</Text>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.overlayStrong,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingVertical: 26,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    backgroundColor: theme.panelBg,
    borderWidth: 1,
    borderColor: theme.selectedBorder,
    paddingHorizontal: 18,
    paddingVertical: 20,
    gap: 14,
    shadowColor: '#04020A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 27,
    lineHeight: 31,
    fontWeight: '800',
    color: theme.textPrimary,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  group: {
    gap: 8,
    paddingTop: 2,
  },
  groupLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: theme.accent400,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  directionBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.selectedBorder,
    backgroundColor: 'rgba(156, 84, 213, 0.22)',
  },
  directionBadgeStatic: {
    opacity: 0.92,
  },
  directionArrow: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: theme.textOnDark,
  },
  metaLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  ctaWrap: {
    marginTop: 6,
    alignItems: 'center',
  },
  cta: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: theme.info,
  },
});
