import React, { useEffect, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { theme } from '../theme';

type HeaderHUDProps = {
  rightCount: number;
  incorrectCount: number;
  skippedCount: number;
  guessedCount: number;
  remaining: number;
  startedAt: number | null;
  frozen?: boolean;
  actions?: ReactNode;
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
  guessedCount,
  remaining,
  startedAt,
  frozen = false,
  actions,
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
        <View style={styles.statsRow}>
          <View style={styles.statPill}>
            <FontAwesome5 name="check-circle" size={theme.iconSizeHud} color={theme.good} solid />
            <Text style={styles.count}>{rightCount}</Text>
          </View>
          <View style={styles.statPill}>
            <FontAwesome5 name="times-circle" size={theme.iconSizeHud} color={theme.bad} solid />
            <Text style={styles.count}>{incorrectCount}</Text>
          </View>
          <View style={styles.statPill}>
            <FontAwesome5 name="forward" size={theme.iconSizeHud} color={theme.info} solid />
            <Text style={styles.count}>{skippedCount}</Text>
          </View>
          <View style={styles.statPill}>
            <FontAwesome5 name="arrow-up" size={theme.iconSizeHud} color="#F5B94C" solid />
            <Text style={styles.count}>{guessedCount}</Text>
          </View>
          <View style={styles.statPill}>
            <FontAwesome5 name="layer-group" size={theme.iconSizeHud} color={theme.brand} solid />
            <Text style={styles.count}>{remaining}</Text>
          </View>
        </View>
        {(startedAt != null || actions != null) && (
          <View style={styles.footerRow}>
            <View style={styles.timeRow}>
              {startedAt != null && (
                <>
                  <FontAwesome5 name="clock" size={theme.iconSizeHud - 2} color={theme.info} solid />
                  <Text style={styles.timeText} numberOfLines={1}>
                    {formatElapsed(elapsedMs)}
                  </Text>
                </>
              )}
            </View>
            {actions != null ? <View style={styles.actionsSlot}>{actions}</View> : null}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  container: {
    minHeight: theme.hudHeight,
    borderRadius: theme.hudRadius,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.stroke,
    paddingHorizontal: 10,
    paddingVertical: 8,
    ...(Platform.OS === 'ios' && {
      overflow: 'hidden',
    }),
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: theme.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  footerRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  timeRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  actionsSlot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  count: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  timeText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textPrimary,
  },
});
