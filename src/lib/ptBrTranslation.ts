import { getWordsForLanguage } from '../data/words';
import type { ClipToken } from '../types/v11';

type WordToken = {
  raw: string;
  norm: string;
};

type PhraseCandidate = {
  start: number;
  end: number;
  normPhrase: string;
};

type PhraseHit = {
  start: number;
  end: number;
  normPhrase: string;
  translation: string;
  provider: 'local';
  score: number;
};

const MAX_PHRASE_LEN = 5;
const PTBR_WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ']+/g;

const LOCAL_PHRASE_SEED: Record<string, string> = {
  'tudo bem': 'how are you',
  beleza: 'all good',
  tranquilo: 'all good',
  demorou: 'sounds good',
  'pode deixar': "leave it with me",
  fechou: 'deal',
  'faz sentido': 'makes sense',
  'to chegando': "i'm on my way",
  'ja ja': 'in a bit',
  bora: "let's go",
  vamo: "let's go",
  vamos: "let's go",
  'de boa': 'chill',
  'na moral': 'for real',
  'nao ha de que': "you're welcome",
  imagina: 'no worries',
  'de nada': "you're welcome",
  'por nada': "you are welcome",
  valeu: 'thanks',
  obrigado: 'thank you',
  obrigada: 'thank you',
  combinado: 'deal',
  'mais tarde': 'later',
  'hoje a noite': 'tonight',
  'que horas': 'what time',
  'onde fica': 'where is',
  'dar certo': 'work out',
  'dar errado': 'go wrong',
  'ficar de boa': 'chill out',
  'ficar com': 'be with',
  'tem como': 'is it possible',
};

const phraseCache = new Map<string, string>();
const singleWordPhraseCache = new Map<string, string>();

const wordCache = new Map<string, string>();

function normalizePtBr(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeEnglishForGuess(value: string): string {
  const cleaned = value
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+or\s+/gi, '/')
    .trim();
  const parts = cleaned
    .split(/[\/|,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return cleaned || value;
  return parts[0];
}

function ensurePhraseCache(): void {
  if (phraseCache.size > 0) return;
  for (const [rawPhrase, translation] of Object.entries(LOCAL_PHRASE_SEED)) {
    const normalizedPhrase = normalizePtBr(rawPhrase);
    if (!normalizedPhrase) continue;
    const key = `p:ptbr:${normalizedPhrase}`;
    if (!phraseCache.has(key)) phraseCache.set(key, translation);
    if (!normalizedPhrase.includes(' ') && !singleWordPhraseCache.has(normalizedPhrase)) {
      singleWordPhraseCache.set(normalizedPhrase, translation);
    }
  }
}

function ensureWordCache(): void {
  if (wordCache.size > 0) return;
  for (const word of getWordsForLanguage('pt')) {
    if (!word.term || !word.en) continue;
    const key = `w:ptbr:${normalizePtBr(word.term)}`;
    if (wordCache.has(key)) continue;
    wordCache.set(key, normalizeEnglishForGuess(word.en));
  }
}

function tokenizeMessage(message: string): WordToken[] {
  return (message.match(PTBR_WORD_RE) ?? [])
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => ({ raw, norm: normalizePtBr(raw) }))
    .filter((token) => token.norm.length > 0);
}

function phraseCandidates(
  words: WordToken[],
  tappedWordPos: number,
  maxLen = MAX_PHRASE_LEN
): PhraseCandidate[] {
  const out: PhraseCandidate[] = [];
  for (let len = 2; len <= maxLen; len += 1) {
    for (let start = tappedWordPos - (len - 1); start <= tappedWordPos; start += 1) {
      const end = start + len - 1;
      if (start < 0 || end >= words.length) continue;
      if (!(start <= tappedWordPos && tappedWordPos <= end)) continue;
      out.push({
        start,
        end,
        normPhrase: words.slice(start, end + 1).map((word) => word.norm).join(' '),
      });
    }
  }
  out.sort((left, right) => (right.end - right.start) - (left.end - left.start));
  return out;
}

function resolveBestPhrase(candidates: PhraseCandidate[]): PhraseHit | null {
  ensurePhraseCache();
  for (const candidate of candidates) {
    const cacheKey = `p:ptbr:${candidate.normPhrase}`;
    const cached = phraseCache.get(cacheKey);
    if (!cached) continue;
    const len = candidate.end - candidate.start + 1;
    const score = 100 + len * 10 + 20;
    return {
      ...candidate,
      translation: cached,
      provider: 'local',
      score,
    };
  }
  return null;
}

function getWordTranslation(normWord: string, rawWord: string): string {
  ensurePhraseCache();
  const phraseWord = singleWordPhraseCache.get(normWord);
  if (phraseWord) return phraseWord;
  ensureWordCache();
  return wordCache.get(`w:ptbr:${normWord}`) ?? rawWord.toLocaleLowerCase();
}

export type PhraseEscalationResult = {
  textTranslated: string;
  tokens: ClipToken[];
};

export function translatePtBrMessageWithPhraseEscalation(message: string): PhraseEscalationResult {
  const words = tokenizeMessage(message);
  if (words.length === 0) {
    return {
      textTranslated: message,
      tokens: [],
    };
  }

  const translationByIndex: Record<number, string> = {};
  const phraseStarts = new Map<number, PhraseHit>();
  const phraseCovered = new Set<number>();

  for (let position = 0; position < words.length; position += 1) {
    const hit = resolveBestPhrase(phraseCandidates(words, position));
    if (!hit) continue;
    const hasOverlap = Array.from({ length: hit.end - hit.start + 1 }).some((_, offset) =>
      phraseCovered.has(hit.start + offset)
    );
    if (hasOverlap) continue;
    phraseStarts.set(hit.start, hit);
    for (let idx = hit.start; idx <= hit.end; idx += 1) {
      phraseCovered.add(idx);
      translationByIndex[idx] = hit.translation;
    }
  }

  for (let index = 0; index < words.length; index += 1) {
    if (translationByIndex[index]) continue;
    translationByIndex[index] = getWordTranslation(words[index].norm, words[index].raw);
  }

  const translatedParts: string[] = [];
  for (let index = 0; index < words.length; index += 1) {
    const phraseAtIndex = phraseStarts.get(index);
    if (phraseAtIndex) {
      translatedParts.push(phraseAtIndex.translation);
      index = phraseAtIndex.end;
      continue;
    }
    translatedParts.push(translationByIndex[index]);
  }

  const tokens: ClipToken[] = words.map((word, index) => ({
    text: word.raw.toLocaleLowerCase(),
    translation: translationByIndex[index],
  }));

  return {
    textTranslated: translatedParts.join(' '),
    tokens,
  };
}
