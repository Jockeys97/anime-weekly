import type { Locale } from '@/lib/locales';

export const DUB_LANGUAGES: Record<Locale, { file: string; name: string }> = {
  en: { file: 'english', name: 'English' }, it: { file: 'italian', name: 'Italian' },
  es: { file: 'spanish', name: 'Spanish' }, fr: { file: 'french', name: 'French' },
  de: { file: 'german', name: 'German' }, pt: { file: 'portuguese', name: 'Portuguese' },
};
export type DubbingStatusValue = 'reported' | 'partial' | 'unverified';
export interface DubbingResult {
  status: DubbingStatusValue;
  language: Locale;
  malId?: number;
  checkedAt?: string;
  reason?: 'not-listed' | 'identity' | 'upstream';
}
export interface DubIndex { dubbed: number[]; partial: number[]; checkedAt: string }
export const validMalId = (id: unknown): id is number => Number.isSafeInteger(id) && (id as number) > 0 && (id as number) <= 2147483647;

export function parseDubIndex(value: unknown, locale: Locale, checkedAt: string): DubIndex {
  if (!value || typeof value !== 'object') throw new Error('Invalid dub dataset');
  const data = value as Record<string, unknown>;
  const ids = (list: unknown): list is number[] => Array.isArray(list) && list.length <= 100000 && list.every(validMalId);
  if (data.language !== DUB_LANGUAGES[locale].name || !ids(data.dubbed) || !ids(data.partial)
    || typeof data._license !== 'string' || !data._license.includes('CC BY 4.0')
    || data._origin !== 'https://github.com/Joelis57/MyDubList') throw new Error('Invalid dub dataset');
  return { dubbed: [...new Set(data.dubbed)], partial: [...new Set(data.partial)], checkedAt };
}

export function dubbingForMal(index: DubIndex, malId: number, language: Locale): DubbingResult {
  // Exact MAL identity only. Partial reports win over positive reports, and a
  // missing ID is unknown, never proof of "sub only" or of no existing dub.
  return { malId, language, checkedAt: index.checkedAt,
    ...(index.partial.includes(malId) ? { status: 'partial' as const }
      : index.dubbed.includes(malId) ? { status: 'reported' as const }
        : { status: 'unverified' as const, reason: 'not-listed' as const }) };
}

export function validDubbingResult(value: unknown, language: Locale, malId?: number): value is DubbingResult {
  if (!value || typeof value !== 'object') return false;
  const data = value as DubbingResult;
  return data.language === language && ['reported', 'partial', 'unverified'].includes(data.status)
    && (data.malId === undefined || validMalId(data.malId)) && (malId === undefined || data.malId === malId)
    && (data.checkedAt === undefined || (typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt))))
    && (data.status === 'unverified' || (validMalId(data.malId) && Boolean(data.checkedAt)));
}
