import { getDictionary } from '@/lib/i18n';
import { isLocale } from '@/lib/locales';
import { normalizeNewsletterEmail } from '@/lib/newsletter';
import { newsletterStorageConfigured, unsubscribeNewsletter, verifyNewsletterToken } from '@/lib/newsletter-server';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const locale = params.get('locale');
  const d = getDictionary(isLocale(locale) ? locale : 'it').newsletter;
  const reply = (message: string, status: number) => new Response(message, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  const email = normalizeNewsletterEmail(params.get('email'));
  if (!email || !verifyNewsletterToken(email, params.get('token') || '')) return reply(d.invalidToken, 400);
  if (!newsletterStorageConfigured()) return reply(d.comingSoon, 503);
  try {
    await unsubscribeNewsletter(email);
    return reply(d.unsubscribed, 200);
  } catch { return reply(d.error, 503); }
}
