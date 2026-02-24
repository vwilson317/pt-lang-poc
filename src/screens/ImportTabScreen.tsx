import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { createJob, getJobResult, getJobStatus } from '../lib/jobsApi';
import { addCards, createDeck, getSelectedDeckId, setSelectedDeck, upsertClip } from '../lib/v11Storage';
import type { ClipSegment, ClipStatus, FlashCardRecord } from '../types/v11';
import { makeId } from '../lib/id';
import {
  buildWhatsAppImport,
} from '../lib/whatsAppImport';
import { ensureLexiconDbInitialized, getTranslationLookupDb } from '../lib/lexiconDb';
import { trackEvent } from '../lib/analytics';
import { theme } from '../theme';

type ImportState = 'EMPTY' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';
type PickerAsset = DocumentPicker.DocumentPickerAsset & { file?: File; duration?: number };
type ImportKind = 'media' | 'whatsapp';
const ANALYTICS_WAIT_MS = 750;

function sanitizeDeckToken(value: string): string {
  return value.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildWhatsAppDeckName(assetName: string | undefined, clipId: string): string {
  const baseName = sanitizeDeckToken(assetName ?? '');
  const base = baseName ? `WA ${baseName}` : 'WA Thread';
  const suffix = clipId.slice(-4);
  return `${base} ${suffix}`;
}

async function confirmWhatsAppImportStart(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
    return window.confirm(
      'Importing this conversation will create and select a new deck, and start a new word session with these words. Continue?'
    );
  }
  return new Promise<boolean>((resolve) => {
    Alert.alert(
      'Start new session?',
      'Importing this conversation will create and select a new deck, and start a new word session with these words.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Import', onPress: () => resolve(true) },
      ]
    );
  });
}

async function trackEventBestEffort(
  event: string,
  properties: Record<string, unknown>,
  timeoutMs: number = ANALYTICS_WAIT_MS
): Promise<void> {
  await Promise.race([
    trackEvent(event, properties),
    new Promise<void>((resolve) => {
      setTimeout(() => resolve(), timeoutMs);
    }),
  ]);
}

function normalizedAssetName(asset: PickerAsset): string {
  return (asset.name ?? '').trim().toLowerCase();
}

function sanitizeTokenForCardId(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeEnglishGuess(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+or\s+/gi, '/')
    .split(/[\/|,;]/)[0]
    .trim()
    .toLocaleLowerCase();
}

function buildWordCardsFromSegments(
  segments: ClipSegment[],
  deckId: string,
  clipId: string
): FlashCardRecord[] {
  const seen = new Set<string>();
  const cards: FlashCardRecord[] = [];
  for (const segment of segments) {
    const segmentTokens = segment.tokens?.length
      ? segment.tokens.map((token) => ({
          front: token.text.trim().toLocaleLowerCase(),
          back: token.translation?.trim(),
        }))
      : (segment.textOriginal.match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g) ?? []).map((token) => ({
          front: token.trim().toLocaleLowerCase(),
          back: undefined,
        }));
    for (const token of segmentTokens) {
      const normalizedFront = token.front;
      if (normalizedFront.length < 2) continue;
      if (seen.has(normalizedFront)) continue;
      seen.add(normalizedFront);
      const slug = sanitizeTokenForCardId(normalizedFront);
      if (!slug) continue;
      const normalizedBack = normalizeEnglishGuess(token.back ?? normalizedFront);
      cards.push({
        id: `word-${clipId}-${slug}`,
        deckId,
        cardType: 'word',
        front: normalizedFront,
        back: normalizedBack || normalizedFront,
        sourceClipId: clipId,
        createdAt: Date.now() + cards.length,
      });
    }
  }
  return cards;
}

function scoreZipTextEntry(entryName: string): number {
  const normalized = entryName.toLowerCase().replace(/\\/g, '/');
  const baseName = normalized.split('/').at(-1) ?? normalized;
  let score = 0;
  if (baseName === '_chat.txt') score += 100;
  if (baseName === 'chat.txt') score += 90;
  if (baseName.includes('chat')) score += 35;
  if (baseName.includes('whatsapp')) score += 20;
  if (normalized.includes('/')) score -= 2;
  return score;
}

