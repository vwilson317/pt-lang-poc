import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { buildStudyPack } from '../lib/clipExport';
import { getClipById } from '../lib/v11Storage';
import type { ClipRecord } from '../types/v11';
import { theme } from '../theme';

type Props = {
  clipId: string;
};

function formatRange(startMs: number, endMs: number): string {
  const s = Math.floor(startMs / 1000);
  const e = Math.floor(endMs / 1000);
  const ss = String(s % 60).padStart(2, '0');
  const sm = String(Math.floor(s / 60)).padStart(2, '0');
  const es = String(e % 60).padStart(2, '0');
  const em = String(Math.floor(e / 60)).padStart(2, '0');
  return `[${sm}:${ss}-${em}:${es}]`;
}

export function ClipDetailScreen({ clipId }: Props) {
  const router = useRouter();
  const [clip, setClip] = useState<ClipRecord | null>(null);
  const [expandedSegmentId, setExpandedSegmentId] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);

  const load = useCallback(async () => {
    const found = await getClipById(clipId);
    setClip(found);
  }, [clipId]);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = useCallback(async (value: string) => {
    await Clipboard.setStringAsync(value);
  }, []);

  const studyPack = useMemo(() => (clip ? buildStudyPack(clip) : ''), [clip]);

  if (!clip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Clip not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headRow}>
        <Text style={styles.title}>Import Detail</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>

      <Text style={styles.meta}>
        {new Date(clip.createdAt).toLocaleString()} · {clip.sourceLanguage.toUpperCase()}→
        {clip.targetLanguage.toUpperCase()}
      </Text>

      <View style={styles.actionRow}>
        <Pressable style={styles.secondaryButton} onPress={() => void copy(clip.transcriptOriginal)}>
          <Text style={styles.secondaryLabel}>Copy Full Original Transcript</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void copy(clip.transcriptTranslated)}>
          <Text style={styles.secondaryLabel}>Copy Full Translated Transcript</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void copy(studyPack)}>
          <Text style={styles.secondaryLabel}>Copy Study Pack</Text>
        </Pressable>
        <Pressable
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: '/(tabs)/practice',
              params: { mode: 'sentences', clipId: clip.id },
            })
          }
        >
          <Text style={styles.primaryLabel}>Practice Sentences</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => setShowOriginal((prev) => !prev)} style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Original transcript</Text>
        <Text style={styles.link}>{showOriginal ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {showOriginal && <Text style={styles.transcript}>{clip.transcriptOriginal}</Text>}

      <Pressable onPress={() => setShowTranslated((prev) => !prev)} style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Translated transcript</Text>
        <Text style={styles.link}>{showTranslated ? 'Hide' : 'Show'}</Text>
      </Pressable>
      {showTranslated && <Text style={styles.transcript}>{clip.transcriptTranslated}</Text>}

      <Text style={styles.sectionTitle}>Segments</Text>
      {clip.segments.map((segment) => {
        const expanded = expandedSegmentId === segment.id;
        return (
          <View key={segment.id} style={styles.segmentRow}>
            <Pressable
              onPress={() => setExpandedSegmentId((prev) => (prev === segment.id ? null : segment.id))}
            >
              <Text style={styles.segmentPreview}>
                {formatRange(segment.startMs, segment.endMs)} {segment.textOriginal}
              </Text>
            </Pressable>
            {expanded && (
              <View style={styles.segmentExpanded}>
                <Text style={styles.segmentText}>Original: {segment.textOriginal}</Text>
                <Text style={styles.segmentText}>Translation: {segment.textTranslated}</Text>
                <View style={styles.segmentActions}>
                  <Pressable style={styles.miniButton} onPress={() => void copy(segment.textOriginal)}>
                    <Text style={styles.miniLabel}>Copy Original</Text>
                  </Pressable>
                  <Pressable style={styles.miniButton} onPress={() => void copy(segment.textTranslated)}>
                    <Text style={styles.miniLabel}>Copy Translation</Text>
                  </Pressable>
                  <Pressable
                    style={styles.miniButton}
                    onPress={() => void copy(`${segment.textOriginal}\n${segment.textTranslated}`)}
                  >
                    <Text style={styles.miniLabel}>Copy Both</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        );
      })}
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
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: theme.textPrimary,
    fontSize: 24,
    fontWeight: '700',
  },
  meta: {
    color: theme.textMuted,
    fontSize: 12,
  },
  link: {
    color: '#9AA7FF',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sectionTitle: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  transcript: {
    color: theme.textPrimary,
    fontSize: 14,
    lineHeight: 21,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: theme.stroke,
    borderRadius: 12,
    padding: 10,
  },
  actionRow: {
    gap: 8,
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 23,
    backgroundColor: theme.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryLabel: {
    color: theme.textPrimary,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
  segmentRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
    padding: 10,
    gap: 8,
  },
  segmentPreview: {
    color: theme.textPrimary,
    fontSize: 14,
  },
  segmentExpanded: {
    gap: 8,
  },
  segmentText: {
    color: theme.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  segmentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  miniButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.stroke,
  },
  miniLabel: {
    color: theme.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
});
