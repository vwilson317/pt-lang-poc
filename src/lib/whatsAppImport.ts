import type { ClipSegment } from '../types/v11';

export type WhatsAppMessage = {
  sender: string;
  text: string;
};

export type WhatsAppImportResult = {
  transcript: string;
  segments: ClipSegment[];
  warning?: string;
};

export type WhatsAppSenderPhone = {
  phone: string;
  senderLabel: string;
  messageCount: number;
};

const MEDIA_OMITTED_RE = /(?:<\s*media omitted\s*>|omitiu|omitted|document omitted|audio omitted)/i;
const SYSTEM_NOISE_RE =
  /(deleted this message|this message was edited|messages and calls are end-to-end encrypted|changed the group description|created group|added|left|joined using this group's invite link)/i;
const URL_RE = /(https?:\/\/\S+|www\.\S+)/gi;
const URL_DETECT_RE = /(https?:\/\/\S+|www\.\S+)/i;
const SELF_SENDER_LABELS = new Set([
  'you',
  'voce',
  'você',
  'eu',
]);

function normalizePhone(value: string): string {
  return value.replace(/[^\d]/g, '');
}

function isSamePhone(a: string, b: string): boolean {
  const left = normalizePhone(a);
  const right = normalizePhone(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const suffixLen = 8;
  return left.slice(-suffixLen) === right.slice(-suffixLen);
}

function normalizeSenderLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isLikelySelfSenderLabel(sender: string): boolean {
  const normalized = normalizeSenderLabel(sender);
  return SELF_SENDER_LABELS.has(normalized);
}

function asSenderPhoneCandidate(sender: string): string | null {
  const normalized = normalizePhone(sender);
  if (normalized.length < 8) return null;
  return normalized;
}

function parseLineStart(line: string): { sender: string; text: string } | null {
  const modern = line.match(
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\]\s([^:]+):\s([\s\S]*)$/
  );
  if (modern) {
    return { sender: modern[3].trim(), text: modern[4] ?? '' };
  }

  const classic = line.match(
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?\s?(?:AM|PM|am|pm)?)\s-\s([^:]+):\s([\s\S]*)$/
  );
  if (classic) {
    return { sender: classic[3].trim(), text: classic[4] ?? '' };
  }
  return null;
}

function parseWhatsAppMessages(rawText: string): WhatsAppMessage[] {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const parsed: WhatsAppMessage[] = [];
  let current: WhatsAppMessage | null = null;

  for (const line of lines) {
    const next = parseLineStart(line);
    if (next) {
      if (current) parsed.push(current);
      current = { sender: next.sender, text: next.text };
      continue;
    }
    if (!current) continue;
    current.text = `${current.text}\n${line}`.trim();
  }
  if (current) parsed.push(current);
  return parsed;
}

function splitSentences(text: string): string[] {
  const flattened = text.replace(/\s+/g, ' ').trim();
  if (!flattened) return [];
  return flattened
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isCandidateSentence(text: string): boolean {
  if (!text) return false;
  if (MEDIA_OMITTED_RE.test(text)) return false;
  if (SYSTEM_NOISE_RE.test(text)) return false;

  const cleaned = text.replace(URL_RE, '').trim();
  if (!cleaned) return false;
  if (cleaned.length < 12 || cleaned.length > 240) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 42) return false;

  const letters = (cleaned.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? []).length;
  const symbols = (cleaned.match(/[^\w\sÀ-ÖØ-öø-ÿ]/g) ?? []).length;
  if (letters < 8) return false;
  if (symbols > letters) return false;

  return true;
}

function sentenceQualityScore(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 0;
  if (words >= 5 && words <= 24) score += 2;
  if (/[.!?]$/.test(text)) score += 1;
  if (!/\d{4,}/.test(text)) score += 1;
  if (!URL_DETECT_RE.test(text)) score += 1;
  return score;
}

