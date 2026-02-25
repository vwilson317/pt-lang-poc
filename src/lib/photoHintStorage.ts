import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import type { CardPhotoHint } from '../types/v11';

const IDB_DB_NAME = 'pt-lang-photo-hints-v1';
const IDB_STORE_NAME = 'photo-blobs';
const IDB_URI_PREFIX = 'idb://';
const NATIVE_DIR = `${FileSystem.documentDirectory ?? ''}photo-hints`;

type PickerAsset = DocumentPicker.DocumentPickerAsset & { file?: File };

function normalizeExt(value?: string): string {
  if (!value) return 'jpg';
  return value.replace(/^\./, '').trim().toLocaleLowerCase() || 'jpg';
}

function extFromAsset(asset: PickerAsset): string {
  const fromName = asset.name?.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (fromName) return normalizeExt(fromName);
  const fromMime = asset.mimeType?.split('/')[1];
  if (fromMime) return normalizeExt(fromMime);
  return 'jpg';
}

function cardPhotoFileName(cardId: string, ext: string): string {
  const safeId = cardId.replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `${safeId}-${Date.now()}.${ext}`;
}

function isIdbUri(uri: string): boolean {
  return uri.startsWith(IDB_URI_PREFIX);
}

function idbKeyFromUri(uri: string): string | null {
  if (!isIdbUri(uri)) return null;
  const key = uri.slice(IDB_URI_PREFIX.length);
  return key || null;
}

function idbUriFromKey(key: string): string {
  return `${IDB_URI_PREFIX}${key}`;
}

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
        db.createObjectStore(IDB_STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

async function putBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    store.put(blob, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to store image blob'));
    tx.onabort = () => reject(tx.error ?? new Error('Failed to store image blob'));
  });
  db.close();
}

async function getBlob(key: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
    const store = tx.objectStore(IDB_STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('Failed to read image blob'));
  });
  db.close();
  return blob;
}

async function deleteBlob(key: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
    const store = tx.objectStore(IDB_STORE_NAME);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to delete image blob'));
    tx.onabort = () => reject(tx.error ?? new Error('Failed to delete image blob'));
  });
  db.close();
}

async function pickImageAsset(): Promise<PickerAsset | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = (result.assets?.[0] as PickerAsset | undefined) ?? null;
  if (!asset?.uri) return null;
  return asset;
}

export async function pickAndStorePhotoHint(cardId: string): Promise<CardPhotoHint | null> {
  const asset = await pickImageAsset();
  if (!asset) return null;
  const ext = extFromAsset(asset);

  if (Platform.OS === 'web') {
    const key = cardPhotoFileName(cardId, ext);
    const blobCandidate = asset.file ?? (await fetch(asset.uri).then((response) => response.blob()));
    if (!(blobCandidate instanceof Blob)) {
      throw new Error('Could not read selected image blob.');
    }
    const blob = blobCandidate;
    await putBlob(key, blob);
    return {
      uri: idbUriFromKey(key),
      ext,
      addedAt: Date.now(),
    };
  }

  if (!FileSystem.documentDirectory) {
    return {
      uri: asset.uri,
      ext,
      addedAt: Date.now(),
    };
  }

  const dirInfo = await FileSystem.getInfoAsync(NATIVE_DIR);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(NATIVE_DIR, { intermediates: true });
  }
  const to = `${NATIVE_DIR}/${cardPhotoFileName(cardId, ext)}`;
  await FileSystem.copyAsync({ from: asset.uri, to });
  return {
    uri: to,
    ext,
    addedAt: Date.now(),
  };
}

export async function resolvePhotoHintDisplayUri(photo: CardPhotoHint): Promise<string | null> {
  if (Platform.OS !== 'web' || !isIdbUri(photo.uri)) return photo.uri;
  const key = idbKeyFromUri(photo.uri);
  if (!key) return null;
  const blob = await getBlob(key);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export function releasePhotoHintDisplayUri(uri: string | null): void {
  if (!uri) return;
  if (Platform.OS !== 'web') return;
  if (!uri.startsWith('blob:')) return;
  URL.revokeObjectURL(uri);
}

export async function deleteStoredPhotoHint(photo?: CardPhotoHint): Promise<void> {
  if (!photo?.uri) return;
  if (Platform.OS === 'web' && isIdbUri(photo.uri)) {
    const key = idbKeyFromUri(photo.uri);
    if (!key) return;
    await deleteBlob(key);
    return;
  }

  try {
    await FileSystem.deleteAsync(photo.uri, { idempotent: true });
  } catch {
    // Ignore clean-up failures.
  }
}
