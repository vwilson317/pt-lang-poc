import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

type HeaderHUDProps = {
  rightCount: number;
  wrongCount: number;
  remaining: number;
  startedAt: number | null;
  frozen?: boolean;
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HeaderHUD({
  rightCount,
  wrongCount,
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
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.badge}>
          <Text style={styles.emoji}>✅</Text>
          <Text style={styles.count}>{rightCount}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.emoji}>❌</Text>
          <Text style={styles.count}>{wrongCount}</Text>
        </View>
        <View style={styles.badge}>
          <Text style={styles.emoji}>🃏</Text>
          <Text style={styles.count}>{remaining}</Text>
        </View>
      </View>
      {startedAt != null && (
        <View style={styles.timer}>
          <Text style={styles.timerText}>⏱ {formatMs(elapsedMs)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    paddingTop: 48,
    backgroundColor: theme.bgDark,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,196,48,0.2)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 18,
  },
  count: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  timer: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(244,196,48,0.15)',
  },
  timerText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.gold,
  },
});
