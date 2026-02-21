import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { theme } from '../theme';
import { addCards, getClips, getSelectedDeckId, getSentenceCards } from '../lib/v11Storage';
import type { ClipRecord, FlashCardRecord } from '../types/v11';
import { makeId } from '../lib/id';

type Props = {
  sourceClipId?: string;
  onBack: () => void;
};

function tokenizeSentence(sentence: string): string[] {
  return sentence
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function SentencePracticeScreen({ sourceClipId, onBack }: Props) {
  const [cards, setCards] = useState<FlashCardRecord[]>([]);
  const [clipsById, setClipsById] = useState<Record<string, ClipRecord>>({});
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [checked, setChecked] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [stats, setStats] = useState({ right: 0, wrong: 0 });
  const [feedback, setFeedback] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const deckId = await getSelectedDeckId();
    const [sentenceCards, clips] = await Promise.all([
      getSentenceCards(deckId, sourceClipId),
      getClips(),
    ]);
    setCards(sentenceCards.sort((a, b) => b.createdAt - a.createdAt));
    setClipsById(
      clips.reduce<Record<string, ClipRecord>>((acc, clip) => {
        acc[clip.id] = clip;
        return acc;
      }, {})
    );
    setLoading(false);
  }, [sourceClipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = cards[index] ?? null;
  const isDone = !loading && cards.length > 0 && index >= cards.length;
  const tokens = useMemo(() => tokenizeSentence(current?.front ?? ''), [current?.front]);

  const tokenTranslation = useMemo(() => {
    if (!current?.sourceClipId || !current.sourceSegmentId || !selectedWord) return undefined;
    const clip = clipsById[current.sourceClipId];
    const segment = clip?.segments.find((item) => item.id === current.sourceSegmentId);
    return segment?.tokens?.find((token) => token.text.toLowerCase() === selectedWord.toLowerCase())?.translation;
  }, [clipsById, current?.sourceClipId, current?.sourceSegmentId, selectedWord]);

  const handleCheck = useCallback(() => {
    if (!current) return;
    setChecked(true);
  }, [current]);

  const moveNext = useCallback(
    (correct: boolean) => {
      setStats((prev) => ({
        right: prev.right + (correct ? 1 : 0),
        wrong: prev.wrong + (correct ? 0 : 1),
      }));
      setTyped('');
      setChecked(false);
      setSelectedWord(null);
      setFeedback(null);
      setIndex((prev) => prev + 1);
    },
    []
  );

  const handleExtractWord = useCallback(async () => {
    if (!selectedWord || !current) return;
    const deckId = await getSelectedDeckId();
    const nextCard: FlashCardRecord = {
      id: makeId('card'),
      deckId,
      cardType: 'word',
      front: selectedWord,
      back: tokenTranslation ?? selectedWord,
      sourceClipId: current.sourceClipId,
      sourceSegmentId: current.sourceSegmentId,
      createdAt: Date.now(),
    };
    await addCards([nextCard]);
    setFeedback(`Added "${selectedWord}" to deck.`);
  }, [current, selectedWord, tokenTranslation]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading sentence cards...</Text>
      </View>
    );
  }

  if (cards.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No sentence cards yet</Text>
        <Text style={styles.subtitle}>Import media to generate sentence cards.</Text>
        <Pressable style={styles.primaryButton} onPress={onBack}>
          <Text style={styles.primaryLabel}>Back to Practice</Text>
        </Pressable>
      </View>
    );
  }

  if (isDone) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Sentence session complete</Text>
        <Text style={styles.subtitle}>Right: {stats.right} · Wrong: {stats.wrong}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setIndex(0);
            setStats({ right: 0, wrong: 0 });
            setChecked(false);
            setTyped('');
            setSelectedWord(null);
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

  if (!current) {
    return null;
  }

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
      <Text style={styles.sentence}>{current.front}</Text>
      <View style={styles.tokenRow}>
        {tokens.map((token, tokenIndex) => {
          const selected = selectedWord?.toLowerCase() === token.toLowerCase();
          return (
            <Pressable
              key={`${token}-${tokenIndex}`}
              style={[styles.tokenChip, selected && styles.tokenChipSelected]}
              onPress={() => setSelectedWord(token)}
            >
              <Text style={styles.tokenText}>{token}</Text>
            </Pressable>
          );
        })}
      </View>
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
          {selectedWord && (
            <Pressable style={styles.extractButton} onPress={() => void handleExtractWord()}>
              <Text style={styles.extractLabel}>Extract Word</Text>
            </Pressable>
          )}
          {feedback && <Text style={styles.feedback}>{feedback}</Text>}
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
  sentence: {
    color: theme.textPrimary,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
  },
  tokenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tokenChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tokenChipSelected: {
    borderColor: '#FFD166',
    backgroundColor: 'rgba(255,209,102,0.2)',
  },
  tokenText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
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
  extractButton: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#FFD166',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,209,102,0.16)',
  },
  extractLabel: {
    color: '#FFE7A3',
    fontWeight: '700',
    fontSize: 15,
  },
  feedback: {
    color: '#90F3B8',
    fontSize: 13,
  },
});
