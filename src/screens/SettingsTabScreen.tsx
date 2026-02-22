import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getPracticeLanguageLabel } from '../types/practiceLanguage';
import { getPracticeLanguage, setPracticeLanguage } from '../lib/storage';
import { theme } from '../theme';

export function SettingsTabScreen() {
  const [practiceLanguage, setPracticeLanguageState] = useState<PracticeLanguage>('pt');

  const loadLanguage = useCallback(async () => {
    const language = await getPracticeLanguage();
    setPracticeLanguageState(language);
  }, []);

  useEffect(() => {
    void loadLanguage();
  }, [loadLanguage]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsLabel}>Practice language</Text>
        <View style={styles.toggleRow}>
          {(['pt', 'fr'] as const).map((language) => {
            const active = practiceLanguage === language;
            return (
              <Pressable
                key={language}
                style={[styles.smallToggle, active && styles.smallToggleActive]}
                onPress={() => {
                  if (active) return;
                  void setPracticeLanguage(language).then(() => {
                    setPracticeLanguageState(language);
                  });
                }}
              >
                <Text style={styles.smallToggleLabel}>{getPracticeLanguageLabel(language)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg0,
    padding: 16,
    gap: 12,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  settingsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    gap: 8,
  },
  settingsLabel: {
    color: theme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  smallToggle: {
    minHeight: 38,
    borderRadius: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  smallToggleActive: {
    borderColor: '#9AA7FF',
    backgroundColor: 'rgba(122,93,255,0.22)',
  },
  smallToggleLabel: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
});
