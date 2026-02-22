export const PRACTICE_LANGUAGES = ['pt', 'fr'] as const;

export type PracticeLanguage = (typeof PRACTICE_LANGUAGES)[number];

export function isPracticeLanguage(value: string): value is PracticeLanguage {
  return PRACTICE_LANGUAGES.includes(value as PracticeLanguage);
}

export function getPracticeLanguageLabel(language: PracticeLanguage): string {
  return language === 'fr' ? 'French' : 'Portuguese';
}
