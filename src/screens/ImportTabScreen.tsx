import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import JSZip from 'jszip';
import { Audio, type AVPlaybackStatus } from 'expo-av';
import { useRouter } from 'expo-router';
import { createJob, getJobResult, getJobStatus } from '../lib/jobsApi';
import { addCards, getSelectedDeckId, upsertClip } from '../lib/v11Storage';
import type { ClipSegment, ClipStatus, FlashCardRecord } from '../types/v11';
import { makeId } from '../lib/id';
import {
  buildWhatsAppImport,
  listWhatsAppSenderPhones,
  type WhatsAppSenderPhone,
} from '../lib/whatsAppImport';
import { theme } from '../theme';

type ImportState = 'EMPTY' | 'SELECTED' | 'UPLOADING' | 'PROCESSING' | 'DONE' | 'FAILED';
type PickerAsset = DocumentPicker.DocumentPickerAsset & { file?: File; duration?: number };
type ImportKind = 'media' | 'whatsapp';
type ImportDestination = 'current' | 'new';
type WhatsAppCardOutput = 'sentence' | 'word';

function normalizedAssetName(asset: PickerAsset): string {
  return (asset.name ?? '').trim().toLowerCase();
}

function formatPhoneForDisplay(value: string): string {
  return value.startsWith('+') ? value : `+${value}`;
}

