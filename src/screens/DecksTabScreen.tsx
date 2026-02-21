import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ensureV11Initialized, getDeckCounts, getDecks, getSelectedDeckId, setSelectedDeck } from '../lib/v11Storage';
import type { Deck, DeckCounts } from '../types/v11';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getPracticeLanguageLabel } from '../types/practiceLanguage';
import { getPracticeLanguage, setPracticeLanguage } from '../lib/storage';
import { theme } from '../theme';

type DeckWithCounts = Deck & { counts: DeckCounts };

export function DecksTabScreen() {
  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [practiceLanguage, setPracticeLanguageState] = useState<PracticeLanguage>('pt');

  const load = useCallback(async () => {
    setLoading(true);
    await ensureV11Initialized();
    const [items, selectedDeckId, language] = await Promise.all([
      getDecks(),
      getSelectedDeckId(),
      getPracticeLanguage(),
    ]);
    const withCounts = await Promise.all(
      items.map(async (deck) => {
        const counts = await getDeckCounts(deck.id);
        return {
          ...deck,
          isSelected: deck.id === selectedDeckId,
          counts,
        };
      })
    );
    setDecks(withCounts);
    setPracticeLanguageState(language);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Loading decks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Decks</Text>
      <Text style={styles.subtitle}>Add to Deck</Text>
      <View style={styles.settingsCard}>
        <Text style={styles.settingsTitle}>Settings</Text>
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
      {decks.map((deck) => (
        <Pressable
          key={deck.id}
          style={[styles.deckCard, deck.isSelected && styles.deckCardSelected]}
          onPress={() => {
            void setSelectedDeck(deck.id).then(() => load());
          }}
        >
          <View style={styles.deckTopRow}>
            <Text style={styles.deckName}>{deck.name}</Text>
            {deck.isSelected && <Text style={styles.selectedBadge}>Selected</Text>}
          </View>
          <Text style={styles.deckCounts}>
            Total: {deck.counts.total} · Words: {deck.counts.word} · Sentences: {deck.counts.sentence}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg0,
    padding: 16,
    gap: 10,
  },
  centered: {
    flex: 1,
    backgroundColor: theme.bg0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.textMuted,
    fontSize: 13,
  },
  settingsCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    gap: 8,
  },
  settingsTitle: {
    color: theme.textPrimary,
    fontSize: 15,
    fontWeight: '700',
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
  deckCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    gap: 6,
  },
  deckCardSelected: {
    borderColor: '#9AA7FF',
    backgroundColor: 'rgba(122,93,255,0.2)',
  },
  deckTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deckName: {
    color: theme.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  selectedBadge: {
    color: '#CBD3FF',
    fontSize: 12,
    fontWeight: '700',
  },
  deckCounts: {
    color: theme.textMuted,
    fontSize: 13,
  },
});
