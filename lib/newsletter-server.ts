import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { isLocale, type Locale } from '@/lib/locales';
import { normalizeNewsletterEmail } from '@/lib/newsletter';

const subscribersKey = 'newsletter:subscribers';
const localesKey = 'newsletter:locales';

export function newsletterStorageConfigured() {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

async function redis(commands: (string | number)[][]): Promise<unknown[]> {
  if (!newsletterStorageConfigured()) throw new Error('Newsletter storage not configured');
  const response = await fetch(`${process.env.KV_REST_API_URL!.trim().replace(/\/$/, '')}/multi-exec`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN!.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands), cache: 'no-store', signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Newsletter storage unavailable');
  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length !== commands.length || data.some(item => !item || typeof item !== 'object' || 'error' in item || !('result' in item))) throw new Error('Newsletter storage failed');
  return data.map(item => item.result);
}

export async function subscribeNewsletter(email: string, locale: Locale) {
  // The set deduplicates addresses; the hash remembers the most recent language.
  await redis([['SADD', subscribersKey, email], ['HSET', localesKey, email, locale]]);
}

export async function unsubscribeNewsletter(email: string) {
  await redis([['SREM', subscribersKey, email], ['HDEL', localesKey, email]]);
}

export async function newsletterSubscribers(): Promise<{ email: string; locale: Locale }[]> {
  const [members] = await redis([['SMEMBERS', subscribersKey]]);
  if (!Array.isArray(members) || members.some(email => typeof email !== 'string')) throw new Error('Invalid subscriber set');
  if (!members.length) return [];
  const [languages] = await redis([['HMGET', localesKey, ...members]]);
  if (!Array.isArray(languages) || languages.length !== members.length) throw new Error('Invalid subscriber languages');
  return members.flatMap((value, index) => {
    const email = normalizeNewsletterEmail(value);
    const locale = languages[index];
    return email ? [{ email, locale: isLocale(locale) ? locale : 'it' }] : [];
  });
}

export function newsletterToken(email: string, secret = process.env.NEWSLETTER_SECRET): string {
  const normalized = normalizeNewsletterEmail(email);
  if (!secret?.trim() || !normalized) throw new Error('Newsletter token not configured');
  return createHmac('sha256', secret).update(`newsletter:unsubscribe:${normalized}`).digest('hex');
}

export function verifyNewsletterToken(email: string, token: string, secret = process.env.NEWSLETTER_SECRET): boolean {
  if (!secret?.trim() || !normalizeNewsletterEmail(email) || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(newsletterToken(email, secret), 'hex'));
}

export function newsletterAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return false;
  const actual = Buffer.from(request.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Best effort per process, bounded even when many different addresses connect.
const attempts = new Map<string, { count: number; reset: number }>();
export function newsletterRateLimit(ip: string, now = Date.now()): number {
  for (const [key, value] of attempts) if (value.reset <= now) attempts.delete(key);
  const entry = attempts.get(ip);
  if (entry) {
    if (entry.count >= 5) return Math.ceil((entry.reset - now) / 1000);
    entry.count++;
  } else {
    if (attempts.size >= 10000) attempts.delete(attempts.keys().next().value!);
    attempts.set(ip, { count: 1, reset: now + 15 * 60 * 1000 });
  }
  return 0;
}
