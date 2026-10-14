import { getDictionary } from '@/lib/i18n';
import { isLocale } from '@/lib/locales';
import { newsletterEnabled, normalizeNewsletterEmail } from '@/lib/newsletter';
import { newsletterRateLimit, newsletterStorageConfigured, subscribeNewsletter } from '@/lib/newsletter-server';

export async function POST(request: Request) {
  let d = getDictionary('it').newsletter;
  const reply = (code: string, message: string, status: number, headers?: HeadersInit) => Response.json({ code, message }, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
  if (!newsletterEnabled()) return reply('comingSoon', d.comingSoon, 503);
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  const retry = newsletterRateLimit(ip);
  if (retry) return reply('rateLimited', d.rateLimited, 429, { 'Retry-After': String(retry) });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return reply('invalid', d.invalid, 400);
    body = JSON.parse(raw);
  } catch { return reply('invalid', d.invalid, 400); }
  if (!body || typeof body !== 'object') return reply('invalid', d.invalid, 400);
  const input = body as Record<string, unknown>;
  const locale = isLocale(input.locale) ? input.locale : 'it';
  d = getDictionary(locale).newsletter;
  // Pretend success for bots, without touching storage.
  if (typeof input.website === 'string' && input.website.trim()) return reply('success', d.success, 200);
  const email = normalizeNewsletterEmail(input.email);
  if (!email || input.consent !== true || (input.website !== undefined && typeof input.website !== 'string')) return reply('invalid', d.invalid, 400);
  if (!newsletterStorageConfigured()) return reply('comingSoon', d.comingSoon, 503);
  try {
    await subscribeNewsletter(email, locale);
    return reply('success', d.success, 200);
  } catch { return reply('error', d.error, 503); }
}