function sanitizeTokenForCardId(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function buildWordCardsFromSegments(
  segments: ClipSegment[],
  deckId: string,
  clipId: string
): FlashCardRecord[] {
  const seen = new Set<string>();
  const cards: FlashCardRecord[] = [];
  for (const segment of segments) {
    const tokens = segment.textOriginal.match(/[A-Za-zÀ-ÖØ-öø-ÿ']+/g) ?? [];
    for (const token of tokens) {
      const normalized = token.trim().toLocaleLowerCase();
      if (normalized.length < 2) continue;
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      const slug = sanitizeTokenForCardId(normalized);
      if (!slug) continue;
      cards.push({
        id: `word-${clipId}-${slug}`,
        deckId,
        cardType: 'word',
        front: normalized,
        // WhatsApp import currently has no reliable EN translation per token.
        back: normalized,
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

function pickZipTextEntry(zip: JSZip) {
  const textEntries = zip
    .file(/\.txt$/i)
    .filter((entry) => !entry.dir && !entry.name.toLowerCase().startsWith('__macosx/'));
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
  const [importDestination, setImportDestination] = useState<ImportDestination>('current');
  const [whatsAppCardOutput, setWhatsAppCardOutput] = useState<WhatsAppCardOutput>('sentence');
  const [includeOtherParticipants, setIncludeOtherParticipants] = useState(false);
  const [whatsAppTextCache, setWhatsAppTextCache] = useState<string | null>(null);
  const [availableSenderPhones, setAvailableSenderPhones] = useState<WhatsAppSenderPhone[]>([]);
  const [selectedSenderPhones, setSelectedSenderPhones] = useState<string[]>([]);
  const [analyzingWhatsAppFile, setAnalyzingWhatsAppFile] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing import...');
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [importedCardsCount, setImportedCardsCount] = useState(0);
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
          setImportedCardsCount(sentenceCards.length);
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

  const toggleSelectedSenderPhone = useCallback((phone: string) => {
    setSelectedSenderPhones((prev) =>
      prev.includes(phone) ? prev.filter((item) => item !== phone) : [...prev, phone]
    );
  }, []);

  const selectedSenderSet = useMemo(
    () => new Set(selectedSenderPhones),
    [selectedSenderPhones]
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
    setJobId(null);
    setWhatsAppTextCache(null);
    setAvailableSenderPhones([]);
    setSelectedSenderPhones([]);
    setWhatsAppCardOutput('sentence');
    setIncludeOtherParticipants(false);
    setAnalyzingWhatsAppFile(false);

    if (kind !== 'whatsapp') return;
    setAnalyzingWhatsAppFile(true);
    try {
      const rawText = await readWhatsAppTextAsset(selected);
      const senderPhones = listWhatsAppSenderPhones(rawText);
      setWhatsAppTextCache(rawText);
      setAvailableSenderPhones(senderPhones);
      setSelectedSenderPhones(senderPhones.slice(0, 1).map((item) => item.phone));
      if (senderPhones.length === 0) {
        setImportWarning(
          'No phone numbers were detected in this export. You can still import all participants.'
        );
      }
    } catch (error) {
      setState('FAILED');
      const fallback = 'Could not read this WhatsApp export. Try another .txt or .zip file.';
      setErrorMessage(error instanceof Error ? error.message || fallback : fallback);
    } finally {
      setAnalyzingWhatsAppFile(false);
    }
  }, [isWhatsAppAsset, readWhatsAppTextAsset]);

  const startWhatsAppImport = useCallback(async () => {
    if (!asset) return;
    if (analyzingWhatsAppFile) {
      setState('FAILED');
      setErrorMessage('Still reading the WhatsApp file. Please wait a moment and try again.');
      return;
    }
    if (
      !includeOtherParticipants &&
      availableSenderPhones.length > 0 &&
      selectedSenderPhones.length === 0
    ) {
      setState('FAILED');
      setErrorMessage('Select at least one phone number or choose "Include all".');
      return;
    }

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
      setProgress(35);
      setProgressLabel('Parsing thread...');
      const parsed = buildWhatsAppImport(
        rawText,
        selectedSenderPhones,
        includeOtherParticipants
      );
      if (parsed.segments.length === 0) {
        setState('FAILED');
        setErrorMessage(parsed.warning ?? 'No usable messages found in this thread export.');
        return;
      }

      const clipId = makeId('clip-wa');
      setProgress(65);
      setProgressLabel(
        whatsAppCardOutput === 'sentence' ? 'Building sentence cards...' : 'Building word cards...'
      );

      const clip = {
        id: clipId,
        sourceLanguage: 'pt' as const,
        targetLanguage: 'en' as const,
        transcriptOriginal: parsed.transcript,
        transcriptTranslated: parsed.transcript,
        segments: parsed.segments,
        createdAt: Date.now(),
      };

      await upsertClip(clip);
      const deckId = await getSelectedDeckId();
      const generatedCards: FlashCardRecord[] =
        whatsAppCardOutput === 'sentence'
          ? clip.segments.map((segment) => ({
              id: `sentence-${clip.id}-${segment.id}`,
              deckId,
              cardType: 'sentence',
              front: segment.textOriginal,
              back: segment.textTranslated,
              sourceClipId: clip.id,
              sourceSegmentId: segment.id,
              createdAt: Date.now(),
            }))
          : buildWordCardsFromSegments(clip.segments, deckId, clip.id);
      if (generatedCards.length === 0) {
        setState('FAILED');
        setErrorMessage(
          whatsAppCardOutput === 'sentence'
            ? 'No sentence cards were created from this thread.'
            : 'No word cards were created from this thread.'
        );
        return;
      }
      await addCards(generatedCards);
      setImportedCardsCount(generatedCards.length);
      setImportWarning(parsed.warning ?? null);
      setProgress(100);
      setProgressLabel('Complete');
      setState('DONE');
      if (importDestination === 'new') {
        if (whatsAppCardOutput === 'sentence') {
          router.push({
            pathname: '/(tabs)/practice',
            params: { mode: 'sentences', clipId: clip.id },
          });
        } else {
          router.push('/(tabs)/practice');
        }
      }
    } catch (error) {
      setState('FAILED');
      const fallback = 'Could not import this WhatsApp export. Try another .txt or .zip file.';
      setErrorMessage(error instanceof Error ? error.message || fallback : fallback);
    }
  }, [
    asset,
    availableSenderPhones.length,
    importDestination,
    includeOtherParticipants,
    analyzingWhatsAppFile,
    whatsAppCardOutput,
    readWhatsAppTextAsset,
    router,
    selectedSenderPhones,
    whatsAppTextCache,
  ]);

  const startUpload = useCallback(async () => {
    if (!asset) return;
    if (importKind === 'whatsapp') {
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
            <Text style={styles.optionLabel}>Select one or more participant phone numbers</Text>
            {analyzingWhatsAppFile ? (
              <Text style={styles.helper}>Scanning chat participants...</Text>
            ) : availableSenderPhones.length === 0 ? (
              <Text style={styles.helper}>
                No phone numbers detected in this file. Use "Include all" to import the full thread.
              </Text>
            ) : (
              <View style={styles.toggleRow}>
                {availableSenderPhones.map((item) => {
                  const active = selectedSenderSet.has(item.phone);
                  return (
                    <Pressable
                      key={item.phone}
                      style={[styles.smallToggle, active && styles.smallToggleActive]}
                      onPress={() => toggleSelectedSenderPhone(item.phone)}
                    >
                      <Text style={styles.smallToggleLabel}>
                        {formatPhoneForDisplay(item.phone)} ({item.messageCount})
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
            <Text style={styles.optionLabel}>Import messages from</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.smallToggle, !includeOtherParticipants && styles.smallToggleActive]}
                onPress={() => setIncludeOtherParticipants(false)}
              >
                <Text style={styles.smallToggleLabel}>Selected numbers</Text>
              </Pressable>
              <Pressable
                style={[styles.smallToggle, includeOtherParticipants && styles.smallToggleActive]}
                onPress={() => setIncludeOtherParticipants(true)}
              >
                <Text style={styles.smallToggleLabel}>Include all</Text>
              </Pressable>
            </View>
            <Text style={styles.optionLabel}>Create cards as</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.smallToggle, whatsAppCardOutput === 'sentence' && styles.smallToggleActive]}
                onPress={() => setWhatsAppCardOutput('sentence')}
              >
                <Text style={styles.smallToggleLabel}>Sentence cards</Text>
              </Pressable>
              <Pressable
                style={[styles.smallToggle, whatsAppCardOutput === 'word' && styles.smallToggleActive]}
                onPress={() => setWhatsAppCardOutput('word')}
              >
                <Text style={styles.smallToggleLabel}>Word cards</Text>
              </Pressable>
            </View>
            {whatsAppCardOutput === 'word' && (
              <Text style={styles.helper}>
                Word cards are generated from unique words in the selected messages.
              </Text>
            )}
            <Text style={styles.optionLabel}>Add cards to</Text>
            <View style={styles.toggleRow}>
              <Pressable
                style={[styles.smallToggle, importDestination === 'current' && styles.smallToggleActive]}
                onPress={() => setImportDestination('current')}
              >
                <Text style={styles.smallToggleLabel}>Current session</Text>
              </Pressable>
              <Pressable
                style={[styles.smallToggle, importDestination === 'new' && styles.smallToggleActive]}
                onPress={() => setImportDestination('new')}
              >
                <Text style={styles.smallToggleLabel}>
                  {whatsAppCardOutput === 'sentence' ? 'New sentence session' : 'Practice tab'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}
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
        <Text style={styles.helper}>
          Created {importedCardsCount}{' '}
          {importKind === 'whatsapp' && whatsAppCardOutput === 'word' ? 'word' : 'sentence'} cards.
        </Text>
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
              setWhatsAppCardOutput('sentence');
              setIncludeOtherParticipants(false);
              setWhatsAppTextCache(null);
              setAvailableSenderPhones([]);
              setSelectedSenderPhones([]);
              setAnalyzingWhatsAppFile(false);
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
          setWhatsAppCardOutput('sentence');
          setIncludeOtherParticipants(false);
          setWhatsAppTextCache(null);
          setAvailableSenderPhones([]);
          setSelectedSenderPhones([]);
          setAnalyzingWhatsAppFile(false);
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
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  whatsAppOptions: {
    width: '100%',
    gap: 8,
    marginTop: 4,
  },
  optionLabel: {
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
  progressTrack: {
    width: '100%',
    maxWidth: 360,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.stroke,
    backgroundColor: 'rgba(255,255,255,0.08)',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  secondaryLabel: {
    color: theme.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
});
