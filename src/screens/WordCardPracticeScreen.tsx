import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { getSelectedDeckId, getWordCards } from '../lib/v11Storage';
import { theme } from '../theme';
import type { FlashCardRecord } from '../types/v11';

type Props = {
  sourceClipId?: string;
  onBack: () => void;
};

export function WordCardPracticeScreen({ sourceClipId, onBack }: Props) {
  const [cards, setCards] = useState<FlashCardRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    const deckId = await getSelectedDeckId();
    const wordCards = await getWordCards(deckId, sourceClipId);
    setCards(wordCards.sort((a, b) => b.createdAt - a.createdAt));
    setLoading(false);
  }, [sourceClipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = cards[index] ?? null;
  const isDone = !loading && cards.length > 0 && index >= cards.length;

  const handleCheck = useCallback(() => {
    if (!current) return;
    setChecked(true);
  }, [current]);

  const moveNext = useCallback((correct: boolean) => {
    setStats((prev) => ({
      right: prev.right + (correct ? 1 : 0),
      wrong: prev.wrong + (correct ? 0 : 1),
    }));
    setTyped('');
    setChecked(false);
    setIndex((prev) => prev + 1);
  }, []);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading word cards...</Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No word cards yet</Text>
        <Text style={styles.subtitle}>Import WhatsApp content to generate word cards.</Text>
        <Pressable style={styles.primaryButton} onPress={onBack}>
          <Text style={styles.primaryLabel}>Back to Practice</Text>
        </Pressable>
      </View>
    );
  }

  if (isDone) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Word session complete</Text>
        <Text style={styles.subtitle}>Right: {stats.right} · Wrong: {stats.wrong}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setIndex(0);
            setStats({ right: 0, wrong: 0 });
            setChecked(false);
            setTyped('');
          }}
        >
          <Text style={styles.primaryLabel}>Run Again</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryLabel}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (!current) return null;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.headerRow}>
        <Text style={styles.progressText}>
          {index + 1}/{cards.length}
        </Text>
        <Pressable onPress={onBack}>
          <Text style={styles.backLink}>Back</Text>
        </Pressable>
      </View>
      <Text style={styles.wordText}>{current.front}</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        style={styles.input}
        placeholder="Type the English translation..."
        placeholderTextColor={theme.textMuted}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={handleCheck}
      />
      {!checked ? (
        <Pressable style={styles.primaryButton} onPress={handleCheck}>
          <Text style={styles.primaryLabel}>Check</Text>
        </Pressable>
      ) : (
        <View style={styles.answerWrap}>
          <Text style={styles.answerLabel}>Model answer</Text>
          <Text style={styles.answerText}>{current.back}</Text>
          <View style={styles.markRow}>
            <Pressable style={[styles.secondaryButton, styles.markButton]} onPress={() => moveNext(false)}>
              <Text style={styles.secondaryLabel}>Wrong</Text>
            </Pressable>
            <Pressable style={[styles.primaryButton, styles.markButton]} onPress={() => moveNext(true)}>
              <Text style={styles.primaryLabel}>Right</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: theme.bg0,
    gap: 14,
  },
  centered: {
    flex: 1,
    backgroundColor: theme.bg0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressText: {
    color: theme.textMuted,
    fontSize: 13,
  },
  backLink: {
    color: '#9AA7FF',
    fontSize: 14,
    fontWeight: '600',
  },
  wordText: {
    color: theme.textPrimary,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
  },
  input: {
    width: '100%',
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: theme.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.brand,
  },
  primaryLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 16,
  },
  answerWrap: {
    gap: 10,
  },
  answerLabel: {
    color: theme.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  answerText: {
    color: theme.textPrimary,
    fontSize: 18,
    lineHeight: 24,
  },
  markRow: {
    flexDirection: 'row',
    gap: 10,
  },
  markButton: {
    flex: 1,
  },
});
