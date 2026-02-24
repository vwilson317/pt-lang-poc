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

function normalizePhone(value: string): string {
  return value.replace(/[^\d]/g, '');
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

function normalizeMessageText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isCandidateMessage(text: string): boolean {
  if (!text) return false;
  if (MEDIA_OMITTED_RE.test(text)) return false;
  if (SYSTEM_NOISE_RE.test(text)) return false;

  const cleaned = text.replace(URL_RE, '').trim();
  if (!cleaned) return false;
  if (cleaned.length < 2 || cleaned.length > 420) return false;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 90) return false;

  const letters = (cleaned.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) ?? []).length;
  const symbols = (cleaned.match(/[^\w\sÀ-ÖØ-öø-ÿ]/g) ?? []).length;
  if (letters < 1) return false;
  if (symbols > letters) return false;

  return true;
}

function messageQualityScore(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  let score = 0;
  if (words >= 1 && words <= 40) score += 2;
  if (/[.!?]$/.test(text)) score += 1;
  if (!/\d{8,}/.test(text)) score += 1;
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
  rawText: string
): WhatsAppImportResult {
  const messages = parseWhatsAppMessages(rawText);
  const messageCandidates = messages.map((message) => normalizeMessageText(message.text));
  const qualityFiltered = messageCandidates.filter((message) => {
    if (!isCandidateMessage(message)) return false;
    return messageQualityScore(message) >= 2;
  });

  const deduped = Array.from(
    new Map(
      qualityFiltered.map((message) => [
        message
          .toLocaleLowerCase()
          .replace(/[^A-Za-z0-9À-ÖØ-öø-ÿ\s]/g, '')
          .trim(),
        message.trim(),
      ])
    ).values()
  );

  const segments: ClipSegment[] = deduped.map((message, index) => ({
    id: `wa-seg-${index + 1}`,
    startMs: index * 1000,
    endMs: index * 1000,
    textOriginal: message,
    // We only have source chat text in this flow, so we keep back identical for now.
    textTranslated: message,
  }));

  const warningBits: string[] = [];
  if (!messages.length) warningBits.push('No WhatsApp messages were recognized in this file.');
  const droppedCount = messageCandidates.length - deduped.length;
  if (droppedCount > 0) warningBits.push(`${droppedCount} low-quality or duplicate lines were skipped.`);

  return {
    transcript: deduped.join('\n'),
    segments,
    warning: warningBits.length ? warningBits.join(' ') : undefined,
  };
}
