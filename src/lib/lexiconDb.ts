import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildEnglishLexiconSeedRows,
  buildPortugueseLexiconSeedRows,
  type LexiconLanguage,
  type TranslationMappingRow,
  type UserCacheRow,
} from './lexiconSchema';
import type { TranslationLookupDb } from './translationLookup';

const KEY_DB_VERSION = 'lexiconDb:v1:version';
const KEY_TRANSLATION_MAPPINGS = 'lexiconDb:v1:translationMappingsByLookup';
const KEY_USER_CACHE = 'lexiconDb:v1:userCacheByLookup';
const DB_VERSION = 1;

type MappingLookupIndex = Record<string, TranslationMappingRow>;
type UserCacheLookupIndex = Record<string, UserCacheRow>;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function mappingLookupKey(
  sourceLanguage: LexiconLanguage,
  targetLanguage: LexiconLanguage,
  sourceToken: string
): string {
  return `${sourceLanguage}:${normalizeToken(sourceToken)}=>${targetLanguage}`;
}

function cacheLookupKey(
  sourceLanguage: LexiconLanguage,
  targetLanguage: LexiconLanguage,
  token: string
): string {
  return `${sourceLanguage}:${targetLanguage}:${normalizeToken(token)}`;
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function buildSeedMappingsIndex(): MappingLookupIndex {
  const byLookup: MappingLookupIndex = {};
  const allRows = [
    ...buildEnglishLexiconSeedRows().translationMappings,
    ...buildPortugueseLexiconSeedRows().translationMappings,
  ];
  for (const row of allRows) {
    const lookup = mappingLookupKey(row.sourceLanguage, row.targetLanguage, row.sourceToken);
    if (byLookup[lookup]) continue;
    byLookup[lookup] = row;
  }
  return byLookup;
}

class AsyncStorageTranslationDb implements TranslationLookupDb {
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private mappingsByLookup: MappingLookupIndex = {};
  private userCacheByLookup: UserCacheLookupIndex = {};

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.initialize();
    await this.initPromise;
    this.initialized = true;
    this.initPromise = null;
  }

  async init(): Promise<void> {
    await this.ensureInitialized();
  }

  private async initialize(): Promise<void> {
    const versionRaw = await AsyncStorage.getItem(KEY_DB_VERSION);
    const version = versionRaw ? parseInt(versionRaw, 10) : 0;
    const cachedUserIndex = await readJson<UserCacheLookupIndex>(KEY_USER_CACHE, {});

    if (version !== DB_VERSION) {
      this.mappingsByLookup = buildSeedMappingsIndex();
      this.userCacheByLookup = cachedUserIndex;
      await writeJson(KEY_TRANSLATION_MAPPINGS, this.mappingsByLookup);
      await writeJson(KEY_USER_CACHE, this.userCacheByLookup);
      await AsyncStorage.setItem(KEY_DB_VERSION, String(DB_VERSION));
      return;
    }

    this.mappingsByLookup = await readJson<MappingLookupIndex>(
      KEY_TRANSLATION_MAPPINGS,
      buildSeedMappingsIndex()
    );
    this.userCacheByLookup = cachedUserIndex;
  }

  async getUserCache(args: {
    sourceLanguage: LexiconLanguage;
    targetLanguage: LexiconLanguage;
    token: string;
  }): Promise<UserCacheRow | null> {
    await this.ensureInitialized();
    const key = cacheLookupKey(args.sourceLanguage, args.targetLanguage, args.token);
    return this.userCacheByLookup[key] ?? null;
  }

  async getTranslationMapping(args: {
    sourceLanguage: LexiconLanguage;
    targetLanguage: LexiconLanguage;
    sourceToken: string;
  }): Promise<TranslationMappingRow | null> {
    await this.ensureInitialized();
    const key = mappingLookupKey(args.sourceLanguage, args.targetLanguage, args.sourceToken);
    return this.mappingsByLookup[key] ?? null;
  }

  async putUserCache(row: UserCacheRow): Promise<void> {
    await this.ensureInitialized();
    const key = cacheLookupKey(row.sourceLanguage, row.targetLanguage, row.token);
    this.userCacheByLookup[key] = {
      ...row,
      token: normalizeToken(row.token),
    };
    await writeJson(KEY_USER_CACHE, this.userCacheByLookup);
  }
}

let singletonDb: TranslationLookupDb | null = null;

export async function ensureLexiconDbInitialized(): Promise<void> {
  if (!singletonDb) {
    singletonDb = new AsyncStorageTranslationDb();
  }
  if (singletonDb instanceof AsyncStorageTranslationDb) {
    await singletonDb.init();
  }
}

export function getTranslationLookupDb(): TranslationLookupDb {
  if (!singletonDb) {
    singletonDb = new AsyncStorageTranslationDb();
  }
  return singletonDb;
}
