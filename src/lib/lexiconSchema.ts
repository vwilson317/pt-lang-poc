import {
  EN_LEXICON_CONTRACTIONS,
  EN_LEXICON_FAMILIES,
  EN_LEXICON_MWES,
} from '../data/enLexiconSeed';
import {
  PT_LEXICON_CONTRACTIONS,
  PT_LEXICON_FAMILIES,
  PT_LEXICON_MWES,
} from '../data/ptLexiconSeed';
import { getWordsForLanguage } from '../data/words';

export type WordFamilyRow = {
  familyKey: string;
  headword: string;
};

export type FamilyMemberRow = {
  familyKey: string;
  memberForm: string;
};

export type MweRow = {
  expression: string;
};

export type ContractionRow = {
  contraction: string;
  expansion: string;
};

export type UserCacheRow = {
  sourceLanguage: LexiconLanguage;
  targetLanguage: LexiconLanguage;
  token: string;
  translation: string;
  mappingKey?: string;
  updatedAtMs: number;
};

export type TranslationMappingRow = {
  mappingKey: string;
  sourceLanguage: LexiconLanguage;
  targetLanguage: LexiconLanguage;
  sourceToken: string;
  targetText: string;
  sourceFamilyKey?: string;
  targetFamilyKey?: string;
};

export type LexiconSeedRows = {
  wordFamilies: WordFamilyRow[];
  familyMembers: FamilyMemberRow[];
  mwes: MweRow[];
  contractions: ContractionRow[];
  translationMappings: TranslationMappingRow[];
};

export type LexiconLanguage = 'en' | 'pt';

export const DEXIE_LEXICON_SCHEMA_V1: Record<string, string> = {
  wordFamilies: '&familyKey, headword',
  familyMembers: '[familyKey+memberForm], familyKey, memberForm',
  mwes: '&expression',
  contractions: '[contraction+expansion], contraction, expansion',
  translationMappings:
    '&mappingKey, [sourceLanguage+sourceToken+targetLanguage], sourceFamilyKey, targetFamilyKey',
  userCache: '&[sourceLanguage+targetLanguage+token], mappingKey, updatedAtMs',
};

export const SQLITE_LEXICON_SCHEMA_V1: string[] = [
  `CREATE TABLE IF NOT EXISTS WordFamilies (
    family_key TEXT PRIMARY KEY NOT NULL,
    headword TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS FamilyMembers (
    family_key TEXT NOT NULL,
    member_form TEXT NOT NULL,
    PRIMARY KEY (family_key, member_form),
    FOREIGN KEY (family_key) REFERENCES WordFamilies(family_key) ON DELETE CASCADE
  );`,
  `CREATE INDEX IF NOT EXISTS idx_family_members_member_form
    ON FamilyMembers(member_form);`,
  `CREATE TABLE IF NOT EXISTS MWEs (
    expression TEXT PRIMARY KEY NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS Contractions (
    contraction TEXT NOT NULL,
    expansion TEXT NOT NULL,
    PRIMARY KEY (contraction, expansion)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_contractions_contraction
    ON Contractions(contraction);`,
  `CREATE TABLE IF NOT EXISTS TranslationMappings (
    mapping_key TEXT PRIMARY KEY NOT NULL,
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    source_token TEXT NOT NULL,
    target_text TEXT NOT NULL,
    source_family_key TEXT,
    target_family_key TEXT
  );`,
  `CREATE INDEX IF NOT EXISTS idx_translation_mappings_source_lookup
    ON TranslationMappings(source_language, source_token, target_language);`,
  `CREATE INDEX IF NOT EXISTS idx_translation_mappings_source_family
    ON TranslationMappings(source_family_key);`,
  `CREATE INDEX IF NOT EXISTS idx_translation_mappings_target_family
    ON TranslationMappings(target_family_key);`,
  `CREATE TABLE IF NOT EXISTS UserCache (
    source_language TEXT NOT NULL,
    target_language TEXT NOT NULL,
    token TEXT NOT NULL,
    translation TEXT NOT NULL,
    mapping_key TEXT,
    PRIMARY KEY (source_language, target_language, token),
    FOREIGN KEY (mapping_key) REFERENCES TranslationMappings(mapping_key) ON DELETE SET NULL,
    updated_at_ms INTEGER NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_user_cache_mapping_key
    ON UserCache(mapping_key);`,
];

export function buildEnglishLexiconSeedRows(): LexiconSeedRows {
  return buildLexiconSeedRowsFromRaw(
    'en',
    EN_LEXICON_FAMILIES,
    EN_LEXICON_MWES,
    EN_LEXICON_CONTRACTIONS
  );
}

export function buildPortugueseLexiconSeedRows(): LexiconSeedRows {
  return buildLexiconSeedRowsFromRaw(
    'pt',
    PT_LEXICON_FAMILIES,
    PT_LEXICON_MWES,
    PT_LEXICON_CONTRACTIONS
  );
}

export function buildLexiconSeedRows(language: LexiconLanguage): LexiconSeedRows {
  if (language === 'pt') return buildPortugueseLexiconSeedRows();
  return buildEnglishLexiconSeedRows();
}

