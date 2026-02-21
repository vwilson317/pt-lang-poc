import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FlashSessionScreen } from './FlashSessionScreen';
import { SentencePracticeScreen } from './SentencePracticeScreen';
import { ensureV11Initialized, getSelectedDeck } from '../lib/v11Storage';
import { theme } from '../theme';

type Mode = 'words' | 'sentences';

export function PracticeTabScreen() {
  const params = useLocalSearchParams<{ mode?: string; clipId?: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('words');
  const [deckName, setDeckName] = useState('...');

  useEffect(() => {
    void ensureV11Initialized().then(async () => {
      const selectedDeck = await getSelectedDeck();
      setDeckName(selectedDeck.name);
    });
  }, []);

  useEffect(() => {
    if (params.mode === 'sentences') {
      setMode('sentences');
    }
  }, [params.mode]);

  const sourceClipId = useMemo(
    () => (typeof params.clipId === 'string' ? params.clipId : undefined),
    [params.clipId]
  );

  if (mode === 'words') {
    return (
      <View style={styles.fill}>
        <View style={styles.modeBar}>
          <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
            <Text style={styles.modeLabel}>Words</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={() => setMode('sentences')}>
            <Text style={styles.modeLabelMuted}>Sentences</Text>
          </Pressable>
          <Text style={styles.deckLabel}>Adding to: {deckName}</Text>
        </View>
        <FlashSessionScreen />
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <View style={styles.modeBar}>
        <Pressable style={styles.modeBtn} onPress={() => setMode('words')}>
          <Text style={styles.modeLabelMuted}>Words</Text>
        </Pressable>
        <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
          <Text style={styles.modeLabel}>Sentences</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(tabs)/imports')}
          style={styles.modeBtn}
        >
          <Text style={styles.modeLabelMuted}>Imports</Text>
        </Pressable>
      </View>
      <SentencePracticeScreen
        sourceClipId={sourceClipId}
        onBack={() => {
          setMode('words');
          router.replace('/(tabs)/practice');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: theme.bg0,
  },
  modeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    backgroundColor: 'rgba(6,10,24,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: theme.stroke,
  },
  modeBtn: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(122,93,255,0.45)',
    borderColor: 'rgba(163,143,255,0.95)',
  },
  modeLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  modeLabelMuted: {
    color: theme.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  deckLabel: {
    marginLeft: 'auto',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
  },
});
