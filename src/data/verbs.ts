import type { Word } from '../types/word';
import type { PracticeLanguage } from '../types/practiceLanguage';
import { getWordsForLanguage } from './words';

/**
 * Built-in "Verbs" deck: every verb from the core word list plus generated
 * conjugation cards (present, preterite, imperfect) for each infinitive.
 *
 * Persons follow Brazilian usage: eu / ele (= ela, você) / nós / eles (= elas, vocês).
 */

type Tense = 'present' | 'preterite' | 'imperfect';
type Forms = [eu: string, ele: string, nos: string, eles: string];

type VerbEntry = {
  inf: string;
  /** English: base form, 3rd-person singular, simple past. */
  en: [base: string, s3: string, past: string];
  /** Irregular Portuguese forms; tenses left out are conjugated regularly. */
  pt?: Partial<Record<Tense, Forms>>;
  /** English overrides per tense, for verbs the default pattern reads badly. */
  enForms?: Partial<Record<Tense, Forms>>;
};

const PERSONS = ['eu', 'ele', 'nós', 'eles'] as const;
const EN_PERSONS = ['I', 'he', 'we', 'they'] as const;
const TENSES: Tense[] = ['present', 'preterite', 'imperfect'];

const VERBS: VerbEntry[] = [
  {
    inf: 'ser',
    en: ['be', 'is', 'was'],
    pt: {
      present: ['sou', 'é', 'somos', 'são'],
      preterite: ['fui', 'foi', 'fomos', 'foram'],
      imperfect: ['era', 'era', 'éramos', 'eram'],
    },
    enForms: {
      present: ['I am', 'he is', 'we are', 'they are'],
      preterite: ['I was', 'he was', 'we were', 'they were'],
      imperfect: ['I used to be', 'he used to be', 'we used to be', 'they used to be'],
    },
  },
  {
    inf: 'estar',
    en: ['be', 'is', 'was'],
    pt: {
      present: ['estou', 'está', 'estamos', 'estão'],
      preterite: ['estive', 'esteve', 'estivemos', 'estiveram'],
    },
    enForms: {
      present: ['I am (now)', 'he is (now)', 'we are (now)', 'they are (now)'],
      preterite: ['I was (at that point)', 'he was (at that point)', 'we were (at that point)', 'they were (at that point)'],
      imperfect: ['I was (ongoing)', 'he was (ongoing)', 'we were (ongoing)', 'they were (ongoing)'],
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
    },
  },
  {
    inf: 'saber',
    en: ['know (a fact)', 'knows (a fact)', 'found out'],
    pt: {
      present: ['sei', 'sabe', 'sabemos', 'sabem'],
      preterite: ['soube', 'soube', 'soubemos', 'souberam'],
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
    pt: {
      present: ['quero', 'quer', 'queremos', 'querem'],
      preterite: ['quis', 'quis', 'quisemos', 'quiseram'],
    },
  },
  {
    inf: 'poder',
    en: ['can', 'can', 'could'],
    pt: {
      present: ['posso', 'pode', 'podemos', 'podem'],
      preterite: ['pude', 'pôde', 'pudemos', 'puderam'],
    },
    enForms: {
      preterite: ['I managed to', 'he managed to', 'we managed to', 'they managed to'],
      imperfect: ['I could', 'he could', 'we could', 'they could'],
    },
  },
  { inf: 'ficar', en: ['stay', 'stays', 'stayed'] },
  { inf: 'falar', en: ['speak', 'speaks', 'spoke'] },
  { inf: 'achar', en: ['think/find', 'thinks/finds', 'thought/found'] },
  { inf: 'deixar', en: ['leave/let', 'leaves/lets', 'left/let'] },
  { inf: 'levar', en: ['take', 'takes', 'took'] },
  { inf: 'chegar', en: ['arrive', 'arrives', 'arrived'] },
  { inf: 'passar', en: ['pass/spend', 'passes/spends', 'passed/spent'] },
  { inf: 'voltar', en: ['return', 'returns', 'returned'] },
  { inf: 'gostar', en: ['like', 'likes', 'liked'] },
  { inf: 'precisar', en: ['need', 'needs', 'needed'] },
  { inf: 'começar', en: ['begin', 'begins', 'began'] },
  { inf: 'trabalhar', en: ['work', 'works', 'worked'] },
  { inf: 'usar', en: ['use', 'uses', 'used'] },
  { inf: 'encontrar', en: ['find', 'finds', 'found'] },
  { inf: 'chamar', en: ['call', 'calls', 'called'] },
  { inf: 'tentar', en: ['try', 'tries', 'tried'] },
  { inf: 'perguntar', en: ['ask', 'asks', 'asked'] },
  { inf: 'responder', en: ['answer', 'answers', 'answered'] },
  {
    inf: 'sentir',
    en: ['feel', 'feels', 'felt'],
    pt: { present: ['sinto', 'sente', 'sentimos', 'sentem'] },
  },
  { inf: 'entrar', en: ['enter', 'enters', 'entered'] },
  {
    inf: 'sair',
    en: ['leave/go out', 'leaves/goes out', 'left/went out'],
    pt: {
      present: ['saio', 'sai', 'saímos', 'saem'],
      preterite: ['saí', 'saiu', 'saímos', 'saíram'],
      imperfect: ['saía', 'saía', 'saíamos', 'saíam'],
    },
  },
  { inf: 'viver', en: ['live', 'lives', 'lived'] },
  { inf: 'olhar', en: ['look', 'looks', 'looked'] },
  { inf: 'lembrar', en: ['remember', 'remembers', 'remembered'] },
  {
    inf: 'acontecer',
    en: ['happen', 'happens', 'happened'],
    pt: { present: ['aconteço', 'acontece', 'acontecemos', 'acontecem'] },
  },
  { inf: 'existir', en: ['exist', 'exists', 'existed'] },
  { inf: 'abrir', en: ['open', 'opens', 'opened'] },
  { inf: 'fechar', en: ['close', 'closes', 'closed'] },
  { inf: 'pagar', en: ['pay', 'pays', 'paid'] },
  { inf: 'ajudar', en: ['help', 'helps', 'helped'] },
  {
    inf: 'ouvir',
    en: ['hear', 'hears', 'heard'],
    pt: { present: ['ouço', 'ouve', 'ouvimos', 'ouvem'] },
  },
  { inf: 'comprar', en: ['buy', 'buys', 'bought'] },
  { inf: 'vender', en: ['sell', 'sells', 'sold'] },
  { inf: 'morar', en: ['live (reside)', 'lives (resides)', 'lived (resided)'] },
  { inf: 'estudar', en: ['study', 'studies', 'studied'] },
  { inf: 'aprender', en: ['learn', 'learns', 'learned'] },
  { inf: 'entender', en: ['understand', 'understands', 'understood'] },
  { inf: 'mudar', en: ['change', 'changes', 'changed'] },
  { inf: 'esperar', en: ['wait/hope', 'waits/hopes', 'waited/hoped'] },
  {
    inf: 'dormir',
    en: ['sleep', 'sleeps', 'slept'],
    pt: { present: ['durmo', 'dorme', 'dormimos', 'dormem'] },
  },
  { inf: 'acordar', en: ['wake up', 'wakes up', 'woke up'] },
  { inf: 'correr', en: ['run', 'runs', 'ran'] },
  { inf: 'caminhar', en: ['walk', 'walks', 'walked'] },
  { inf: 'beber', en: ['drink', 'drinks', 'drank'] },
  { inf: 'comer', en: ['eat', 'eats', 'ate'] },
  {
    inf: 'trazer',
    en: ['bring', 'brings', 'brought'],
    pt: {
      present: ['trago', 'traz', 'trazemos', 'trazem'],
      preterite: ['trouxe', 'trouxe', 'trouxemos', 'trouxeram'],
    },
  },
  { inf: 'colocar', en: ['put', 'puts', 'put'] },
  {
    inf: 'dizer',
    en: ['say', 'says', 'said'],
    pt: {
      present: ['digo', 'diz', 'dizemos', 'dizem'],
      preterite: ['disse', 'disse', 'dissemos', 'disseram'],
    },
  },
];

const REGULAR_ENDINGS: Record<'ar' | 'er' | 'ir', Record<Tense, Forms>> = {
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

function conjugateRegular(inf: string, tense: Tense): Forms {
  const group = inf.slice(-2) as 'ar' | 'er' | 'ir';
  const stem = inf.slice(0, -2);
  const forms = REGULAR_ENDINGS[group][tense].map((ending) => stem + ending) as Forms;
  // Spelling changes before -ei keep the stem's sound (ficar → fiquei, chegar → cheguei, começar → comecei).
  if (group === 'ar' && tense === 'preterite') {
    if (stem.endsWith('c')) forms[0] = `${stem.slice(0, -1)}quei`;
    else if (stem.endsWith('g')) forms[0] = `${stem}uei`;
    else if (stem.endsWith('ç')) forms[0] = `${stem.slice(0, -1)}cei`;
  }
  return forms;
}

function defaultEnglish(entry: VerbEntry, tense: Tense): Forms {
  const [base, s3, past] = entry.en;
  return EN_PERSONS.map((subject, i) => {
    if (tense === 'preterite') return `${subject} ${past}`;
    if (tense === 'imperfect') return `${subject} used to ${base}`;
    return `${subject} ${i === 1 ? s3 : base}`;
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
  for (const entry of VERBS) {
    for (const tense of TENSES) {
      const ptForms = entry.pt?.[tense] ?? conjugateRegular(entry.inf, tense);
      const enForms = entry.enForms?.[tense] ?? defaultEnglish(entry, tense);
      ptForms.forEach((form, i) => {
        out.push({
          id: `verb-${slug(entry.inf)}-${tense}-${i}`,
          term: `${PERSONS[i]} ${form}`,
          en: enForms[i],
          wordType: 'verb',
          verbLabel: `${tense} · ${entry.inf}`,
          language: 'pt',
        });
      });
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
