import type { PracticeLanguage } from '../types/practiceLanguage';
import { getPracticeLanguageLabel } from '../types/practiceLanguage';

export type AiTone = 'casual' | 'neutral' | 'formal' | 'flirty' | 'business';
export type AiDifficulty = 'easy' | 'standard' | 'stretch';
export type AiMix = 'balanced' | 'vocabulary_heavy' | 'conversation_heavy';

export type AiBuilderConfig = {
  targetLanguage: PracticeLanguage;
  nativeLanguage: string;
  themes: string[];
  customTheme?: string;
  intent?: string;
  tone: AiTone;
  difficulty: AiDifficulty;
  mix: AiMix;
  touched: boolean;
};

export type AiBuilderDerived = {
  preview: string;
  compiledPrompt: string;
  copyEnabled: boolean;
  phraseCount: number;
  wordCount: number;
  a1Count: number;
  a2Count: number;
};

const PREVIEW_CHAR_LIMIT = 90;
const APPROVED_TAGS = ['everyday', 'travel', 'work', 'dating', 'gym', 'small-talk', 'custom'];

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function sanitizeText(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function humanJoin(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

function normalizeTheme(theme: string): string {
  const cleaned = sanitizeText(theme) ?? '';
  if (!cleaned) return '';
  if (/^(at|for|while)\s/i.test(cleaned)) return cleaned;
  return `for ${cleaned}`;
}

function truncatePreview(value: string): string {
  if (value.length <= PREVIEW_CHAR_LIMIT) return value;
  return `${value.slice(0, PREVIEW_CHAR_LIMIT - 1).trimEnd()}…`;
}

function calculateSplit(total: number, ratio: number): [number, number] {
  const primary = Math.round(total * ratio);
  const clampedPrimary = Math.max(0, Math.min(total, primary));
  return [clampedPrimary, total - clampedPrimary];
}

function getDifficultyRatios(difficulty: AiDifficulty, total: number): [number, number] {
  if (total < 20) return [total, 0];
  if (difficulty === 'easy') return calculateSplit(total, 0.9);
  if (difficulty === 'stretch') return calculateSplit(total, 0.6);
  return calculateSplit(total, 0.8);
}

function getWordPhraseRatios(
  mix: AiMix,
  total: number,
  sessionMode: 'words' | 'phrases'
): [number, number] {
  if (total < 20) return [Math.round(total * 0.5), total - Math.round(total * 0.5)];
  if (sessionMode === 'phrases') return [total, 0];
  if (mix === 'conversation_heavy') return calculateSplit(total, 0.7);
  if (mix === 'vocabulary_heavy') return calculateSplit(total, 0.5);
  return calculateSplit(total, 0.6);
}

export function createDefaultAiBuilderConfig(language: PracticeLanguage): AiBuilderConfig {
  return {
    targetLanguage: language,
    nativeLanguage: 'English',
    themes: [],
    customTheme: undefined,
    intent: undefined,
    tone: 'neutral',
    difficulty: 'standard',
    mix: 'balanced',
    touched: false,
  };
}

export function buildAiPrompt(
  cardCount: number,
  config: AiBuilderConfig,
  sessionMode: 'words' | 'phrases'
): AiBuilderDerived {
  const total = clampNonNegative(cardCount);
  const languageLabel = getPracticeLanguageLabel(config.targetLanguage);
  const normalizedThemes = config.themes.map(normalizeTheme).filter(Boolean).slice(0, 3);
  const customTheme = sanitizeText(config.customTheme);
  const intent = sanitizeText(config.intent);
  const allThemes = customTheme ? [...normalizedThemes, normalizeTheme(customTheme)] : normalizedThemes;
  const themePhrase = allThemes.length > 0 ? humanJoin(allThemes) : `everyday ${languageLabel} practice`;

  const basePreview = `${total} cards for practicing ${languageLabel} ${themePhrase}`;
  const previewWithIntent = intent ? `${basePreview} — ${intent}` : basePreview;
  const preview = truncatePreview(previewWithIntent);

  const [phraseCount, wordCount] = getWordPhraseRatios(config.mix, total, sessionMode);
  const [a1Count, a2Count] = getDifficultyRatios(config.difficulty, total);

  const strictRules = [
    'Output EXACTLY one flashcard per line.',
    'No numbering, no blank lines, and no duplicate front text.',
    'Use this metadata format at the end of each line: ||type=<word|phrase>;level=<A1|A2>;tone=<tone>;tag=<approved-tag>.',
    `Approved tags only: ${APPROVED_TAGS.join(', ')}.`,
  ];

  const instructions = [
    `Create EXACTLY ${total} flashcards for learning ${languageLabel}.`,
    `Learner native language: ${config.nativeLanguage}.`,
    `Theme focus: ${allThemes.length > 0 ? humanJoin(allThemes) : 'everyday speaking contexts'}.`,
    intent ? `User intent: ${intent}.` : undefined,
    `Tone: ${config.tone}.`,
    `Difficulty split: ${a1Count} A1 cards and ${a2Count} A2 cards.`,
    `Card mix: ${phraseCount} phrase/sentence cards and ${wordCount} single-word cards.`,
    'Keep content beginner-friendly and practical for real daily conversation.',
    ...strictRules,
    'Format each line as: FRONT | BACK_TRANSLATION | BACK_HINT ||metadata.',
  ].filter((line): line is string => Boolean(line));

  return {
    preview: config.touched ? preview : 'Generate AI flashcards for a custom topic',
    compiledPrompt: instructions.join('\n'),
    copyEnabled: config.touched || allThemes.length > 0 || Boolean(intent),
    phraseCount,
    wordCount,
    a1Count,
    a2Count,
  };
}