function pickZipTextEntry(zip: any) {
  const textEntries = zip
    .file(/\.txt$/i)
    .filter(
      (entry: { dir: boolean; name: string }) =>
        !entry.dir && !entry.name.toLowerCase().startsWith('__macosx/')
    );
  if (textEntries.length === 0) return undefined;
  return [...textEntries].sort((left, right) => {
    const scoreDiff = scoreZipTextEntry(right.name) - scoreZipTextEntry(left.name);
    if (scoreDiff !== 0) return scoreDiff;
    return left.name.localeCompare(right.name);
  })[0];
}

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
  const [importKind, setImportKind] = useState<ImportKind>('media');
  const [whatsAppTextCache, setWhatsAppTextCache] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing import...');
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importedCardsCount, setImportedCardsCount] = useState(0);
  const [importedWordCount, setImportedWordCount] = useState(0);
  const [importedDeckName, setImportedDeckName] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (importKind !== 'media') return;
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
          await upsertClip({ ...clip, importCardType: 'word' });
          const deckId = await getSelectedDeckId();
          const wordCards = buildWordCardsFromSegments(clip.segments, deckId, clip.id);
          if (wordCards.length === 0) {
            setState('FAILED');
            setErrorMessage('No word cards were created from this media.');
            return;
          }
          await addCards(wordCards);
          setImportedCardsCount(wordCards.length);
          setImportedWordCount(wordCards.length);
          setImportWarning(null);
          setProgress(100);
          setProgressLabel('Complete');
          setState('DONE');
          router.push(`/(tabs)/imports/${clip.id}`);
        } catch {
          setState('FAILED');
          setErrorMessage('Failed to fetch processing status. Try again.');
        }
      })();
    }, 1500);
    return () => clearInterval(timer);
  }, [importKind, jobId, router, state]);

  const maybeDurationMs = asset?.duration;
  const hasDuration = typeof maybeDurationMs === 'number' && maybeDurationMs > 0;
  const durationSec = useMemo(() => {
    if (!hasDuration || !maybeDurationMs) return null;
    return Math.round(maybeDurationMs / 1000);
  }, [hasDuration, maybeDurationMs]);
  const durationTooLong = (durationSec ?? 0) > 45;
  const isImage = Boolean(asset?.mimeType?.startsWith('image/'));

  const isTextAsset = useCallback((selected: PickerAsset): boolean => {
    const lowerName = normalizedAssetName(selected);
    if (lowerName.endsWith('.txt')) return true;
    const mime = (selected.mimeType ?? '').toLowerCase();
    return mime.includes('text/plain') || mime.includes('text');
  }, []);

  const isZipAsset = useCallback((selected: PickerAsset): boolean => {
    const lowerName = normalizedAssetName(selected);
    if (lowerName.endsWith('.zip')) return true;
    const mime = (selected.mimeType ?? '').toLowerCase();
    return mime.includes('application/zip') || mime.includes('zip');
  }, []);

  const isWhatsAppAsset = useCallback(
    (selected: PickerAsset): boolean => isTextAsset(selected) || isZipAsset(selected),
    [isTextAsset, isZipAsset]
  );

  const readTextAsset = useCallback(async (selected: PickerAsset): Promise<string> => {
    if (selected.file instanceof File) {
      return selected.file.text();
    }
    try {
      const response = await fetch(selected.uri);
      if (response.ok) {
        return response.text();
      }
    } catch {
      // Fall through to XHR.
    }

    return new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', selected.uri);
      xhr.onload = () => {
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
          resolve(xhr.responseText ?? '');
          return;
        }
        reject(new Error(`Could not read file (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Could not read selected file.'));
      xhr.send();
    });
  }, []);

  const readBinaryAsset = useCallback(async (selected: PickerAsset): Promise<ArrayBuffer> => {
    if (selected.file instanceof File) {
      return selected.file.arrayBuffer();
    }
    try {
      const response = await fetch(selected.uri);
      if (response.ok) {
        return await response.arrayBuffer();
      }
    } catch {
      // Fall through to XHR.
    }

    return new Promise<ArrayBuffer>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', selected.uri);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
          const { response } = xhr;
          if (response instanceof ArrayBuffer) {
            resolve(response);
            return;
          }
          reject(new Error('Could not read selected zip file.'));
          return;
        }
        reject(new Error(`Could not read file (${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Could not read selected zip file.'));
      xhr.send();
    });
  }, []);

  const readWhatsAppTextAsset = useCallback(
    async (selected: PickerAsset): Promise<string> => {
      if (!isZipAsset(selected)) {
        const text = await readTextAsset(selected);
        return text.replace(/^\uFEFF/, '');
      }
      const zipBuffer = await readBinaryAsset(selected);
      const zip = await JSZip.loadAsync(zipBuffer);
      const textEntry = pickZipTextEntry(zip);
      if (!textEntry) {
        throw new Error('Zip file does not contain a .txt WhatsApp export.');
      }
      const extractedText = await textEntry.async('string');
      if (!extractedText.trim()) {
        throw new Error(`"${textEntry.name}" in the zip archive is empty.`);
      }
      return extractedText.replace(/^\uFEFF/, '');
    },
    [isZipAsset, readBinaryAsset, readTextAsset]
  );

  const pickFile = useCallback(async (kind: ImportKind) => {
    const result = await DocumentPicker.getDocumentAsync({
      type: kind === 'media' ? ['video/*', 'image/*'] : '*/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const selected = (result.assets[0] as PickerAsset) ?? null;
    if (!selected) return;
    if (kind === 'whatsapp' && !isWhatsAppAsset(selected)) {
      setState('FAILED');
      setErrorMessage('Please choose a WhatsApp .txt or .zip export file.');
      return;
    }
    const durationMs = kind === 'media' ? await resolveDurationMs(selected) : null;
    setAsset(durationMs != null ? { ...selected, duration: durationMs } : selected);
    setImportKind(kind);
    setState('SELECTED');
    setProgress(0);
    setProgressLabel('Preparing import...');
    setErrorMessage(null);
    setImportWarning(null);
    setImportedCardsCount(0);
    setImportedWordCount(0);
    setImportedDeckName(null);
    setJobId(null);
    setWhatsAppTextCache(null);
  }, [isWhatsAppAsset]);

  const startWhatsAppImport = useCallback(async () => {
    if (!asset) return;

    setErrorMessage(null);
    setImportWarning(null);
    setState('PROCESSING');
    setProgress(5);
    setProgressLabel('Reading WhatsApp export...');

    try {
      const rawText = whatsAppTextCache ?? (await readWhatsAppTextAsset(asset));
      if (!whatsAppTextCache) {
        setWhatsAppTextCache(rawText);
      }
      await ensureLexiconDbInitialized();
      const translationDb = getTranslationLookupDb();
      setProgress(35);
      setProgressLabel('Parsing thread...');
      const parsed = await buildWhatsAppImport(rawText, { translationDb });
      if (parsed.segments.length === 0) {
        setState('FAILED');
        setErrorMessage(parsed.warning ?? 'No usable messages found in this thread export.');
        void trackEvent('whatsapp_import_failed', {
          reason: 'no_segments',
          warning: parsed.warning ?? null,
        });
        return;
      }

      const clipId = makeId('clip-wa');
      setProgress(65);
      setProgressLabel('Building cards...');

      const clip = {
        id: clipId,
        sourceLanguage: 'pt' as const,
        targetLanguage: 'en' as const,
        importCardType: 'word' as const,
        transcriptOriginal: parsed.transcript,
        transcriptTranslated: parsed.transcriptTranslated,
        segments: parsed.segments,
        createdAt: Date.now(),
      };

      await upsertClip(clip);
      const deckName = buildWhatsAppDeckName(asset?.name, clip.id);
      const deck = await createDeck(deckName);
      await setSelectedDeck(deck.id);
      const deckId = deck.id;
      const wordCards = buildWordCardsFromSegments(clip.segments, deckId, clip.id);
      if (wordCards.length === 0) {
        setState('FAILED');
        setErrorMessage('No cards were created from this thread.');
        return;
      }

      await addCards(wordCards);
      setImportedCardsCount(wordCards.length);
      setImportedWordCount(wordCards.length);
      setImportedDeckName(deck.name);
      setImportWarning(parsed.warning ?? null);
      await trackEventBestEffort('whatsapp_import_completed', {
        deck_id: deck.id,
        deck_name: deck.name,
        word_cards: wordCards.length,
        segments: parsed.segments.length,
      });
      setProgress(100);
      setProgressLabel('Complete');
      setState('DONE');
      router.push({
        pathname: '/(tabs)/practice',
        params: { mode: 'words', clipId: clip.id, restartSession: String(Date.now()) },
      });
    } catch (error) {
      setState('FAILED');
      const fallback = 'Could not import this WhatsApp export. Try another .txt or .zip file.';
      void trackEvent('whatsapp_import_failed', {
        reason: 'exception',
        message: error instanceof Error ? error.message : String(error),
      });
      setErrorMessage(error instanceof Error ? error.message || fallback : fallback);
    }
  }, [
    asset,
    readWhatsAppTextAsset,
    router,
    whatsAppTextCache,
  ]);

  const startUpload = useCallback(async () => {
    if (!asset) return;
    if (importKind === 'whatsapp') {
      const shouldImport = await confirmWhatsAppImportStart();
      if (!shouldImport) return;
      await trackEventBestEffort('whatsapp_import_confirmed', {
        file_name: asset.name ?? '',
      });
      await startWhatsAppImport();
      return;
    }
    setState('UPLOADING');
    setProgressLabel('Uploading media...');
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
  }, [asset, importKind, isImage, startWhatsAppImport]);

  if (state === 'EMPTY') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Import Content</Text>
        <Text style={styles.helper}>Choose media or a WhatsApp .txt/.zip thread export.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void pickFile('media')}>
          <Text style={styles.primaryLabel}>Choose Media</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => void pickFile('whatsapp')}>
          <Text style={styles.secondaryLabel}>Choose WhatsApp TXT/ZIP</Text>
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
          {importKind === 'whatsapp'
            ? asset && isZipAsset(asset)
              ? 'Type: WhatsApp zip export'
              : 'Type: WhatsApp text export'
            : isImage
            ? 'Type: Photo'
            : `Duration: ${durationSec != null ? `${durationSec}s` : 'Unavailable'}`}
        </Text>
        {importKind === 'media' && !isImage && durationTooLong && (
          <Text style={styles.warning}>This file appears longer than 45 seconds.</Text>
        )}
        {importKind === 'whatsapp' && (
          <View style={styles.whatsAppOptions}>
            <Text style={styles.helper}>
              We import the full conversation, create a new deck, select it, and start a new word session.
            </Text>
          </View>
        )}
        {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
        <View style={styles.row}>
          <Pressable style={styles.secondaryButton} onPress={() => void pickFile(importKind)}>
            <Text style={styles.secondaryLabel}>Choose Another</Text>
          </Pressable>
          <Pressable style={styles.primaryButton} onPress={() => void startUpload()}>
            <Text style={styles.primaryLabel}>
              {importKind === 'whatsapp' ? 'Import Thread' : 'Upload Media'}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (state === 'UPLOADING' || state === 'PROCESSING') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{state === 'UPLOADING' ? `Uploading... ${progress}%` : 'Processing...'}</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.max(0, Math.min(100, progress))}%` }]} />
        </View>
        <Text style={styles.helper}>{progressLabel}</Text>
        <Text style={styles.helper}>
          {state === 'UPLOADING'
            ? 'Upload in progress.'
            : importKind === 'whatsapp'
            ? 'You can keep practicing while we process this thread.'
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
        <Text style={styles.title}>{importKind === 'whatsapp' ? 'Thread imported' : 'Media ready'}</Text>
        {importKind === 'whatsapp' ? (
          <Text style={styles.helper}>
            Created {importedWordCount} word cards.
          </Text>
        ) : (
          <Text style={styles.helper}>Created {importedCardsCount} word cards.</Text>
        )}
        {importKind === 'whatsapp' && importedDeckName && (
          <Text style={styles.helper}>Selected deck: {importedDeckName}</Text>
        )}
        {importWarning && <Text style={styles.warning}>{importWarning}</Text>}
        <View style={styles.row}>
          <Pressable style={styles.primaryButton} onPress={() => router.push('/(tabs)/imports')}>
            <Text style={styles.primaryLabel}>View Imports</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => {
              setState('EMPTY');
              setAsset(null);
              setImportKind('media');
              setErrorMessage(null);
              setImportWarning(null);
              setImportedCardsCount(0);
              setImportedWordCount(0);
              setImportedDeckName(null);
              setWhatsAppTextCache(null);
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
      <Text style={styles.title}>Upload failed</Text>
      <Text style={styles.errorText}>{errorMessage}</Text>
      <Pressable
        style={styles.primaryButton}
        onPress={() => {
          setState('EMPTY');
          setAsset(null);
          setImportKind('media');
          setErrorMessage(null);
          setImportWarning(null);
          setImportedCardsCount(0);
          setImportedWordCount(0);
          setImportedDeckName(null);
          setWhatsAppTextCache(null);
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
    color: theme.warning,
    fontSize: 13,
    textAlign: 'center',
  },
  errorText: {
    color: theme.bad,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  whatsAppOptions: {
    width: '100%',
    gap: 6,
    marginTop: 4,
  },
  progressTrack: {
    width: '100%',
    maxWidth: 360,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: theme.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.brand,
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
    backgroundColor: theme.surface,
  },
  secondaryLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
