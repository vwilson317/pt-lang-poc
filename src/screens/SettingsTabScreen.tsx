import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getPracticeLanguageLabel } from '../types/practiceLanguage';
import { getPracticeLanguage, setPracticeLanguage } from '../lib/storage';
import { theme } from '../theme';

export function SettingsTabScreen() {
  const [practiceLanguage, setPracticeLanguageState] = useState<PracticeLanguage>('pt');
  const appVersion = Constants.expoConfig?.version ?? 'dev';
  const iosBuildNumber = Constants.expoConfig?.ios?.buildNumber;
  const androidVersionCode = Constants.expoConfig?.android?.versionCode;
  const buildLabel =
    iosBuildNumber != null
      ? `${iosBuildNumber}`
      : androidVersionCode != null
      ? `${androidVersionCode}`
      : 'dev';

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
      <Text style={styles.versionText}>Version {appVersion} ({buildLabel})</Text>
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
    backgroundColor: theme.surfaceStrong,
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
    backgroundColor: theme.surface,
  },
  smallToggleActive: {
    borderColor: theme.selectedBorder,
    backgroundColor: theme.selectedBg,
  },
  smallToggleLabel: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  versionText: {
    marginTop: 'auto',
    color: theme.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
});