export function listWhatsAppSenderPhones(rawText: string): WhatsAppSenderPhone[] {
  const messages = parseWhatsAppMessages(rawText);
  const byPhone = new Map<string, WhatsAppSenderPhone>();
  for (const message of messages) {
    const phone = asSenderPhoneCandidate(message.sender);
    if (!phone) continue;
    const existing = byPhone.get(phone);
    if (existing) {
      existing.messageCount += 1;
      continue;
    }
    byPhone.set(phone, {
      phone,
      senderLabel: message.sender,
      messageCount: 1,
    });
  }
  return [...byPhone.values()].sort(
    (left, right) =>
      right.messageCount - left.messageCount || left.phone.localeCompare(right.phone)
  );
}

export function buildWhatsAppImport(
  rawText: string,
  selectedPhoneNumbers: string[],
  includeOtherParticipants: boolean
): WhatsAppImportResult {
  const messages = parseWhatsAppMessages(rawText);
  const normalizedSelectedPhones = Array.from(
    new Set(
      selectedPhoneNumbers
        .map((value) => normalizePhone(value))
        .filter((value) => value.length >= 8)
    )
  );
  const mineByPhone =
    normalizedSelectedPhones.length > 0
      ? messages.filter((message) =>
          normalizedSelectedPhones.some((phone) => isSamePhone(message.sender, phone))
        )
      : [];
  const mineBySenderLabel =
    normalizedSelectedPhones.length === 0
      ? messages.filter((message) => isLikelySelfSenderLabel(message.sender))
      : [];
  const mine = mineByPhone.length > 0 ? mineByPhone : mineBySenderLabel;
  const canFallbackToAllParticipants = normalizedSelectedPhones.length === 0;
  const usedFallbackAllParticipants =
    !includeOtherParticipants &&
    canFallbackToAllParticipants &&
    mine.length === 0 &&
    messages.length > 0;
  const base =
    includeOtherParticipants || usedFallbackAllParticipants ? messages : mine;

  const sentenceCandidates = base.flatMap((message) => splitSentences(message.text));
  const qualityFiltered = sentenceCandidates.filter((sentence) => {
    if (!isCandidateSentence(sentence)) return false;
    return sentenceQualityScore(sentence) >= 2;
  });

  const deduped = Array.from(
    new Map(
      qualityFiltered.map((sentence) => [
        sentence
          .toLocaleLowerCase()
          .replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ\s]/g, '')
          .trim(),
        sentence.trim(),
      ])
    ).values()
  );

  const segments: ClipSegment[] = deduped.map((sentence, index) => ({
    id: `wa-seg-${index + 1}`,
    startMs: index * 1000,
    endMs: index * 1000,
    textOriginal: sentence,
    // We only have source chat text in this flow, so we keep back identical for now.
    textTranslated: sentence,
  }));

  const warningBits: string[] = [];
  if (!messages.length) warningBits.push('No WhatsApp messages were recognized in this file.');
  if (!mineByPhone.length && !includeOtherParticipants && normalizedSelectedPhones.length > 0) {
    if (usedFallbackAllParticipants) {
      warningBits.push(
        'No messages matched the selected phone numbers, so we used all participant messages from this thread.'
      );
    } else {
      warningBits.push('No messages matched the selected phone numbers.');
    }
  }
  if (
    !includeOtherParticipants &&
    normalizedSelectedPhones.length === 0 &&
    !mine.length &&
    usedFallbackAllParticipants
  ) {
    warningBits.push(
      'No participant phone numbers were selected, so we used all participant messages from this thread.'
    );
  }
  if (
    !includeOtherParticipants &&
    normalizedSelectedPhones.length === 0 &&
    !mine.length &&
    !usedFallbackAllParticipants
  ) {
    warningBits.push(
      'No participant phone numbers were selected. Select one or more numbers or import all participants.'
    );
  }
  if (!includeOtherParticipants && normalizedSelectedPhones.length === 0 && mine.length > 0) {
    warningBits.push(
      'No phone number selected; imported messages matched sender labels such as "You".'
    );
  }
  const droppedCount = sentenceCandidates.length - deduped.length;
  if (droppedCount > 0) warningBits.push(`${droppedCount} low-quality or duplicate lines were skipped.`);

  return {
    transcript: deduped.join('\n'),
    segments,
    warning: warningBits.length ? warningBits.join(' ') : undefined,
  };
}
