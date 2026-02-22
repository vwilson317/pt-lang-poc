import type { PracticeLanguage } from '../types/practiceLanguage';

export type BuiltInPhrase = {
  id: string;
  en: string;
  pt: string;
  fr: string;
};

export const BUILT_IN_PHRASES: BuiltInPhrase[] = [
  {
    id: 'recommend-eat-here',
    en: 'What do you recommend to eat here?',
    pt: 'O que voce recomenda comer aqui?',
    fr: "Qu'est-ce que vous recommandez de manger ici ?",
  },
  {
    id: 'highlight-of-visit',
    en: 'What is a highlight of your visit?',
    pt: 'Qual e um ponto alto da sua visita?',
    fr: 'Quel est un moment fort de votre visite ?',
  },
  {
    id: 'biggest-fear',
    en: 'What would you say is your biggest fear?',
    pt: 'O que voce diria que e o seu maior medo?',
    fr: 'Que diriez-vous etre votre plus grande peur ?',
  },
  {
    id: 'stay-in-brazil',
    en: 'How long do you plan to stay in Brazil?',
    pt: 'Quanto tempo voce planeja ficar no Brasil?',
    fr: 'Combien de temps prevoyez-vous de rester au Bresil ?',
  },
  {
    id: 'about-yourself',
    en: 'Tell me a little about yourself.',
    pt: 'Fale um pouco sobre voce.',
    fr: 'Parlez-moi un peu de vous.',
  },
  {
    id: 'what-brings-you-here',
    en: 'What brings you here?',
    pt: 'O que traz voce aqui?',
    fr: "Qu'est-ce qui vous amene ici ?",
  },
];

const BUILT_IN_PHRASES_BY_ID = BUILT_IN_PHRASES.reduce<Record<string, BuiltInPhrase>>(
  (acc, phrase) => {
    acc[phrase.id] = phrase;
    return acc;
  },
  {}
);

export function getBuiltInPhraseById(id: string): BuiltInPhrase | undefined {
  return BUILT_IN_PHRASES_BY_ID[id];
}

export function getPhrasePrompt(phrase: BuiltInPhrase, language: PracticeLanguage): string {
  return language === 'fr' ? phrase.fr : phrase.pt;
}
