import React, { useEffect, useRef, useCallback } from 'react';
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
  const opacity = useSharedValue(0.3);

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
    opacity.value = withRepeat(
      withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [visible, arrowX, opacity]);

  const leftArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -arrowX.value }],
    opacity: opacity.value,
  }));
  const rightArrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: arrowX.value }],
    opacity: opacity.value,
  }));

  if (!visible) return null;

  return (
    <Pressable
      style={StyleSheet.absoluteFill}
      onPress={dismiss}
      accessibilityLabel="Dismiss gesture demo"
    >
      <View style={styles.scrim}>
        <View style={styles.content}>
          <View style={styles.row}>
            <Animated.View style={[styles.arrowHint, rightArrowStyle]}>
              <Text style={styles.arrow}>→</Text>
            </Animated.View>
            <Text style={styles.label}>Swipe → Know</Text>
          </View>
          <View style={styles.row}>
            <Animated.View style={[styles.arrowHint, leftArrowStyle]}>
              <Text style={styles.arrow}>←</Text>
            </Animated.View>
            <Text style={styles.label}>Swipe ← Skip</Text>
          </View>
          <Text style={styles.label}>Swipe ↑ anywhere = Guess</Text>
          <Text style={styles.label}>Tap = Stop Audio</Text>
          <Text style={styles.label}>Tap speed badge to change speed</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrowHint: {
    width: 28,
    alignItems: 'center',
  },
  arrow: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 0.3,
  },
});
