import React, { type ReactNode } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import { theme } from '../theme';

type HeaderHUDProps = {
  rightCount: number;
  incorrectCount: number;
  skippedCount: number;
  guessedCount: number;
  remaining: number;
  deckCount: number;
  actions?: ReactNode;
};

export function HeaderHUD({
  rightCount,
  incorrectCount,
  skippedCount,
  guessedCount,
  remaining,
  deckCount,
  actions,
}: HeaderHUDProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        <View style={styles.topRow}>
          <View style={styles.statsRow}>
            <View style={styles.statPill}>
              <FontAwesome5 name="check-circle" size={theme.iconSizeHud - 1} color={theme.good} solid />
              <Text style={styles.count}>{rightCount}</Text>
            </View>
            <View style={styles.statPill}>
              <FontAwesome5 name="times-circle" size={theme.iconSizeHud - 1} color={theme.bad} solid />
              <Text style={styles.count}>{incorrectCount}</Text>
            </View>
            <View style={styles.statPill}>
              <FontAwesome5 name="forward" size={theme.iconSizeHud - 2} color={theme.info} solid />
              <Text style={styles.count}>{skippedCount}</Text>
            </View>
            <View style={styles.statPill}>
              <FontAwesome5 name="arrow-up" size={theme.iconSizeHud - 2} color={theme.warning} solid />
              <Text style={styles.count}>{guessedCount}</Text>
            </View>
          </View>
          <View style={styles.remainingPill}>
            <FontAwesome5 name="layer-group" size={theme.iconSizeHud - 2} color={theme.accent400} solid />
            <Text style={styles.remainingCount}>{remaining}/{deckCount}</Text>
            <Text style={styles.remainingLabel}>left</Text>
          </View>
        </View>
        {actions != null && (
          <View style={styles.footerRow}>
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
    marginBottom: 10,
  },
  container: {
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS === 'ios' && {
      overflow: 'hidden',
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
    flex: 1,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 9,
    borderRadius: 15,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.strokeSoft,
  },
  remainingPill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(156, 84, 213, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(201, 167, 255, 0.52)',
  },
  footerRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
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
  remainingCount: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textPrimary,
  },
  remainingLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
