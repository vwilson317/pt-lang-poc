import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getWordsForLanguage } from './words';

/**
 * Built-in "Verbs" deck: every verb from the core word list plus generated
 * conjugation cards for each infinitive below.
 *
 * Persons follow Brazilian usage: eu / ele (= ela, você) / nós / eles (= elas, vocês).
 * The imperative uses você / vocês / nós.
 */

type Tense =
  | 'present'
  | 'preterite'
  | 'imperfect'
  | 'future'
  | 'conditional'
  | 'subjunctive'
  | 'imperative';
type Forms = [eu: string, ele: string, nos: string, eles: string];
/** Imperative forms: você, vocês, nós. */
type ImperativeForms = [voce: string, voces: string, nos: string];

type VerbEntry = {
  inf: string;
  /** English: base form, 3rd-person singular, simple past. */
  en: [base: string, s3: string, past: string];
  /** Irregular Portuguese forms; tenses left out are conjugated regularly. */
  pt?: Partial<Record<Exclude<Tense, 'imperative'>, Forms>>;
  /** Irregular future/conditional stem (fazer → far-, dizer → dir-). */
  futureStem?: string;
  /** English overrides per tense, for verbs the default pattern reads badly. */
  enForms?: Partial<Record<Exclude<Tense, 'imperative'>, Forms>>;
  /** Skip imperative cards for verbs that are rarely used as commands (poder, dever…). */
  noImperative?: boolean;
};

const EN_PERSONS = ['I', 'he', 'we', 'they'] as const;
const PERSONS = ['eu', 'ele', 'nós', 'eles'] as const;
const PERSON_TENSES: Exclude<Tense, 'imperative'>[] = [
  'present',
  'preterite',
  'imperfect',
  'future',
  'conditional',
  'subjunctive',
];
const TENSE_LABELS: Record<Tense, string> = {
  present: 'present',
  preterite: 'preterite',
  imperfect: 'imperfect',
  future: 'future',
  conditional: 'conditional',
  subjunctive: 'present subjunctive',
  imperative: 'imperative',
};

