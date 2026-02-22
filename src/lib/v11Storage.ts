import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ClipRecord, Deck, DeckCounts, FlashCardRecord } from '../types/v11';
import { BUILT_IN_PHRASES } from '../data/phrases';

const KEY_V11_INITIALIZED = 'v11:initialized';
const KEY_DECKS = 'v11:decks';
const KEY_SELECTED_DECK_ID = 'v11:selectedDeckId';
const KEY_CARDS = 'v11:cards';
const KEY_CLIPS = 'v11:clips';
const DEFAULT_DECK_ID = 'default';

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
  if (initialized === 'true') return;

  const deck = defaultDeck();
  await writeJson(KEY_DECKS, [deck]);
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
  const word = cards.filter((card) => card.cardType === 'word').length;
  return {
    // Keep deck metrics focused on words/sentences until phrase stats are added.
    total: word + sentence,
    word,
    sentence,
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

export async function getPhraseCards(deckId: string, sourceClipId?: string): Promise<FlashCardRecord[]> {
  const cards = await getCardsByDeck(deckId);
  return cards.filter((card) => {
    if (card.cardType !== 'phrase') return false;
    if (!sourceClipId) return true;
    return card.sourceClipId === sourceClipId;
  });
}
