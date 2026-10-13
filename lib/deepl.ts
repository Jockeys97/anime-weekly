import 'server-only';
import { createHash } from 'node:crypto';
import { unstable_cache } from 'next/cache';
import type { Locale } from '@/lib/locales';

// Free-only integration: never switch to a paid endpoint based on the key.
const ENDPOINT = 'https://api-free.deepl.com/v2/translate';
const targets: Record<Exclude<Locale, 'en'>, string> = { it: 'IT', es: 'ES', fr: 'FR', de: 'DE', pt: 'PT-PT' };
const MAX_CHARACTERS = 12000;
const pending = new Map<string, Promise<string | null>>();
let active = 0;
export function isDeepLConfigured(): boolean { return Boolean(process.env.DEEPL_AUTH_KEY?.trim().endsWith(':fx')); }

const cachedTranslation = unstable_cache(async (text: string, locale: Exclude<Locale, 'en'>): Promise<string> => {
  const key = process.env.DEEPL_AUTH_KEY?.trim();
  if (!key?.endsWith(':fx')) throw new Error('DeepL Free is not configured');
  // Translation POSTs are not retried: an uncertain response may already have
  // consumed characters. Only successful results enter the persistent cache.
  const response = await fetch(ENDPOINT, {
    method: 'POST', cache: 'no-store', redirect: 'error',
    headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: [text], source_lang: 'EN', target_lang: targets[locale], preserve_formatting: true }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('DeepL translation unavailable');
  const result = await response.json() as { translations?: { text?: string }[] };
  const translation = result.translations?.[0]?.text;
  if (typeof translation !== 'string' || !translation.trim()) throw new Error('DeepL translation unavailable');
  return translation.trim();
}, ['deepl-free-synopsis-v1'], { revalidate: 2592000, tags: ['machine-synopses'] });

export async function translateSynopsis(original: string, locale: Locale): Promise<string | null> {
  const text = original.trim();
  if (locale === 'en' || !isDeepLConfigured() || !text || [...text].length > MAX_CHARACTERS) return null;
  const hash = createHash('sha256').update(`${locale}\0${text}`).digest('hex');
  const existing = pending.get(hash);
  if (existing) return existing;
  if (active >= 4) return null;
  active++;
  const translation = cachedTranslation(text, locale).catch(() => null).finally(() => { active--; pending.delete(hash); });
  pending.set(hash, translation);
  return translation;
}
