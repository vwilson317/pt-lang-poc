import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CardPhotoHint, ClipRecord, Deck, DeckCounts, FlashCardRecord } from '../types/v11';
import type { Word } from '../types/word';
import { BUILT_IN_PHRASES } from '../data/phrases';
import { DECK_LENGTH } from '../data/words';
import { COGNATES } from '../data/cognates';

const KEY_V11_INITIALIZED = 'v11:initialized';
const KEY_DECKS = 'v11:decks';
const KEY_SELECTED_DECK_ID = 'v11:selectedDeckId';
const KEY_CARDS = 'v11:cards';
const KEY_CLIPS = 'v11:clips';
const DEFAULT_DECK_ID = 'default';
const KNOWN_DECK_ID = 'known-cards';
export const COGNATES_DECK_ID = 'cognates';

function nowMs(): number {
  return Date.now();
}

function defaultDeck(): Deck {
  const ts = nowMs();
  return {
    id: DEFAULT_DECK_ID,
    name: 'Default',
    isSelected: true,
    createdAt: ts,
    updatedAt: ts,
  };
}

function knownDeck(): Deck {
  const ts = nowMs();
  return {
    id: KNOWN_DECK_ID,
    name: 'Known Cards',
    isSelected: false,
    createdAt: ts,
    updatedAt: ts,
  };
}

function cognatesDeck(): Deck {
  const ts = nowMs();
  return {
    id: COGNATES_DECK_ID,
    name: 'English-Portuguese Cognates',
    isSelected: false,
    createdAt: ts,
    updatedAt: ts,
  };
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

export async function ensureV11Initialized(): Promise<void> {
  const initialized = await AsyncStorage.getItem(KEY_V11_INITIALIZED);
  if (initialized === 'true') {
    const decks = await readJson<Deck[]>(KEY_DECKS, [defaultDeck()]);
    const byId = new Map(decks.map((deck) => [deck.id, deck]));
    if (!byId.has(DEFAULT_DECK_ID)) byId.set(DEFAULT_DECK_ID, defaultDeck());
    if (!byId.has(KNOWN_DECK_ID)) byId.set(KNOWN_DECK_ID, knownDeck());
    if (!byId.has(COGNATES_DECK_ID)) byId.set(COGNATES_DECK_ID, cognatesDeck());
    await writeJson(KEY_DECKS, Array.from(byId.values()));
    return;
  }

  await writeJson(KEY_DECKS, [defaultDeck(), knownDeck(), cognatesDeck()]);
  await AsyncStorage.setItem(KEY_SELECTED_DECK_ID, DEFAULT_DECK_ID);
  await writeJson(KEY_CARDS, []);
  await writeJson(KEY_CLIPS, []);
  await AsyncStorage.setItem(KEY_V11_INITIALIZED, 'true');
}

export async function getDecks(): Promise<Deck[]> {
  await ensureV11Initialized();
  const decks = await readJson<Deck[]>(KEY_DECKS, [defaultDeck()]);
  if (decks.length > 0) return decks;
  return [defaultDeck()];
}

export async function getSelectedDeckId(): Promise<string> {
  await ensureV11Initialized();
  const id = await AsyncStorage.getItem(KEY_SELECTED_DECK_ID);
  return id || DEFAULT_DECK_ID;
}

export async function getSelectedDeck(): Promise<Deck> {
  const decks = await getDecks();
  const selectedId = await getSelectedDeckId();
  return decks.find((deck) => deck.id === selectedId) ?? decks[0] ?? defaultDeck();
}

export async function setSelectedDeck(deckId: string): Promise<void> {
  await ensureV11Initialized();
  await AsyncStorage.setItem(KEY_SELECTED_DECK_ID, deckId);
  const decks = await getDecks();
  const updated = decks.map((deck) => ({
    ...deck,
    isSelected: deck.id === deckId,
    updatedAt: nowMs(),
  }));
  await writeJson(KEY_DECKS, updated);
}

export async function createDeck(name: string): Promise<Deck> {
  await ensureV11Initialized();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Deck name is required.');
  }
  const decks = await getDecks();
  const duplicate = decks.find((deck) => deck.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase());
  if (duplicate) {
    return duplicate;
  }
  const ts = nowMs();
  const id = `deck-${ts}-${Math.random().toString(36).slice(2, 8)}`;
  const nextDeck: Deck = {
    id,
    name: trimmed,
    isSelected: false,
    createdAt: ts,
    updatedAt: ts,
  };
  await writeJson(KEY_DECKS, [...decks, nextDeck]);
  return nextDeck;
}

