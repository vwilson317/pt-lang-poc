import type { ClipRecord } from '../types/v11';

function formatMmSs(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const ss = String(totalSec % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export function buildStudyPack(clip: ClipRecord): string {
  const header = [
    `Study Pack`,
    `Date: ${new Date(clip.createdAt).toLocaleString()}`,
    `Languages: ${clip.sourceLanguage.toUpperCase()}->${clip.targetLanguage.toUpperCase()}`,
    '',
  ].join('\n');
  const body = clip.segments
    .map((segment) => {
      const range = `[${formatMmSs(segment.startMs)}-${formatMmSs(segment.endMs)}]`;
      return `${range} ${clip.sourceLanguage.toUpperCase()}: ${segment.textOriginal}\n${clip.targetLanguage.toUpperCase()}: ${segment.textTranslated}`;
    })
    .join('\n\n');
  return `${header}${body}`;
}

export function clipSnippet(clip: ClipRecord): string {
  return clip.segments[0]?.textOriginal || clip.transcriptOriginal.slice(0, 90) || 'No transcript.';
}