const VERBS: VerbEntry[] = [
  {
    inf: 'ser',
    en: ['be', 'is', 'was'],
    pt: {
      present: ['sou', 'é', 'somos', 'são'],
      preterite: ['fui', 'foi', 'fomos', 'foram'],
      imperfect: ['era', 'era', 'éramos', 'eram'],
      subjunctive: ['seja', 'seja', 'sejamos', 'sejam'],
    },
    enForms: {
      present: ['I am', 'he is', 'we are', 'they are'],
      preterite: ['I was', 'he was', 'we were', 'they were'],
      imperfect: ['I used to be', 'he used to be', 'we used to be', 'they used to be'],
      subjunctive: ['that I be', 'that he be', 'that we be', 'that they be'],
    },
  },
  {
    inf: 'estar',
    en: ['be', 'is', 'was'],
    pt: {
      present: ['estou', 'está', 'estamos', 'estão'],
      preterite: ['estive', 'esteve', 'estivemos', 'estiveram'],
      subjunctive: ['esteja', 'esteja', 'estejamos', 'estejam'],
    },
    enForms: {
      present: ['I am (now)', 'he is (now)', 'we are (now)', 'they are (now)'],
      preterite: ['I was (at that point)', 'he was (at that point)', 'we were (at that point)', 'they were (at that point)'],
      imperfect: ['I was (ongoing)', 'he was (ongoing)', 'we were (ongoing)', 'they were (ongoing)'],
      future: ['I will be (then)', 'he will be (then)', 'we will be (then)', 'they will be (then)'],
      conditional: ['I would be (then)', 'he would be (then)', 'we would be (then)', 'they would be (then)'],
      subjunctive: ['that I be (now)', 'that he be (now)', 'that we be (now)', 'that they be (now)'],
    },
  },
  {
    inf: 'ter',
    en: ['have', 'has', 'had'],
    pt: {
      present: ['tenho', 'tem', 'temos', 'têm'],
      preterite: ['tive', 'teve', 'tivemos', 'tiveram'],
      imperfect: ['tinha', 'tinha', 'tínhamos', 'tinham'],
    },
  },
  {
    inf: 'fazer',
    en: ['do/make', 'does/makes', 'did/made'],
    futureStem: 'far',
    pt: {
      present: ['faço', 'faz', 'fazemos', 'fazem'],
      preterite: ['fiz', 'fez', 'fizemos', 'fizeram'],
    },
  },
  {
    inf: 'ir',
    en: ['go', 'goes', 'went'],
    pt: {
      present: ['vou', 'vai', 'vamos', 'vão'],
      preterite: ['fui', 'foi', 'fomos', 'foram'],
      subjunctive: ['vá', 'vá', 'vamos', 'vão'],
    },
  },
  {
    inf: 'vir',
    en: ['come', 'comes', 'came'],
    pt: {
      present: ['venho', 'vem', 'vimos', 'vêm'],
      preterite: ['vim', 'veio', 'viemos', 'vieram'],
      imperfect: ['vinha', 'vinha', 'vínhamos', 'vinham'],
    },
  },
  {
    inf: 'ver',
    en: ['see', 'sees', 'saw'],
    pt: {
      present: ['vejo', 'vê', 'vemos', 'veem'],
      preterite: ['vi', 'viu', 'vimos', 'viram'],
    },
  },
  {
    inf: 'dar',
    en: ['give', 'gives', 'gave'],
    pt: {
      present: ['dou', 'dá', 'damos', 'dão'],
      preterite: ['dei', 'deu', 'demos', 'deram'],
      subjunctive: ['dê', 'dê', 'demos', 'deem'],
    },
  },
  {
    inf: 'pôr',
    en: ['put (place)', 'puts (places)', 'put (placed)'],
    futureStem: 'por',
    pt: {
      present: ['ponho', 'põe', 'pomos', 'põem'],
      preterite: ['pus', 'pôs', 'pusemos', 'puseram'],
      imperfect: ['punha', 'punha', 'púnhamos', 'punham'],
    },
  },
  {
    inf: 'saber',
    en: ['know (a fact)', 'knows (a fact)', 'found out'],
    noImperative: true,
    pt: {
      present: ['sei', 'sabe', 'sabemos', 'sabem'],
      preterite: ['soube', 'soube', 'soubemos', 'souberam'],
      subjunctive: ['saiba', 'saiba', 'saibamos', 'saibam'],
    },
    enForms: {
      imperfect: ['I knew (a fact)', 'he knew (a fact)', 'we knew (a fact)', 'they knew (a fact)'],
    },
  },
  {
    inf: 'conhecer',
    en: ['know (a person/place)', 'knows (a person/place)', 'met'],
    pt: {
      present: ['conheço', 'conhece', 'conhecemos', 'conhecem'],
    },
    enForms: {
      imperfect: [
        'I knew (a person/place)',
        'he knew (a person/place)',
        'we knew (a person/place)',
        'they knew (a person/place)',
      ],
    },
  },
  {
    inf: 'querer',
    en: ['want', 'wants', 'wanted'],
    noImperative: true,
    pt: {
      present: ['quero', 'quer', 'queremos', 'querem'],
      preterite: ['quis', 'quis', 'quisemos', 'quiseram'],
      subjunctive: ['queira', 'queira', 'queiramos', 'queiram'],
    },
  },
  {
    inf: 'poder',
    en: ['can', 'can', 'could'],
    noImperative: true,
    pt: {
      present: ['posso', 'pode', 'podemos', 'podem'],
      preterite: ['pude', 'pôde', 'pudemos', 'puderam'],
    },
    enForms: {
      preterite: ['I was able to', 'he was able to', 'we were able to', 'they were able to'],
      imperfect: ['I could', 'he could', 'we could', 'they could'],
      future: ['I will be able to', 'he will be able to', 'we will be able to', 'they will be able to'],
      conditional: ['I would be able to', 'he would be able to', 'we would be able to', 'they would be able to'],
    },
  },
  {
    inf: 'dever',
    en: ['must', 'must', 'had to'],
    noImperative: true,
    enForms: {
      imperfect: ['I was supposed to', 'he was supposed to', 'we were supposed to', 'they were supposed to'],
      future: ['I will have to', 'he will have to', 'we will have to', 'they will have to'],
      conditional: ['I should', 'he should', 'we should', 'they should'],
    },
  },
  {
    inf: 'dizer',
    en: ['say', 'says', 'said'],
    futureStem: 'dir',
    pt: {
      present: ['digo', 'diz', 'dizemos', 'dizem'],
      preterite: ['disse', 'disse', 'dissemos', 'disseram'],
    },
  },
  {
    inf: 'trazer',
    en: ['bring', 'brings', 'brought'],
    futureStem: 'trar',
    pt: {
      present: ['trago', 'traz', 'trazemos', 'trazem'],
      preterite: ['trouxe', 'trouxe', 'trouxemos', 'trouxeram'],
    },
  },
  {
    inf: 'sair',
    en: ['leave/go out', 'leaves/goes out', 'left/went out'],
    pt: {
      present: ['saio', 'sai', 'saímos', 'saem'],
      preterite: ['saí', 'saiu', 'saímos', 'saíram'],
      imperfect: ['saía', 'saía', 'saíamos', 'saíam'],
    },
  },
  {
    inf: 'cair',
    en: ['fall', 'falls', 'fell'],
    pt: {
      present: ['caio', 'cai', 'caímos', 'caem'],
      preterite: ['caí', 'caiu', 'caímos', 'caíram'],
      imperfect: ['caía', 'caía', 'caíamos', 'caíam'],
    },
  },
  {
    inf: 'ler',
    en: ['read', 'reads', 'read (past)'],
    pt: { present: ['leio', 'lê', 'lemos', 'leem'] },
  },
  {
    inf: 'ouvir',
    en: ['hear', 'hears', 'heard'],
    pt: { present: ['ouço', 'ouve', 'ouvimos', 'ouvem'] },
  },
  {
    inf: 'sentir',
    en: ['feel', 'feels', 'felt'],
    pt: { present: ['sinto', 'sente', 'sentimos', 'sentem'] },
  },
  {
    inf: 'dormir',
    en: ['sleep', 'sleeps', 'slept'],
    pt: { present: ['durmo', 'dorme', 'dormimos', 'dormem'] },
  },
  {
    inf: 'pedir',
    en: ['ask for', 'asks for', 'asked for'],
    pt: { present: ['peço', 'pede', 'pedimos', 'pedem'] },
  },
  {
    inf: 'perder',
    en: ['lose', 'loses', 'lost'],
    pt: { present: ['perco', 'perde', 'perdemos', 'perdem'] },
  },
  {
    inf: 'seguir',
    en: ['follow', 'follows', 'followed'],
    pt: { present: ['sigo', 'segue', 'seguimos', 'seguem'] },
  },
  {
    inf: 'conseguir',
    en: ['manage to', 'manages to', 'managed to'],
    noImperative: true,
    pt: { present: ['consigo', 'consegue', 'conseguimos', 'conseguem'] },
  },
  {
    inf: 'preferir',
    en: ['prefer', 'prefers', 'preferred'],
    pt: { present: ['prefiro', 'prefere', 'preferimos', 'preferem'] },
  },
  {
    inf: 'acontecer',
    en: ['happen', 'happens', 'happened'],
    noImperative: true,
    pt: { present: ['aconteço', 'acontece', 'acontecemos', 'acontecem'] },
  },
  {
    inf: 'parecer',
    en: ['seem', 'seems', 'seemed'],
    noImperative: true,
    pt: { present: ['pareço', 'parece', 'parecemos', 'parecem'] },
  },
  {
    inf: 'esquecer',
    en: ['forget', 'forgets', 'forgot'],
    pt: { present: ['esqueço', 'esquece', 'esquecemos', 'esquecem'] },
  },
  { inf: 'ficar', en: ['stay', 'stays', 'stayed'] },
  { inf: 'falar', en: ['speak', 'speaks', 'spoke'] },
  { inf: 'achar', en: ['think/find', 'thinks/finds', 'thought/found'] },
  { inf: 'pensar', en: ['think (about)', 'thinks (about)', 'thought (about)'] },
  { inf: 'deixar', en: ['leave/let', 'leaves/lets', 'left/let'] },
  { inf: 'levar', en: ['take', 'takes', 'took'] },
  { inf: 'tomar', en: ['take (a drink/bus)', 'takes (a drink/bus)', 'took (a drink/bus)'] },
  { inf: 'pegar', en: ['grab/catch', 'grabs/catches', 'grabbed/caught'] },
  { inf: 'chegar', en: ['arrive', 'arrives', 'arrived'] },
  { inf: 'passar', en: ['pass/spend', 'passes/spends', 'passed/spent'] },
  { inf: 'voltar', en: ['return', 'returns', 'returned'] },
  { inf: 'gostar', en: ['like', 'likes', 'liked'], noImperative: true },
  { inf: 'precisar', en: ['need', 'needs', 'needed'], noImperative: true },
  { inf: 'começar', en: ['begin', 'begins', 'began'] },
  { inf: 'trabalhar', en: ['work', 'works', 'worked'] },
  { inf: 'usar', en: ['use', 'uses', 'used'] },
  { inf: 'encontrar', en: ['find', 'finds', 'found'] },
  { inf: 'chamar', en: ['call', 'calls', 'called'] },
  { inf: 'tentar', en: ['try', 'tries', 'tried'] },
  { inf: 'perguntar', en: ['ask', 'asks', 'asked'] },
  { inf: 'responder', en: ['answer', 'answers', 'answered'] },
  { inf: 'entrar', en: ['enter', 'enters', 'entered'] },
  { inf: 'viver', en: ['live', 'lives', 'lived'] },
  { inf: 'olhar', en: ['look', 'looks', 'looked'] },
  { inf: 'lembrar', en: ['remember', 'remembers', 'remembered'] },
  { inf: 'existir', en: ['exist', 'exists', 'existed'], noImperative: true },
  { inf: 'abrir', en: ['open', 'opens', 'opened'] },
  { inf: 'fechar', en: ['close', 'closes', 'closed'] },
  { inf: 'pagar', en: ['pay', 'pays', 'paid'] },
  { inf: 'ajudar', en: ['help', 'helps', 'helped'] },
  { inf: 'comprar', en: ['buy', 'buys', 'bought'] },
  { inf: 'vender', en: ['sell', 'sells', 'sold'] },
  { inf: 'morar', en: ['live (reside)', 'lives (resides)', 'lived (resided)'] },
  { inf: 'estudar', en: ['study', 'studies', 'studied'] },
  { inf: 'aprender', en: ['learn', 'learns', 'learned'] },
  { inf: 'entender', en: ['understand', 'understands', 'understood'] },
  { inf: 'mudar', en: ['change', 'changes', 'changed'] },
  { inf: 'esperar', en: ['wait/hope', 'waits/hopes', 'waited/hoped'] },
  { inf: 'acordar', en: ['wake up', 'wakes up', 'woke up'] },
  { inf: 'correr', en: ['run', 'runs', 'ran'] },
  { inf: 'caminhar', en: ['walk', 'walks', 'walked'] },
  { inf: 'andar', en: ['walk/go around', 'walks/goes around', 'walked/went around'] },
  { inf: 'beber', en: ['drink', 'drinks', 'drank'] },
  { inf: 'comer', en: ['eat', 'eats', 'ate'] },
  { inf: 'colocar', en: ['put', 'puts', 'put'] },
  { inf: 'escrever', en: ['write', 'writes', 'wrote'] },
  { inf: 'jogar', en: ['play (a game)', 'plays (a game)', 'played (a game)'] },
  { inf: 'acreditar', en: ['believe', 'believes', 'believed'] },
  { inf: 'receber', en: ['receive', 'receives', 'received'] },
  { inf: 'mostrar', en: ['show', 'shows', 'showed'] },
  { inf: 'ganhar', en: ['win/earn', 'wins/earns', 'won/earned'] },
  { inf: 'viajar', en: ['travel', 'travels', 'traveled'] },
  { inf: 'assistir', en: ['watch', 'watches', 'watched'] },
  { inf: 'escutar', en: ['listen', 'listens', 'listened'] },
  { inf: 'mandar', en: ['send', 'sends', 'sent'] },
  { inf: 'decidir', en: ['decide', 'decides', 'decided'] },
];

