import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_BEST_CLEAR_MS = 'bestClearMs';
const KEY_RUNS_COUNT = 'runsCount';

export async function getBestClearMs(): Promise<number | null> {
  const raw = await AsyncStorage.getItem(KEY_BEST_CLEAR_MS);
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

export async function setBestClearMs(ms: number): Promise<void> {
  await AsyncStorage.setItem(KEY_BEST_CLEAR_MS, String(ms));
}

export async function getRunsCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEY_RUNS_COUNT);
  if (raw == null) return 0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function incrementRunsCount(): Promise<number> {
  const count = await getRunsCount();
  const next = count + 1;
  await AsyncStorage.setItem(KEY_RUNS_COUNT, String(next));
  return next;
}
