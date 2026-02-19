import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
  Text,
} from 'react-native';
import { Profile } from '../types/profile';
import { ProfileCard } from './ProfileCard';
import { theme } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25;
const SWIPE_OUT_DURATION = 200;

interface SwipeStackProps {
  profiles: Profile[];
  onSwipeLeft?: (profile: Profile) => void;
  onSwipeRight?: (profile: Profile) => void;
}

export function SwipeStack({
  profiles,
  onSwipeLeft,
  onSwipeRight,
}: SwipeStackProps) {
  const [index, setIndex] = useState(0);
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  const currentProfile = profiles[index];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10,
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        translateY.setValue(gestureState.dy * 0.3);
        rotate.setValue(gestureState.dx * 0.02);
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dx, vx } = gestureState;
        const shouldSwipeLeft = dx < -SWIPE_THRESHOLD || vx < -0.5;
        const shouldSwipeRight = dx > SWIPE_THRESHOLD || vx > 0.5;

        if (shouldSwipeLeft || shouldSwipeRight) {
          const toValue = shouldSwipeLeft ? -SCREEN_WIDTH * 1.2 : SCREEN_WIDTH * 1.2;
          Animated.parallel([
            Animated.timing(translateX, {
              toValue,
              duration: SWIPE_OUT_DURATION,
              useNativeDriver: true,
            }),
            Animated.timing(rotate, {
              toValue: shouldSwipeLeft ? -0.4 : 0.4,
              duration: SWIPE_OUT_DURATION,
              useNativeDriver: true,
            }),
          ]).start(() => {
            if (currentProfile) {
              if (shouldSwipeLeft) onSwipeLeft?.(currentProfile);
              else onSwipeRight?.(currentProfile);
            }
            translateX.setValue(0);
            translateY.setValue(0);
            rotate.setValue(0);
            setIndex((i) => Math.min(i + 1, profiles.length));
          });
        } else {
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
          Animated.spring(rotate, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 80,
          }).start();
        }
      },
    })
  ).current;

  const topCardStyle = {
    transform: [
      { translateX },
      { translateY },
      {
        rotate: rotate.interpolate({
          inputRange: [-1, 1],
          outputRange: ['-15deg', '15deg'],
        }),
      },
    ],
  };

  const nextCardScale = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [0.92, 0.92, 0.92],
  });

  const nextCardOpacity = translateX.interpolate({
    inputRange: [-SCREEN_WIDTH / 2, 0, SCREEN_WIDTH / 2],
    outputRange: [1, 1, 1],
  });

  if (!currentProfile) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No more profiles</Text>
        <Text style={styles.emptySub}>Carnival keeps going — check back later!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Back cards (next in stack) */}
      {index + 1 < profiles.length && (
        <Animated.View
          style={[
            styles.cardContainer,
            styles.backCard,
            {
              transform: [{ scale: nextCardScale }],
              opacity: nextCardOpacity,
            },
          ]}
          pointerEvents="none"
        >
          <ProfileCard profile={profiles[index + 1]} />
        </Animated.View>
      )}
      {index + 2 < profiles.length && (
        <View style={[styles.cardContainer, styles.backCard2]} pointerEvents="none">
          <ProfileCard profile={profiles[index + 2]} />
        </View>
      )}

      {/* Top draggable card */}
      <Animated.View
        style={[styles.cardContainer, styles.topCard, topCardStyle]}
        {...panResponder.panHandlers}
      >
        <ProfileCard profile={currentProfile} />
      </Animated.View>

      {/* Hint labels */}
      <View style={styles.hintRow} pointerEvents="none">
        <View style={[styles.hint, styles.nope]}>
          <Text style={styles.hintText}>NOPE</Text>
        </View>
        <View style={[styles.hint, styles.like]}>
          <Text style={styles.hintText}>LIKE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  cardContainer: {
    position: 'absolute',
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topCard: {
    zIndex: 3,
  },
  backCard: {
    zIndex: 2,
    top: 24,
    transform: [{ scale: 0.92 }],
  },
  backCard2: {
    zIndex: 1,
    top: 48,
    opacity: 0.9,
    transform: [{ scale: 0.84 }],
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.gold,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  hintRow: {
    position: 'absolute',
    bottom: -56,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    zIndex: 0,
  },
  hint: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 3,
  },
  nope: {
    borderColor: theme.pink,
  },
  like: {
    borderColor: theme.green,
  },
  hintText: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.textPrimary,
  },
});
