import { buildWhatsAppImport } from './whatsAppImport';
import type { TranslationLookupDb } from './translationLookup';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function fakeDbForLookupOrder(): TranslationLookupDb {
  return {
    async getUserCache({ token }) {
      if (token === 'oi') {
        return {
          sourceLanguage: 'pt',
          targetLanguage: 'en',
          token: 'oi',
          translation: 'hello-from-cache',
          updatedAtMs: Date.now(),
        };
      }
      if (token === 'tudo') {
        return {
          sourceLanguage: 'pt',
          targetLanguage: 'en',
          token: 'tudo',
          translation: 'tudo',
          updatedAtMs: Date.now(),
        };
      }
      return null;
    },
    async getTranslationMapping({ sourceToken }) {
      if (sourceToken === 'tudo') {
        return {
          mappingKey: 'pt:tudo=>en:everything',
          sourceLanguage: 'pt',
          targetLanguage: 'en',
          sourceToken: 'tudo',
          targetText: 'everything',
        };
      }
      return null;
    },
    async putUserCache() {
      // no-op for test
    },
  };
}

export async function runWhatsAppImportIntegrationTest(): Promise<void> {
  const raw = [
    '[01/01/2026, 10:00:00 AM] +55 11 90000-0000: oi tudo',
    '[01/01/2026, 10:01:00 AM] +55 11 90000-0000: tudo bem',
  ].join('\n');
  const parsed = await buildWhatsAppImport(raw, { translationDb: fakeDbForLookupOrder() });
  assert(parsed.segments.length === 2, 'expected two parsed segments');
  const tokens = parsed.segments[0]?.tokens ?? [];
  const oi = tokens.find((token) => token.text === 'oi');
  const tudo = tokens.find((token) => token.text === 'tudo');
  assert(oi?.translation === 'hello-from-cache', 'expected cache hit to win for "oi"');
  assert(
    tudo?.translation === 'everything',
    'expected db mapping to win over stale cache echo for "tudo"'
  );
  assert(
    parsed.segments[1]?.textTranslated === 'how are you',
    'expected phrase-level translation to be preserved for transcript output'
  );
  const singleWord = await buildWhatsAppImport(
    '[01/01/2026, 10:02:00 AM] +55 11 90000-0000: valeu',
    { translationDb: fakeDbForLookupOrder() }
  );
  assert(
    singleWord.segments[0]?.textTranslated === 'thanks',
    'expected single-word phrase seed to translate "valeu"'
  );

  const accentInsensitive = await buildWhatsAppImport(
    '[01/01/2026, 10:03:00 AM] +55 11 90000-0000: voce tem',
    { translationDb: fakeDbForLookupOrder() }
  );
  const voce = accentInsensitive.segments[0]?.tokens?.find((token) => token.text === 'voce');
  assert(voce?.translation === 'you', 'expected accent-insensitive lookup for "voce" -> "you"');
}

declare const require: any;
declare const module: any;
declare const process: any;

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  runWhatsAppImportIntegrationTest()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('whatsAppImport integration test passed');
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
