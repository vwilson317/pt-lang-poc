import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ensureV11Initialized, getDeckCounts, getDecks, getSelectedDeckId, setSelectedDeck } from '../lib/v11Storage';
import { getHasActivePracticeSession } from '../lib/storage';
import { trackEvent } from '../lib/analytics';
import type { Deck, DeckCounts } from '../types/v11';
import { theme } from '../theme';

type DeckWithCounts = Deck & { counts: DeckCounts };

export function DecksTabScreen() {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    await ensureV11Initialized();
    const [items, selectedDeckId] = await Promise.all([getDecks(), getSelectedDeckId()]);
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
    const activeSession = await getHasActivePracticeSession();
    setHasActiveSession(activeSession);
    setLoading(false);
  }, []);

  const handleSwitchDeck = useCallback((deck: DeckWithCounts) => {
    if (deck.counts.total === 0) return;
    const confirmAndSwitch = () => {
      void setSelectedDeck(deck.id).then(() => {
        void trackEvent('deck_selected', {
          deck_id: deck.id,
          deck_name: deck.name,
          total_cards: deck.counts.total,
          words: deck.counts.word,
          sentences: deck.counts.sentence,
          phrases: deck.counts.phrase,
        });
        void load();
        router.replace({
          pathname: '/(tabs)/practice',
          params: { mode: 'words', restartSession: String(Date.now()) },
        });
      });
    };

    if (!hasActiveSession) {
      confirmAndSwitch();
      return;
    }

    Alert.alert(
      'Switch deck?',
      'This will interrupt your current session.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: confirmAndSwitch },
      ]
    );
  }, [hasActiveSession, load, router]);

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
      {decks.map((deck) => (
        (() => {
          const isEmpty = deck.counts.total === 0;
          const isDisabled = !deck.isSelected && isEmpty;
          return (
            <Pressable
              key={deck.id}
              disabled={isDisabled}
              style={[
                styles.deckCard,
                deck.isSelected && styles.deckCardSelected,
                isDisabled && styles.deckCardDisabled,
              ]}
              onPress={() => {
                if (deck.isSelected) return;
                handleSwitchDeck(deck);
              }}
            >
              <View style={styles.deckTopRow}>
                <Text style={[styles.deckName, isDisabled && styles.deckNameDisabled]}>{deck.name}</Text>
                {deck.isSelected && <Text style={styles.selectedBadge}>Selected</Text>}
                {isDisabled && <Text style={styles.emptyBadge}>Empty</Text>}
              </View>
              <Text style={styles.deckCounts}>
                Total: {deck.counts.total} · Words: {deck.counts.word} · Sentences: {deck.counts.sentence} · Phrases: {deck.counts.phrase}
              </Text>
            </Pressable>
          );
        })()
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
  deckCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: theme.surfaceStrong,
    padding: 12,
    gap: 6,
  },
  deckCardSelected: {
    borderColor: theme.selectedBorder,
    backgroundColor: theme.selectedBg,
  },
  deckCardDisabled: {
    opacity: 0.6,
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
  deckNameDisabled: {
    color: theme.textMuted,
  },
  selectedBadge: {
    color: theme.brand,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBadge: {
    color: theme.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  deckCounts: {
    color: theme.textMuted,
    fontSize: 13,
  },
});
