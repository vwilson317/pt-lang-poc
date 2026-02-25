import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FlashSessionScreen } from './FlashSessionScreen';
import { getSelectedDeckId, getWordCards } from '../lib/v11Storage';
import { theme } from '../theme';
import type { Word } from '../types/word';

type Props = {
  sourceClipId?: string;
  onBack: () => void;
};

export function WordCardPracticeScreen({ sourceClipId, onBack }: Props) {
  const [cards, setCards] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const deckId = await getSelectedDeckId();
    const wordCards = await getWordCards(deckId, sourceClipId);
    const nextWords: Word[] = wordCards
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((card) => ({
        id: `imported-word-${card.id}`,
        sourceCardId: card.id,
        term: card.front,
        en: card.back,
        pronHintEn: card.pronHintEn,
        isCustom: true,
        language: 'pt',
        photo: card.photo,
        seenCount: card.seenCount ?? 0,
        wrongCount: card.wrongCount ?? 0,
        photoPromptDismissed: card.photoPromptDismissed ?? false,
      }));
    setCards(nextWords);
    setLoading(false);
  }, [sourceClipId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  return <FlashSessionScreen presetWords={cards} />;
}

const styles = StyleSheet.create({
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
});
