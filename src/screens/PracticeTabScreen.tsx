import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { FlashSessionScreen } from './FlashSessionScreen';
import { SentencePracticeScreen } from './SentencePracticeScreen';
import { WordCardPracticeScreen } from './WordCardPracticeScreen';
import { ensureV11Initialized, getSelectedDeck } from '../lib/v11Storage';
import { BUILT_IN_PHRASES } from '../data/phrases';
import { theme } from '../theme';
import type { Word } from '../types/word';

type Mode = 'words' | 'sentences' | 'phrases';

export function PracticeTabScreen() {
  const params = useLocalSearchParams<{ mode?: string; clipId?: string; restartSession?: string }>();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('words');
  const [deckName, setDeckName] = useState('...');

  const loadSelectedDeckName = React.useCallback(() => {
    void ensureV11Initialized().then(async () => {
      const selectedDeck = await getSelectedDeck();
      setDeckName(selectedDeck.name);
    });
  }, []);

  useEffect(() => {
    loadSelectedDeckName();
  }, [loadSelectedDeckName]);

  useFocusEffect(
    React.useCallback(() => {
      loadSelectedDeckName();
    }, [loadSelectedDeckName])
  );

  useEffect(() => {
    if (params.mode === 'sentences' || params.mode === 'phrases' || params.mode === 'words') {
      setMode(params.mode);
    }
  }, [params.mode]);

  useEffect(() => {
    if (params.restartSession) {
      setMode('words');
    }
  }, [params.restartSession]);

  const sourceClipId = useMemo(
    () => {
      if (typeof params.clipId !== 'string') return undefined;
      const normalized = params.clipId.trim();
      return normalized.length > 0 ? normalized : undefined;
    },
    [params.clipId]
  );
  const phraseWords = useMemo<Word[]>(
    () =>
      BUILT_IN_PHRASES.map((phrase) => ({
        id: `phrase-${phrase.id}`,
        term: phrase.pt,
        en: phrase.en,
        language: 'pt',
      })),
    []
  );

  if (mode === 'words') {
    if (sourceClipId) {
      return (
        <View style={styles.fill}>
          <View style={styles.modeBar}>
            <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
              <Text style={styles.modeLabel}>Words</Text>
            </Pressable>
            <Pressable style={styles.modeBtn} onPress={() => setMode('sentences')}>
              <Text style={styles.modeLabelMuted}>Sentences</Text>
            </Pressable>
            <Pressable style={styles.modeBtn} onPress={() => setMode('phrases')}>
              <Text style={styles.modeLabelMuted}>Phrases</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/imports')} style={styles.modeBtn}>
              <Text style={styles.modeLabelMuted}>Imports</Text>
            </Pressable>
          </View>
          <WordCardPracticeScreen
            sourceClipId={sourceClipId}
            onBack={() => {
              router.replace({
                pathname: '/(tabs)/practice',
                params: { mode: 'words', clipId: '' },
              });
            }}
          />
        </View>
      );
    }

    return (
      <View style={styles.fill}>
        <View style={styles.modeBar}>
          <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
            <Text style={styles.modeLabel}>Words</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={() => setMode('sentences')}>
            <Text style={styles.modeLabelMuted}>Sentences</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={() => setMode('phrases')}>
            <Text style={styles.modeLabelMuted}>Phrases</Text>
          </Pressable>
          <Text style={styles.deckLabel}>Adding to: {deckName}</Text>
        </View>
        <FlashSessionScreen restartSessionKey={typeof params.restartSession === 'string' ? params.restartSession : undefined} />
      </View>
    );
  }

  if (mode === 'phrases') {
    return (
      <View style={styles.fill}>
        <View style={styles.modeBar}>
          <Pressable style={styles.modeBtn} onPress={() => setMode('words')}>
            <Text style={styles.modeLabelMuted}>Words</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={() => setMode('sentences')}>
            <Text style={styles.modeLabelMuted}>Sentences</Text>
          </Pressable>
          <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
            <Text style={styles.modeLabel}>Phrases</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/(tabs)/imports')} style={styles.modeBtn}>
            <Text style={styles.modeLabelMuted}>Imports</Text>
          </Pressable>
        </View>
        <FlashSessionScreen presetWords={phraseWords} />
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
        <Pressable style={styles.modeBtn} onPress={() => setMode('phrases')}>
          <Text style={styles.modeLabelMuted}>Phrases</Text>
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
          router.replace({
            pathname: '/(tabs)/practice',
            params: { mode: 'words', clipId: '' },
          });
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
    backgroundColor: theme.surfaceStrong,
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
    borderColor: theme.strokeSoft,
    backgroundColor: theme.surface,
  },
  modeBtnActive: {
    backgroundColor: theme.selectedBg,
    borderColor: theme.selectedBorder,
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
    color: theme.textMuted,
    fontSize: 11,
  },
});