export async function getCards(): Promise<FlashCardRecord[]> {
  await ensureV11Initialized();
  return readJson<FlashCardRecord[]>(KEY_CARDS, []);
}

export async function getCardsByDeck(deckId: string): Promise<FlashCardRecord[]> {
  const cards = await getCards();
  return cards.filter((card) => card.deckId === deckId);
}

export async function addCards(nextCards: FlashCardRecord[]): Promise<void> {
  if (nextCards.length === 0) return;
  const cards = await getCards();
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const card of nextCards) {
    byId.set(card.id, card);
  }
  await writeJson(KEY_CARDS, Array.from(byId.values()));
}

export async function getDeckCounts(deckId: string): Promise<DeckCounts> {
  const cards = await getCardsByDeck(deckId);
  const sentence = cards.filter((card) => card.cardType === 'sentence').length;
  const storedWordCards = cards.filter((card) => card.cardType === 'word').length;
  const phrase = cards.filter((card) => card.cardType === 'phrase').length;
  // The default deck always includes the built-in core word deck from src/data/words.ts.
  const word = deckId === DEFAULT_DECK_ID ? DECK_LENGTH + storedWordCards : storedWordCards;
  return {
    total: word + sentence + phrase,
    word,
    sentence,
    phrase,
  };
}

export async function getClips(): Promise<ClipRecord[]> {
  await ensureV11Initialized();
  const clips = await readJson<ClipRecord[]>(KEY_CLIPS, []);
  return [...clips].sort((a, b) => b.createdAt - a.createdAt);
}

export async function getClipById(id: string): Promise<ClipRecord | null> {
  const clips = await getClips();
  return clips.find((clip) => clip.id === id) ?? null;
}

export async function upsertClip(clip: ClipRecord): Promise<void> {
  const clips = await getClips();
  const byId = new Map(clips.map((item) => [item.id, item]));
  byId.set(clip.id, clip);
  await writeJson(KEY_CLIPS, Array.from(byId.values()));
}

export async function getSentenceCards(deckId: string, sourceClipId?: string): Promise<FlashCardRecord[]> {
  const cards = await getCardsByDeck(deckId);
  return cards.filter((card) => {
    if (card.cardType !== 'sentence') return false;
    if (!sourceClipId) return true;
    return card.sourceClipId === sourceClipId;
  });
}

export async function getWordCards(deckId: string, sourceClipId?: string): Promise<FlashCardRecord[]> {
  const cards = await getCardsByDeck(deckId);
  return cards.filter((card) => {
    if (card.cardType !== 'word') return false;
    if (!sourceClipId) return true;
    return card.sourceClipId === sourceClipId;
  });
}

type WordCardProgressPatch = {
  seenCount?: number;
  wrongCount?: number;
  photoPromptDismissed?: boolean;
  photo?: CardPhotoHint | null;
};

