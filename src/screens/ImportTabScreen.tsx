import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { createJob, getJobResult, getJobStatus } from '../lib/jobsApi';
import { addCards, getSelectedDeckId, upsertClip } from '../lib/v11Storage';
import type { ClipStatus, FlashCardRecord } from '../types/v11';
import { theme } from '../theme';

type ImportState = 'EMPTY' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';
type PickerAsset = DocumentPicker.DocumentPickerAsset & { file?: File; duration?: number };

function normalizeDurationMs(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) return null;
  // Some platforms report seconds while others report milliseconds.
  return value < 1000 ? Math.round(value * 1000) : Math.round(value);
}

async function resolveDurationMs(asset: PickerAsset): Promise<number | null> {
  const pickerDuration = normalizeDurationMs(asset.duration);
  if (pickerDuration != null) return pickerDuration;
  if (!asset.mimeType?.startsWith('video/')) return null;

  try {
    const { sound, status } = await Audio.Sound.createAsync(
      { uri: asset.uri },
      { shouldPlay: false },
      undefined,
      false
    );
    const loaded = status as AVPlaybackStatus;
    const duration = loaded.isLoaded ? normalizeDurationMs(loaded.durationMillis) : null;
    await sound.unloadAsync();
    return duration;
  } catch {
    return null;
  }
}

function mapFailure(status: ClipStatus | 'PROCESSING', message?: string): string {
  if (status === 'FAILED_NO_AUDIO') {
    return [
      'This media file does not contain usable audio.',
      'Videos must include sound.',
      'Record with device audio enabled.',
      'Avoid Bluetooth/headphones if it mutes recording.',
      'Quiet room + speaker volume medium.',
    ].join('\n');
  }
  if (status === 'FAILED_TOO_LONG') return 'Video is longer than 45 seconds.';
  if (status === 'FAILED_TRANSCODE') return 'Could not decode media.';
  if (status === 'FAILED_TRANSCRIBE') return 'Could not transcribe audio.';
  return message || 'Processing failed. Try another file.';
}

export function ImportTabScreen() {
  const router = useRouter();
  const [state, setState] = useState<ImportState>('EMPTY');
  const [asset, setAsset] = useState<PickerAsset | null>(null);
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
          router.push(`/(tabs)/imports/${clip.id}`);
        } catch {
          setState('FAILED');
          setErrorMessage('Failed to fetch processing status. Try again.');
        }
      })();
    }, 1500);
    return () => clearInterval(timer);
  }, [jobId, router, state]);

  const maybeDurationMs = asset?.duration;
  const hasDuration = typeof maybeDurationMs === 'number' && maybeDurationMs > 0;
  const durationSec = useMemo(() => {
    if (!hasDuration || !maybeDurationMs) return null;
    return Math.round(maybeDurationMs / 1000);
  }, [hasDuration, maybeDurationMs]);
  const durationTooLong = (durationSec ?? 0) > 45;
  const isImage = Boolean(asset?.mimeType?.startsWith('image/'));

  const pickFile = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['video/*', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const selected = (result.assets[0] as PickerAsset) ?? null;
    if (!selected) return;
    const durationMs = await resolveDurationMs(selected);
    setAsset(durationMs != null ? { ...selected, duration: durationMs } : selected);
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
          name: asset.name ?? (isImage ? 'media-image' : 'media-video'),
          mimeType: asset.mimeType ?? (isImage ? 'image/jpeg' : 'video/mp4'),
          file: asset.file,
        },
        (pct) => setProgress(pct)
      );
      setJobId(created.jobId);
      setState('PROCESSING');
    } catch (error) {
      setState('FAILED');
      const fallback = 'Upload failed. Please try again in a moment.';
      setErrorMessage(error instanceof Error ? error.message || fallback : fallback);
    }
  }, [asset, isImage]);

  if (state === 'EMPTY') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Upload Media</Text>
        <Text style={styles.helper}>Upload a photo or a video. Videos can be up to 45 seconds.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void pickFile()}>
          <Text style={styles.primaryLabel}>Choose Media</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'SELECTED') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>File Selected</Text>
        <Text style={styles.fileName}>{asset?.name || 'Selected media'}</Text>
        <Text style={styles.helper}>
          {isImage
            ? 'Type: Photo'
            : `Duration: ${durationSec != null ? `${durationSec}s` : 'Unavailable'}`}
        </Text>
        {!isImage && durationTooLong && (
          <Text style={styles.warning}>This file appears longer than 45 seconds.</Text>
        )}
        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={() => void pickFile()}>
            <Text style={styles.secondaryLabel}>Choose Another</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void startUpload()}>
            <Text style={styles.primaryLabel}>Upload Media</Text>
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
            : 'You can keep practicing while we process this media.'}
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
        <Text style={styles.title}>Media ready</Text>
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/imports')}>
            <Text style={styles.primaryLabel}>View Media</Text>
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
            <Text style={styles.secondaryLabel}>Upload Another</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Upload failed</Text>
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
