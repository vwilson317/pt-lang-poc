import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import DraggableFlatList, {
  type RenderItemParams,
} from 'react-native-draggable-flatlist';
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

type SentencePill = {
  id: string;
  token: string;
};

function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalizeSentenceForCompare(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9à-öø-ÿ'’\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function SentencePracticeScreen({ sourceClipId, onBack }: Props) {
  const [cards, setCards] = useState<FlashCardRecord[]>([]);
  const [clipsById, setClipsById] = useState<Record<string, ClipRecord>>({});
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [pills, setPills] = useState<SentencePill[]>([]);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
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
  const sourceTokens = useMemo(() => tokenizeSentence(current?.front ?? ''), [current?.front]);
  const targetTokens = useMemo(() => tokenizeSentence(current?.back ?? ''), [current?.back]);

  useEffect(() => {
    if (!current) {
      setPills([]);
      setChecked(false);
      setIsCorrect(null);
      return;
    }
    const nextPills = targetTokens.map((token, tokenIndex) => ({
      id: `${current.id}-${tokenIndex}-${token}`,
      token,
    }));
    setPills(shuffleArray(nextPills));
    setChecked(false);
    setIsCorrect(null);
    setSelectedWord(null);
    setFeedback(null);
  }, [current, targetTokens]);

  const tokenTranslation = useMemo(() => {
    if (!current?.sourceClipId || !current.sourceSegmentId || !selectedWord) return undefined;
    const clip = clipsById[current.sourceClipId];
    const segment = clip?.segments.find((item) => item.id === current.sourceSegmentId);
    return segment?.tokens?.find((token) => token.text.toLowerCase() === selectedWord.toLowerCase())?.translation;
  }, [clipsById, current?.sourceClipId, current?.sourceSegmentId, selectedWord]);

  const handleCheck = useCallback(() => {
    if (!current) return;
    const arranged = pills.map((pill) => pill.token).join(' ');
    const matches =
      normalizeSentenceForCompare(arranged) === normalizeSentenceForCompare(current.back);
    setIsCorrect(matches);
    setChecked(true);
  }, [current, pills]);

  const moveNext = useCallback(
    () => {
      if (isCorrect == null) return;
      setStats((prev) => ({
        right: prev.right + (isCorrect ? 1 : 0),
        wrong: prev.wrong + (isCorrect ? 0 : 1),
      }));
      setChecked(false);
      setIsCorrect(null);
      setSelectedWord(null);
      setFeedback(null);
      setIndex((prev) => prev + 1);
    },
    [isCorrect]
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
            setIsCorrect(null);
            setPills([]);
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

      <Text style={styles.sectionLabel}>Source words (tap to extract)</Text>
      <View style={styles.sourceTokenRow}>
        {sourceTokens.map((token, tokenIndex) => {
          const selected = selectedWord?.toLowerCase() === token.toLowerCase();
          return (
            <Pressable
              key={`${token}-${tokenIndex}`}
              style={[styles.sourceTokenChip, selected && styles.sourceTokenChipSelected]}
              onPress={() => setSelectedWord(token)}
            >
              <Text style={styles.sourceTokenText}>{token}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionLabel}>Drag translation pills into the correct order</Text>
      <View style={styles.dragBoard}>
        <DraggableFlatList
          data={pills}
          onDragEnd={({ data }) => setPills(data)}
          keyExtractor={(item) => item.id}
          activationDistance={12}
          scrollEnabled={false}
          contentContainerStyle={styles.dragList}
          renderItem={({ item, drag, isActive }: RenderItemParams<SentencePill>) => (
            <Pressable
              onLongPress={drag}
              delayLongPress={120}
              style={[styles.dragPill, isActive && styles.dragPillActive]}
            >
              <Text style={styles.dragPillText}>{item.token}</Text>
            </Pressable>
          )}
        />
      </View>

      {!checked ? (
        <Pressable
          style={[styles.primaryButton, pills.length === 0 && styles.buttonDisabled]}
          onPress={handleCheck}
          disabled={pills.length === 0}
        >
          <Text style={styles.primaryLabel}>Check</Text>
        </Pressable>
      ) : (
        <View style={styles.answerWrap}>
          <Text style={[styles.resultLabel, isCorrect ? styles.resultCorrect : styles.resultWrong]}>
            {isCorrect ? 'Correct' : 'Not quite'}
          </Text>
          <Text style={styles.answerLabel}>Expected order</Text>
          <Text style={styles.answerText}>{current.back}</Text>
          <Text style={styles.answerLabel}>Your order</Text>
          <Text style={styles.answerText}>{pills.map((pill) => pill.token).join(' ')}</Text>
          <Pressable style={styles.primaryButton} onPress={moveNext}>
            <Text style={styles.primaryLabel}>Next</Text>
          </Pressable>
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
  sectionLabel: {
    color: theme.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sourceTokenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceTokenChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sourceTokenChipSelected: {
    borderColor: '#FFD166',
    backgroundColor: 'rgba(255,209,102,0.2)',
  },
  sourceTokenText: {
    color: theme.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  dragBoard: {
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    minHeight: 80,
  },
  dragList: {
    padding: 10,
    gap: 8,
  },
  dragPill: {
    minHeight: 42,
    borderRadius: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(106,92,255,0.28)',
  },
  dragPillActive: {
    borderColor: '#C3B8FF',
    backgroundColor: 'rgba(130,110,255,0.48)',
  },
  dragPillText: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.brand,
  },
  buttonDisabled: {
    opacity: 0.45,
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
  resultLabel: {
    fontSize: 20,
    fontWeight: '800',
  },
  resultCorrect: {
    color: '#8DF1B1',
  },
  resultWrong: {
    color: '#FF9AAE',
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