type Group = 'ar' | 'er' | 'ir';

const REGULAR_ENDINGS: Record<Group, Record<'present' | 'preterite' | 'imperfect', Forms>> = {
  ar: {
    present: ['o', 'a', 'amos', 'am'],
    preterite: ['ei', 'ou', 'amos', 'aram'],
    imperfect: ['ava', 'ava', 'ávamos', 'avam'],
  },
  er: {
    present: ['o', 'e', 'emos', 'em'],
    preterite: ['i', 'eu', 'emos', 'eram'],
    imperfect: ['ia', 'ia', 'íamos', 'iam'],
  },
  ir: {
    present: ['o', 'e', 'imos', 'em'],
    preterite: ['i', 'iu', 'imos', 'iram'],
    imperfect: ['ia', 'ia', 'íamos', 'iam'],
  },
};
const FUTURE_ENDINGS: Forms = ['ei', 'á', 'emos', 'ão'];
const CONDITIONAL_ENDINGS: Forms = ['ia', 'ia', 'íamos', 'iam'];

function isArVerb(inf: string): boolean {
  return inf.endsWith('ar');
}

/** Keeps a stem's hard c/g sound before -e (fic → fiqu, cheg → chegu, começ → comec). */
function softenStemBeforeE(stem: string): string {
  if (stem.endsWith('c')) return `${stem.slice(0, -1)}qu`;
  if (stem.endsWith('g')) return `${stem}u`;
  if (stem.endsWith('ç')) return `${stem.slice(0, -1)}c`;
  return stem;
}

