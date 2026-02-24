import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeId } from './id';

const KEY_ANALYTICS_DISTINCT_ID = 'analytics:distinctId:v1';
const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

let distinctIdPromise: Promise<string> | null = null;

async function getDistinctId(): Promise<string> {
  if (distinctIdPromise) return distinctIdPromise;
  distinctIdPromise = (async () => {
    const existing = await AsyncStorage.getItem(KEY_ANALYTICS_DISTINCT_ID);
    if (existing?.trim()) return existing;
    const created = makeId('anon');
    await AsyncStorage.setItem(KEY_ANALYTICS_DISTINCT_ID, created);
    return created;
  })();
  return distinctIdPromise;
}

export async function trackEvent(
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  if (!POSTHOG_KEY) return;
  try {
    const distinctId = await getDistinctId();
    await fetch(`${POSTHOG_HOST.replace(/\/$/, '')}/capture/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          $lib: 'pt-lang-poc-custom',
          $host: POSTHOG_HOST,
        },
      }),
    });
  } catch {
    // Metrics must not impact UX.
  }
}