export async function updateWordCardProgress(
  cardId: string,
  patch: WordCardProgressPatch
): Promise<void> {
  await ensureV11Initialized();
  const cards = await getCards();
  let didUpdate = false;
  const nextCards = cards.map((card) => {
    if (card.id !== cardId || card.cardType !== 'word') return card;
    didUpdate = true;
    const nextCard: FlashCardRecord = { ...card };
    if (patch.seenCount != null) nextCard.seenCount = Math.max(0, patch.seenCount);
    if (patch.wrongCount != null) nextCard.wrongCount = Math.max(0, patch.wrongCount);
    if (patch.photoPromptDismissed != null) nextCard.photoPromptDismissed = patch.photoPromptDismissed;
    if (patch.photo !== undefined) {
      if (patch.photo === null) {
        delete nextCard.photo;
      } else {
        nextCard.photo = patch.photo;
      }
    }
    return nextCard;
  });
  if (!didUpdate) return;
  await writeJson(KEY_CARDS, nextCards);
}

export async function ensureDefaultPhraseCards(deckId: string): Promise<void> {
  const cards = await getCardsByDeck(deckId);
  const hasPhraseById = new Set(
    cards
      .filter((card) => card.cardType === 'phrase' && card.phraseId)
      .map((card) => card.phraseId as string)
  );
  const seedTs = nowMs();
  const nextCards: FlashCardRecord[] = BUILT_IN_PHRASES.filter(
    (phrase) => !hasPhraseById.has(phrase.id)
  ).map((phrase, index) => ({
    id: `phrase-${deckId}-${phrase.id}`,
    deckId,
    cardType: 'phrase',
    front: phrase.pt,
    back: phrase.en,
    phraseId: phrase.id,
    createdAt: seedTs + index,
  }));
  await addCards(nextCards);
}

export async function ensureCognatesCards(): Promise<void> {
  const cards = await getCardsByDeck(COGNATES_DECK_ID);
  const existingIds = new Set(cards.map((card) => card.id));
  const seedTs = nowMs();
  const nextCards: FlashCardRecord[] = COGNATES.filter(
    (cognate) => !existingIds.has(`cognate-${cognate.id}`)
  ).map((cognate, index) => ({
    id: `cognate-${cognate.id}`,
    deckId: COGNATES_DECK_ID,
    cardType: 'word',
    front: cognate.pt,
    back: cognate.en,
    pronHintEn: cognate.pronHintEn,
    wordType: cognate.wordType,
    createdAt: seedTs + index,
  }));
  await addCards(nextCards);
}

export async function getPhraseCards(deckId: string, sourceClipId?: string): Promise<FlashCardRecord[]> {
  const cards = await getCardsByDeck(deckId);
  return cards.filter((card) => {
    if (card.cardType !== 'phrase') return false;
    if (!sourceClipId) return true;
    return card.sourceClipId === sourceClipId;
  });
}

function normalizeWordSlug(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function moveWordToKnownDeck(word: Word): Promise<void> {
  const normalizedTerm = word.term?.trim();
  if (!normalizedTerm) return;
  const slug = normalizeWordSlug(word.id || normalizedTerm);
  if (!slug) return;
  await ensureV11Initialized();
  const cards = await getCards();
  const ts = nowMs();
  const knownCardId = `known-word-${slug}`;
  const normalizedTermLower = normalizedTerm.toLocaleLowerCase();
  const updatedCards = cards.map((card) => {
    if (card.cardType !== 'word') return card;
    if (card.id === knownCardId) return card;
    if (card.deckId !== DEFAULT_DECK_ID) return card;
    if (card.front.trim().toLocaleLowerCase() !== normalizedTermLower) return card;
    return {
      ...card,
      deckId: KNOWN_DECK_ID,
    };
  });

  const hasKnownCard = updatedCards.some((card) => card.id === knownCardId);
  if (!hasKnownCard) {
    updatedCards.push({
      id: knownCardId,
      deckId: KNOWN_DECK_ID,
      cardType: 'word',
      front: normalizedTermLower,
      back: (word.en?.trim() || normalizedTermLower).toLocaleLowerCase(),
      createdAt: ts,
    });
  }
  await writeJson(KEY_CARDS, updatedCards);
}