function conjugate(entry: VerbEntry, tense: Exclude<Tense, 'imperative'>): Forms {
  const override = entry.pt?.[tense];
  if (override) return override;
  const { inf } = entry;
  if (tense === 'future' || tense === 'conditional') {
    const stem = entry.futureStem ?? inf;
    const endings = tense === 'future' ? FUTURE_ENDINGS : CONDITIONAL_ENDINGS;
    return endings.map((ending) => stem + ending) as Forms;
  }
  if (tense === 'subjunctive') {
    // Built from the eu present form: falo → fale, faço → faça, tenho → tenha.
    const stem = conjugate(entry, 'present')[0].slice(0, -1);
    const isAr = isArVerb(inf);
    const base = isAr ? softenStemBeforeE(stem) : stem;
    const vowel = isAr ? 'e' : 'a';
    return [`${base}${vowel}`, `${base}${vowel}`, `${base}${vowel}mos`, `${base}${vowel}m`];
  }
  const group = inf.slice(-2) as Group;
  const stem = inf.slice(0, -2);
  const forms = REGULAR_ENDINGS[group][tense].map((ending) => stem + ending) as Forms;
  if (group === 'ar' && tense === 'preterite') {
    forms[0] = `${softenStemBeforeE(stem)}ei`;
  }
  return forms;
}

