import fs from 'node:fs';
import path from 'node:path';

/**
 * Downloads Azure Cognitive Services (Speech) TTS audio for every PT word
 * in src/data/words.ts and saves one mp3 per word id.
 *
 * Required env vars:
 *   AZURE_SPEECH_KEY     - Azure Speech resource key
 *   AZURE_SPEECH_REGION  - Azure Speech resource region, e.g. "eastus"
 *
 * Optional env vars:
 *   AZURE_SPEECH_VOICE       - neural voice name (default: pt-BR-FranciscaNeural)
 *   AZURE_TTS_OUTPUT_DIR     - output dir (default: public/audio/pt)
 *   AZURE_TTS_CONCURRENCY    - parallel requests (default: 4)
 *
 * Usage:
 *   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus node scripts/download_azure_audio.mjs
 */

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const wordsFile = path.join(root, 'src', 'data', 'words.ts');

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION;
const AZURE_SPEECH_VOICE = process.env.AZURE_SPEECH_VOICE || 'pt-BR-FranciscaNeural';
const OUTPUT_DIR = path.resolve(root, process.env.AZURE_TTS_OUTPUT_DIR || 'public/audio/pt');
const CONCURRENCY = Math.max(1, Number(process.env.AZURE_TTS_CONCURRENCY) || 4);

if (!AZURE_SPEECH_KEY || !AZURE_SPEECH_REGION) {
  console.error(
    'Missing Azure credentials. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars.\n' +
      'Example: AZURE_SPEECH_KEY=xxx AZURE_SPEECH_REGION=eastus node scripts/download_azure_audio.mjs'
  );
  process.exit(1);
}

const TTS_ENDPOINT = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;

function extractPtWords(source) {
  const entryPattern = /\{\s*id:\s*'([^']+)'[^}]*?\bpt:\s*'([^']+)'/g;
  const words = [];
  const seenIds = new Set();
  let match;
  while ((match = entryPattern.exec(source)) !== null) {
    const [, id, pt] = match;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    words.push({ id, term: pt });
  }
  return words;
}

function escapeSsml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSsml(text) {
  return (
    `<speak version="1.0" xml:lang="pt-BR">` +
    `<voice name="${AZURE_SPEECH_VOICE}">${escapeSsml(text)}</voice>` +
    `</speak>`
  );
}

async function synthesize(text) {
  const response = await fetch(TTS_ENDPOINT, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'pt-lang-poc-audio-downloader',
    },
    body: buildSsml(text),
  });

  if (response.status === 429) {
    const retryAfterSec = Number(response.headers.get('retry-after')) || 2;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    return synthesize(text);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Azure TTS request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function runWithConcurrency(items, limit, worker) {
  let cursor = 0;
  const results = new Array(items.length);

  async function next() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, next));
  return results;
}

async function main() {
  const source = fs.readFileSync(wordsFile, 'utf8');
  const words = extractPtWords(source);

  if (words.length === 0) {
    console.error(`No words found in ${wordsFile}`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(
    `Downloading ${words.length} PT word audio files via Azure Speech (voice: ${AZURE_SPEECH_VOICE}, region: ${AZURE_SPEECH_REGION})...`
  );

  let downloaded = 0;
  let skipped = 0;
  let failed = 0;

  await runWithConcurrency(words, CONCURRENCY, async (word) => {
    const outFile = path.join(OUTPUT_DIR, `${word.id}.mp3`);
    if (fs.existsSync(outFile)) {
      skipped += 1;
      return;
    }
    try {
      const audio = await synthesize(word.term);
      fs.writeFileSync(outFile, audio);
      downloaded += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed "${word.term}" (id ${word.id}): ${err.message}`);
    }
  });

  console.log(
    `Done. Downloaded ${downloaded}, skipped ${skipped} (already existed), failed ${failed}. Output: ${OUTPUT_DIR}`
  );

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
