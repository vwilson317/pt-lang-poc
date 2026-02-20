import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { createJob, getJobResult, getJobStatus } from '../lib/jobsApi';
import { addCards, getSelectedDeckId, upsertClip } from '../lib/v11Storage';
import type { ClipStatus, FlashCardRecord } from '../types/v11';
import { theme } from '../theme';

type ImportState = 'EMPTY' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';

function mapFailure(status: ClipStatus | 'PROCESSING', message?: string): string {
  if (status === 'FAILED_NO_AUDIO') {
    return [
      'This clip does not contain usable audio.',
      'Screen recordings must include sound.',
      'Record with device audio enabled.',
      'Avoid Bluetooth/headphones if it mutes recording.',
      'Quiet room + speaker volume medium.',
    ].join('\n');
  }
  if (status === 'FAILED_TOO_LONG') return 'Clip is longer than 45 seconds.';
  if (status === 'FAILED_TRANSCODE') return 'Could not decode media.';
  if (status === 'FAILED_TRANSCRIBE') return 'Could not transcribe audio.';
  return message || 'Processing failed. Try another recording.';
}

export function ImportTabScreen() {
  const router = useRouter();
  const [state, setState] = useState<ImportState>('EMPTY');
  const [asset, setAsset] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId || (state !== 'PROCESSING' && state !== 'UPLOADING')) return;
    if (state === 'UPLOADING') return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          const status = await getJobStatus(jobId);
          if (status.status === 'PROCESSING') return;
          if (status.status !== 'DONE') {
            setState('FAILED');
            setErrorMessage(mapFailure(status.status, status.message));
            return;
          }
          const clip = await getJobResult(jobId);
          await upsertClip(clip);
          const deckId = await getSelectedDeckId();
          const sentenceCards: FlashCardRecord[] = clip.segments.map((segment) => ({
            id: `sentence-${clip.id}-${segment.id}`,
            deckId,
            cardType: 'sentence',
            front: segment.textOriginal,
            back: segment.textTranslated,
            sourceClipId: clip.id,
            sourceSegmentId: segment.id,
            createdAt: Date.now(),
          }));
          await addCards(sentenceCards);
          setState('DONE');
          router.push(`/clip/${clip.id}`);
        } catch {
          setState('FAILED');
          setErrorMessage('Failed to fetch processing status. Try again.');
        }
      })();
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, router, state]);

  const maybeDurationMs = (asset as ({ duration?: number } & DocumentPicker.DocumentPickerAsset) | null)?.duration;
  const hasDuration = typeof maybeDurationMs === 'number' && maybeDurationMs > 0;
  const durationSec = useMemo(() => {
    if (!hasDuration || !maybeDurationMs) return null;
    return Math.round(maybeDurationMs / 1000);
  }, [hasDuration, maybeDurationMs]);
  const durationTooLong = (durationSec ?? 0) > 45;

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'video/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    setAsset(result.assets[0] ?? null);
    setState('SELECTED');
    setProgress(0);
    setErrorMessage(null);
    setJobId(null);
  }, []);

  const startUpload = useCallback(async () => {
    if (!asset) return;
    setState('UPLOADING');
    setErrorMessage(null);
    try {
      const created = await createJob(
        {
          uri: asset.uri,
          name: asset.name ?? 'screen-recording.mp4',
          mimeType: asset.mimeType ?? 'video/mp4',
        },
        (pct) => setProgress(pct)
      );
      setJobId(created.jobId);
      setState('PROCESSING');
    } catch {
      setState('FAILED');
      setErrorMessage('Upload failed. Please try again in a moment.');
    }
  }, [asset]);

  if (state === 'EMPTY') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Import Screen Recording</Text>
        <Text style={styles.helper}>Max 45 seconds. Audio required.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void pickFile()}>
          <Text style={styles.primaryLabel}>Import Screen Recording</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'SELECTED') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>File Selected</Text>
        <Text style={styles.fileName}>{asset?.name || 'Screen Recording'}</Text>
        <Text style={styles.helper}>
          Duration: {durationSec != null ? `${durationSec}s` : 'Unavailable'}
        </Text>
        {durationTooLong && (
          <Text style={styles.warning}>This file appears longer than 45 seconds.</Text>
        )}
        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={() => void pickFile()}>
            <Text style={styles.secondaryLabel}>Choose Another</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void startUpload()}>
            <Text style={styles.primaryLabel}>Upload & Process</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === 'UPLOADING' || state === 'PROCESSING') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>
          {state === 'UPLOADING' ? `Uploading... ${progress}%` : 'Processing...'}
        </Text>
        <Text style={styles.helper}>
          {state === 'UPLOADING'
            ? 'Upload in progress.'
            : 'You can keep practicing while we process this clip.'}
        </Text>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push('/(tabs)/practice')}
        >
          <Text style={styles.secondaryLabel}>Keep Practicing</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'DONE') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Clip ready</Text>
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/clips')}>
            <Text style={styles.primaryLabel}>View Clip</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setState('EMPTY');
              setAsset(null);
              setErrorMessage(null);
              setProgress(0);
            }}
          >
            <Text style={styles.secondaryLabel}>Import Another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Import failed</Text>
      <Text style={styles.errorText}>{errorMessage}</Text>
      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          setState('EMPTY');
          setAsset(null);
          setErrorMessage(null);
          setJobId(null);
          setProgress(0);
        }}
      >
        <Text style={styles.primaryLabel}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: theme.bg0,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  title: {
    color: theme.textPrimary,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  helper: {
    color: theme.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
  fileName: {
    color: theme.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  warning: {
    color: '#FFD166',
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: '#FF9AAE',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
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
    fontSize: 15,
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
    fontSize: 15,
  },
});