function defaultEnglish(entry: VerbEntry, tense: Exclude<Tense, 'imperative'>): Forms {
  const [base, s3, past] = entry.en;
  return EN_PERSONS.map((subject, i) => {
    const present = i === 1 ? s3 : base;
    switch (tense) {
      case 'preterite':
        return `${subject} ${past}`;
      case 'imperfect':
        return `${subject} used to ${base}`;
      case 'future':
        return `${subject} will ${base}`;
      case 'conditional':
        return `${subject} would ${base}`;
      case 'subjunctive':
        return `that ${subject} ${present}`;
      default:
        return `${subject} ${present}`;
    }
  }) as Forms;
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .toLocaleLowerCase();
}

function buildConjugationWords(): Word[] {
  const out: Word[] = [];
  const push = (entry: VerbEntry, tense: Tense, index: number, term: string, en: string) => {
    out.push({
      id: `verb-${slug(entry.inf)}-${tense}-${index}`,
      term,
      en,
      wordType: 'verb',
      verbLabel: `${TENSE_LABELS[tense]} · ${entry.inf}`,
      language: 'pt',
    });
  };

  for (const entry of VERBS) {
    for (const tense of PERSON_TENSES) {
      const ptForms = conjugate(entry, tense);
      const enForms = entry.enForms?.[tense] ?? defaultEnglish(entry, tense);
      ptForms.forEach((form, i) => {
        const term = tense === 'subjunctive' ? `que ${PERSONS[i]} ${form}` : `${PERSONS[i]} ${form}`;
        push(entry, tense, i, term, enForms[i]);
      });
    }
    if (!entry.noImperative) {
      // Affirmative imperative = present subjunctive forms (fale!, falem!, falemos!).
      const [eu, , nos, eles] = conjugate(entry, 'subjunctive');
      const base = entry.en[0];
      const forms: ImperativeForms = [eu, eles, nos];
      const terms = [`você: ${forms[0]}!`, `vocês: ${forms[1]}!`, `nós: ${forms[2]}!`];
      const meanings = [`${base}! (you)`, `${base}! (you all)`, `let's ${base}`];
      terms.forEach((term, i) => push(entry, 'imperative', i, term, meanings[i]));
    }
  }

  // Identical forms (nós falamos = we speak / we spoke, eu fui = I was / I went) share one
  // combined meaning so neither card can show the other's meaning as a wrong answer.
  const meaningsByTerm = new Map<string, string[]>();
  for (const word of out) {
    const meanings = meaningsByTerm.get(word.term) ?? [];
    if (word.en && !meanings.includes(word.en)) meanings.push(word.en);
    meaningsByTerm.set(word.term, meanings);
  }
  return out.map((word) => ({ ...word, en: meaningsByTerm.get(word.term)!.join(' / ') }));
}

const CONJUGATION_WORDS = buildConjugationWords();

/**
 * Verbs deck for the given language: core-list verbs (deduplicated by term,
 * keeping their recorded audio) followed by the generated conjugations.
 */
export function getVerbDeckWords(language: PracticeLanguage): Word[] {
  const seenTerms = new Set<string>();
  const coreVerbs = getWordsForLanguage(language).filter((word) => {
    if (word.wordType !== 'verb') return false;
    const key = word.term.toLocaleLowerCase();
    if (seenTerms.has(key)) return false;
    seenTerms.add(key);
    return true;
  });
  // Conjugation cards are Portuguese-only.
  if (language !== 'pt') return coreVerbs;
  return [...coreVerbs, ...CONJUGATION_WORDS];
}

export const VERB_DECK_LENGTH = getVerbDeckWords('pt').length;