function buildLexiconSeedRowsFromRaw(
  language: LexiconLanguage,
  families: { familyKey: string; headword: string; members: string[] }[],
  mwesRaw: string[],
  contractionsRaw: { contraction: string; expansions: string[] }[]
): LexiconSeedRows {
  const wordFamilies: WordFamilyRow[] = [];
  const familyMembers: FamilyMemberRow[] = [];
  const mwes: MweRow[] = mwesRaw.map((expression) => ({ expression }));
  const contractions: ContractionRow[] = [];
  const translationMappings = buildBidirectionalPtEnTranslationMappingsSeedRows().filter((row) =>
    row.sourceLanguage === language
  );

  for (const family of families) {
    wordFamilies.push({
      familyKey: family.familyKey,
      headword: family.headword,
    });
    for (const member of family.members) {
      familyMembers.push({
        familyKey: family.familyKey,
        memberForm: member,
      });
    }
  }

  for (const row of contractionsRaw) {
    for (const expansion of row.expansions) {
      contractions.push({
        contraction: row.contraction,
        expansion,
      });
    }
  }

  return {
    wordFamilies,
    familyMembers,
    mwes,
    contractions,
    translationMappings,
  };
}

function buildBidirectionalPtEnTranslationMappingsSeedRows(): TranslationMappingRow[] {
  const words = getWordsForLanguage('pt');
  const ptFamilyByMember = buildMemberToFamilyMap(PT_LEXICON_FAMILIES);
  const enFamilyByMember = buildMemberToFamilyMap(EN_LEXICON_FAMILIES);
  const rowsByKey = new Map<string, TranslationMappingRow>();

  for (const word of words) {
    const rawPt = normalizeToken(word.term);
    const rawEn = normalizeEnglishTarget(word.en);
    if (!rawPt || !rawEn) continue;

    const ptToEn = toTranslationMapping({
      sourceLanguage: 'pt',
      targetLanguage: 'en',
      sourceToken: rawPt,
      targetText: rawEn,
      sourceFamilyByMember: ptFamilyByMember,
      targetFamilyByMember: enFamilyByMember,
    });
    rowsByKey.set(ptToEn.mappingKey, ptToEn);

    const enToPt = toTranslationMapping({
      sourceLanguage: 'en',
      targetLanguage: 'pt',
      sourceToken: rawEn,
      targetText: rawPt,
      sourceFamilyByMember: enFamilyByMember,
      targetFamilyByMember: ptFamilyByMember,
    });
    rowsByKey.set(enToPt.mappingKey, enToPt);
  }

  return Array.from(rowsByKey.values());
}

function buildMemberToFamilyMap(
  families: { familyKey: string; headword: string; members: string[] }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const family of families) {
    const familyKey = normalizeToken(family.familyKey);
    if (!familyKey) continue;
    const headword = normalizeToken(family.headword);
    if (headword && !out.has(headword)) out.set(headword, familyKey);
    for (const member of family.members) {
      const key = normalizeToken(member);
      if (!key || out.has(key)) continue;
      out.set(key, familyKey);
    }
  }
  return out;
}

function normalizeToken(value: string | undefined): string {
  if (!value) return '';
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function normalizeEnglishTarget(value: string | undefined): string {
  const normalized = normalizeToken(value);
  if (!normalized) return '';
  const withoutParens = normalized.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  if (!withoutParens) return '';
  const candidates = withoutParens
    .split(/[\/|,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (candidates.length > 0) return candidates[0];
  const orParts = withoutParens
    .split(/\s+or\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (orParts.length > 0) return orParts[0];
  return withoutParens;
}

function toTranslationMapping(args: {
  sourceLanguage: LexiconLanguage;
  targetLanguage: LexiconLanguage;
  sourceToken: string;
  targetText: string;
  sourceFamilyByMember: Map<string, string>;
  targetFamilyByMember: Map<string, string>;
}): TranslationMappingRow {
  const sourceToken = normalizeToken(args.sourceToken);
  const targetText = normalizeToken(args.targetText);
  return {
    mappingKey: buildMappingKey(args.sourceLanguage, sourceToken, args.targetLanguage, targetText),
    sourceLanguage: args.sourceLanguage,
    targetLanguage: args.targetLanguage,
    sourceToken,
    targetText,
    sourceFamilyKey: args.sourceFamilyByMember.get(sourceToken),
    targetFamilyKey: args.targetFamilyByMember.get(targetText),
  };
}

function buildMappingKey(
  sourceLanguage: LexiconLanguage,
  sourceToken: string,
  targetLanguage: LexiconLanguage,
  targetText: string
): string {
  return `${sourceLanguage}:${sourceToken}=>${targetLanguage}:${targetText}`;
}

export function getTranslationMappingKey(
  sourceLanguage: LexiconLanguage,
  sourceToken: string,
  targetLanguage: LexiconLanguage,
  targetText: string
): string {
  return buildMappingKey(
    sourceLanguage,
    normalizeToken(sourceToken),
    targetLanguage,
    normalizeToken(targetText)
  );
}
