import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Profile } from '../types/profile';
import { getFlagEmoji } from '../utils/flags';
import { getCountdownText } from '../utils/countdown';
import { theme } from '../theme';

interface ProfileCardProps {
  profile: Profile;
  style?: object;
}

export function ProfileCard({ profile, style }: ProfileCardProps) {
  const [countdown, setCountdown] = useState(() =>
    getCountdownText(profile.leavingAt)
  );
  const flag = getFlagEmoji(profile.countryCode);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getCountdownText(profile.leavingAt));
    }, 60_000);
    return () => clearInterval(interval);
  }, [profile.leavingAt]);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.imageWrap}>
        <Image
          source={{ uri: profile.imageUri }}
          style={styles.image}
          contentFit="cover"
        />
      </View>
      <View style={styles.info}>
        <View style={styles.row}>
          <Text style={styles.name}>
            {profile.name}, {profile.age}
          </Text>
          <Text style={styles.flag}>{flag}</Text>
        </View>
        <View style={styles.locationRow}>
          <Text style={styles.location}>📍 {profile.currentLocation}</Text>
        </View>
        <View style={styles.countdownWrap}>
          <Text style={styles.countdown}>{countdown}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    aspectRatio: 3 / 4,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: theme.cardBg,
    ...theme.shadow,
  },
  imageWrap: {
    flex: 1,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  info: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 48,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  flag: {
    fontSize: 28,
  },
  locationRow: {
    marginTop: 4,
  },
  location: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  countdownWrap: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: theme.gold,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  countdown: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.bgDark,
  },
});
