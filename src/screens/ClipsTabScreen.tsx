import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { clipSnippet } from '../lib/clipExport';
import { getClips } from '../lib/v11Storage';
import type { ClipRecord } from '../types/v11';
import { theme } from '../theme';

export function ClipsTabScreen() {
  const router = useRouter();
  const [clips, setClips] = useState<ClipRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const nextClips = await getClips();
    setClips(nextClips);
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
        <Text style={styles.title}>Loading clips...</Text>
      </View>
    );
  }

  if (clips.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>No clips yet</Text>
        <Text style={styles.subtitle}>Upload media to start transcript mining.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {clips.map((clip) => (
        <Pressable
          key={clip.id}
          style={styles.item}
          onPress={() => router.push(`/clip/${clip.id}`)}
        >
          <Text style={styles.meta}>
            {new Date(clip.createdAt).toLocaleString()} ·{' '}
            {clip.sourceLanguage.toUpperCase()}→{clip.targetLanguage.toUpperCase()}
          </Text>
          <Text style={styles.snippet}>{clipSnippet(clip)}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    gap: 10,
    backgroundColor: theme.bg0,
  },
  centered: {
    flex: 1,
    backgroundColor: theme.bg0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
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
  item: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    gap: 6,
  },
  meta: {
    color: theme.textMuted,
    fontSize: 12,
  },
  snippet: {
    color: theme.textPrimary,
    fontSize: 15,
    lineHeight: 21,
  },
});
