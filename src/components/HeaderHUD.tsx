import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { theme } from '../theme';

type HeaderHUDProps = {
  rightCount: number;
  incorrectCount: number;
  skippedCount: number;
  remaining: number;
  startedAt: number | null;
  frozen?: boolean;
};

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h >= 1) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HeaderHUD({
  rightCount,
  incorrectCount,
  skippedCount,
  remaining,
  startedAt,
  frozen = false,
}: HeaderHUDProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (startedAt == null || frozen) return;
    const tick = () => setElapsedMs(Date.now() - startedAt);
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt, frozen]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.leftCluster}>
          <View style={styles.pill}>
            <FontAwesome5 name="check-circle" size={theme.iconSizeHud} color={theme.good} solid />
            <Text style={styles.count}>{rightCount}</Text>
          </View>
          <View style={styles.pill}>
            <FontAwesome5 name="times-circle" size={theme.iconSizeHud} color={theme.bad} solid />
            <Text style={styles.count}>{incorrectCount}</Text>
          </View>
          <View style={styles.pill}>
            <FontAwesome5 name="forward" size={theme.iconSizeHud} color={theme.info} solid />
            <Text style={styles.count}>{skippedCount}</Text>
          </View>
        </View>
        <View style={styles.middleCluster}>
          <View style={styles.pill}>
            <FontAwesome5 name="layer-group" size={theme.iconSizeHud} color={theme.brand} solid />
            <Text style={styles.count}>{remaining}</Text>
          </View>
        </View>
        <View style={styles.rightCluster}>
          {startedAt != null && (
            <View style={styles.pill}>
              <FontAwesome5 name="clock" size={theme.iconSizeHud} color={theme.info} solid />
              <Text style={styles.count}>{formatElapsed(elapsedMs)}</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: theme.hudHeight,
    borderRadius: theme.hudRadius,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.stroke,
    paddingHorizontal: 12,
    ...(Platform.OS === 'ios' && {
      overflow: 'hidden',
    }),
  },
  leftCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  middleCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightCluster: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  count: {
    fontSize: theme.hudNumberSize,
    fontWeight: '700',
    color: theme.textPrimary,
  },
});
