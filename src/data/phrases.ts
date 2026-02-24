import type { PracticeLanguage } from '../types/practiceLanguage';

export type BuiltInPhrase = {
  id: string;
  en: string;
  pt: string;
  fr: string;
};

export const BUILT_IN_PHRASES: BuiltInPhrase[] = [
  {
    id: 'prazer-praia',
    en: 'Nice to meet you, are you going to the beach today?',
    pt: 'Prazer, voce vai pra praia hoje?',
    fr: "Ravi de vous rencontrer, vous allez a la plage aujourd'hui ?",
  },
  {
    id: 'de-onde-rio',
    en: 'Where in Rio are you from?',
    pt: 'Voce e de qual bairro do Rio?',
    fr: 'De quel quartier de Rio venez-vous ?',
  },
  {
    id: 'moro-zona-sul',
    en: 'I am staying in Zona Sul.',
    pt: 'Eu to ficando na Zona Sul.',
    fr: 'Je reste dans la Zone Sud.',
  },
  {
    id: 'sugestao-bairro',
    en: 'Which neighborhood do you recommend for tonight?',
    pt: 'Qual bairro voce recomenda pra hoje a noite?',
    fr: 'Quel quartier recommandez-vous pour ce soir ?',
  },
  {
    id: 'vou-uber',
    en: 'I am going by Uber.',
    pt: 'Eu vou de Uber.',
    fr: 'Je vais en Uber.',
  },
  {
    id: 'melhor-hora-praia',
    en: 'What is the best time to go to the beach here?',
    pt: 'Qual o melhor horario pra ir a praia aqui?',
    fr: 'Quelle est la meilleure heure pour aller a la plage ici ?',
  },
  {
    id: 'posto-oito',
    en: 'Do you usually stay near Posto 8?',
    pt: 'Voce costuma ficar perto do Posto 8?',
    fr: "Vous restez souvent pres du Poste 8 ?",
  },
  {
    id: 'partiu-lapa',
    en: 'Are you heading to Lapa later?',
    pt: 'Voce vai pra Lapa mais tarde?',
    fr: 'Vous allez a Lapa plus tard ?',
  },
  {
    id: 'barzinho-indica',
    en: 'Can you suggest a good bar around here?',
    pt: 'Me indica um barzinho bom por aqui?',
    fr: 'Vous pouvez me conseiller un bon bar par ici ?',
  },
  {
    id: 'roda-samba',
    en: 'Is there a samba circle today?',
    pt: 'Tem roda de samba hoje?',
    fr: "Il y a une roda de samba aujourd'hui ?",
  },
  {
    id: 'forro-hoje',
    en: 'Do you know any forro party tonight?',
    pt: 'Voce conhece algum forro hoje a noite?',
    fr: 'Vous connaissez une soiree forro ce soir ?',
  },
  {
    id: 'caipirinha-forte',
    en: 'This caipirinha is strong.',
    pt: 'Essa caipirinha ta forte.',
    fr: 'Cette caipirinha est forte.',
  },
  {
    id: 'sou-gringo-rio',
    en: 'I am new here, I just arrived in Rio.',
    pt: 'Sou novo aqui, cheguei no Rio agora.',
    fr: "Je suis nouveau ici, je viens d'arriver a Rio.",
  },
  {
    id: 'falo-pouco',
    en: 'I speak a little Portuguese.',
    pt: 'Eu falo um pouco de portugues.',
    fr: 'Je parle un peu portugais.',
  },
  {
    id: 'fala-devagar',
    en: 'Can you speak slower?',
    pt: 'Pode falar mais devagar?',
    fr: 'Vous pouvez parler plus lentement ?',
  },
  {
    id: 'repete-por-favor',
    en: 'Can you repeat that, please?',
    pt: 'Pode repetir, por favor?',
    fr: 'Vous pouvez repeter, sil vous plait ?',
  },
  {
    id: 'como-teu-nome',
    en: 'What is your name?',
    pt: 'Qual e teu nome?',
    fr: 'Comment vous appelez-vous ?',
  },
  {
    id: 'meu-nome',
    en: 'My name is...',
    pt: 'Meu nome e...',
    fr: 'Je m appelle...',
  },
  {
    id: 'insta',
    en: 'Do you have Instagram?',
    pt: 'Voce tem Instagram?',
    fr: 'Vous avez Instagram ?',
  },
  {
    id: 'zap',
    en: 'Can I message you on WhatsApp?',
    pt: 'Posso te chamar no WhatsApp?',
    fr: 'Je peux vous ecrire sur WhatsApp ?',
  },
  {
    id: 'depois-praia',
    en: 'After this, are you going to the beach or to a bar?',
    pt: 'Depois daqui, voce vai pra praia ou pro bar?',
    fr: 'Apres ici, vous allez a la plage ou au bar ?',
  },
  {
    id: 'amanha-praia',
    en: 'Are you going to the beach tomorrow morning?',
    pt: 'Voce vai pra praia amanha de manha?',
    fr: 'Vous allez a la plage demain matin ?',
  },
  {
    id: 'trilha-dois-irmaos',
    en: 'Have you done the Dois Irmaos hike?',
    pt: 'Voce ja fez a trilha dos Dois Irmaos?',
    fr: 'Vous avez deja fait la rando Dois Irmaos ?',
  },
  {
    id: 'onde-ver-por-do-sol',
    en: 'Where is the best sunset in Rio?',
    pt: 'Onde e o melhor por do sol no Rio?',
    fr: 'Ou est le meilleur coucher de soleil a Rio ?',
  },
  {
    id: 'arpoador-hoje',
    en: 'Is Arpoador crowded today?',
    pt: 'Arpoador ta cheio hoje?',
    fr: "Arpoador est plein aujourd'hui ?",
  },
  {
    id: 'seguro-andar',
    en: 'Is it safe to walk there now?',
    pt: 'E tranquilo andar la agora?',
    fr: 'C est tranquille de marcher la maintenant ?',
  },
  {
    id: 'evitar-celular',
    en: 'Should I avoid using my phone on the street?',
    pt: 'Melhor evitar usar celular na rua?',
    fr: 'Je dois eviter de sortir mon portable dans la rue ?',
  },
  {
    id: 'pix-ou-cartao',
    en: 'Do they take Pix or only card?',
    pt: 'La aceita Pix ou so cartao?',
    fr: 'Ils prennent Pix ou seulement la carte ?',
  },
  {
    id: 'conta-separada',
    en: 'Can we split the bill?',
    pt: 'A gente pode dividir a conta?',
    fr: 'On peut separer l addition ?',
  },
  {
    id: 'chopp-gelado',
    en: 'Let us get a very cold draft beer.',
    pt: 'Bora pedir um chopp bem gelado.',
    fr: 'On prend un chopp bien frais.',
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
