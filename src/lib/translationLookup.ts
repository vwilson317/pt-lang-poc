import {
  buildEnglishLexiconSeedRows,
  buildPortugueseLexiconSeedRows,
  getTranslationMappingKey,
  type LexiconLanguage,
  type TranslationMappingRow,
  type UserCacheRow,
} from './lexiconSchema';

export type TranslationLookupHit = {
  translation: string;
  provider: 'db_cache' | 'db_mapping' | 'seed_mapping' | 'fallback';
  mappingKey?: string;
};

export type TranslationLookupDb = {
  getUserCache(args: {
    sourceLanguage: LexiconLanguage;
    targetLanguage: LexiconLanguage;
    token: string;
  }): Promise<UserCacheRow | null>;
  getTranslationMapping(args: {
    sourceLanguage: LexiconLanguage;
    targetLanguage: LexiconLanguage;
    sourceToken: string;
  }): Promise<TranslationMappingRow | null>;
  putUserCache(row: UserCacheRow): Promise<void>;
};

export type TranslationLookupService = {
  lookup(args: {
    sourceLanguage: LexiconLanguage;
    targetLanguage: LexiconLanguage;
    token: string;
    fallbackTranslation?: string;
  }): Promise<TranslationLookupHit>;
};

let seedBySourceKey: Map<string, TranslationMappingRow> | null = null;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isLikelyUntranslatedEcho(sourceToken: string, translation: string): boolean {
  return normalizeToken(sourceToken) === normalizeToken(translation);
}

function buildSourceLookupKey(
  sourceLanguage: LexiconLanguage,
  targetLanguage: LexiconLanguage,
  sourceToken: string
): string {
  return `${sourceLanguage}:${sourceToken}=>${targetLanguage}`;
}

function getSeedMappingsBySourceKey(): Map<string, TranslationMappingRow> {
  if (seedBySourceKey) return seedBySourceKey;
  const enRows = buildEnglishLexiconSeedRows().translationMappings;
  const ptRows = buildPortugueseLexiconSeedRows().translationMappings;
  const allRows = [...enRows, ...ptRows];
  const byKey = new Map<string, TranslationMappingRow>();
  for (const row of allRows) {
    const sourceToken = normalizeToken(row.sourceToken);
    const key = buildSourceLookupKey(row.sourceLanguage, row.targetLanguage, sourceToken);
    if (!sourceToken || byKey.has(key)) continue;
    byKey.set(key, row);
  }
  seedBySourceKey = byKey;
  return byKey;
}

export function createTranslationLookupService(db?: TranslationLookupDb): TranslationLookupService {
  return {
    async lookup({
      sourceLanguage,
      targetLanguage,
      token,
      fallbackTranslation,
    }): Promise<TranslationLookupHit> {
      const sourceToken = normalizeToken(token);
      const normalizedFallback = normalizeToken(fallbackTranslation || '');
      if (!sourceToken) {
        return { translation: fallbackTranslation?.trim() || token, provider: 'fallback' };
      }

      if (db) {
        const mapped = await db.getTranslationMapping({
          sourceLanguage,
          targetLanguage,
          sourceToken,
        });
        if (mapped?.targetText) {
          await db.putUserCache({
            sourceLanguage,
            targetLanguage,
            token: sourceToken,
            translation: mapped.targetText,
            mappingKey: mapped.mappingKey,
            updatedAtMs: Date.now(),
          });
          return {
            translation: mapped.targetText,
            mappingKey: mapped.mappingKey,
            provider: 'db_mapping',
          };
        }

        const cached = await db.getUserCache({
          sourceLanguage,
          targetLanguage,
          token: sourceToken,
        });
        if (cached?.translation) {
          const staleEcho =
            isLikelyUntranslatedEcho(sourceToken, cached.translation) &&
            normalizedFallback.length > 0 &&
            !isLikelyUntranslatedEcho(sourceToken, normalizedFallback);
          if (staleEcho) {
            await db.putUserCache({
              sourceLanguage,
              targetLanguage,
              token: sourceToken,
              translation: normalizedFallback,
              updatedAtMs: Date.now(),
            });
            return {
              translation: normalizedFallback,
              provider: 'fallback',
            };
          }
          return {
            translation: cached.translation,
            mappingKey: cached.mappingKey,
            provider: 'db_cache',
          };
        }
      }

      const seedKey = buildSourceLookupKey(sourceLanguage, targetLanguage, sourceToken);
      const seedRow = getSeedMappingsBySourceKey().get(seedKey);
      if (seedRow?.targetText) {
        const mappingKey = seedRow.mappingKey
          || getTranslationMappingKey(
            sourceLanguage,
            sourceToken,
            targetLanguage,
            seedRow.targetText
          );
        if (db) {
          await db.putUserCache({
            sourceLanguage,
            targetLanguage,
            token: sourceToken,
            translation: seedRow.targetText,
            mappingKey,
            updatedAtMs: Date.now(),
          });
        }
        return {
          translation: seedRow.targetText,
          mappingKey,
          provider: 'seed_mapping',
        };
      }

      const fallback = normalizedFallback || sourceToken;
      return {
        translation: fallback,
        provider: 'fallback',
      };
    },
  };
}
