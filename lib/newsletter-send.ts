import 'server-only';
import { createHash } from 'node:crypto';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import { animeDetailLink } from '@/lib/anime-detail-link';
import { newsletterSubscribers, newsletterStorageConfigured, newsletterToken } from '@/lib/newsletter-server';
import { getQuickWeekData, type AnimeTitle } from '@/lib/tmdb';
import { formatWeek, isoWeek, type ISOWeek } from '@/lib/week';

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export function buildWeeklyDigest({ titles, week, email, origin, locale = 'it' }: {
  titles: AnimeTitle[]; week: ISOWeek; email: string; origin: string; locale?: Locale;
}) {
  const d = getDictionary(locale).newsletter;
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid newsletter origin');
  const link = (path: string) => new URL(path, base.origin).href;
  const weekUrl = link(`/week/${formatWeek(week)}`);
  const unsubscribe = new URL(link('/api/newsletter/unsubscribe'));
  unsubscribe.search = new URLSearchParams({ email, token: newsletterToken(email), locale }).toString();
  const top = titles.slice(0, 10);
  const subject = `${d.digestTitle} · ${formatWeek(week)}`;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#253020;max-width:640px;margin:auto;padding:24px"><h1>${escapeHtml(subject)}</h1><p>${escapeHtml(d.digestIntro)}</p><ol>${top.map(title => `<li><a href="${escapeHtml(link(animeDetailLink(title)))}">${escapeHtml(title.name)}</a></li>`).join('')}</ol><p><a href="${escapeHtml(weekUrl)}">${escapeHtml(d.viewWeek)}</a></p><hr><p><a href="${escapeHtml(unsubscribe.href)}">${escapeHtml(d.unsubscribe)}</a></p></body></html>`;
  const text = `${subject}\n\n${d.digestIntro}\n\n${top.map(title => `${title.name}: ${link(animeDetailLink(title))}`).join('\n')}\n\n${d.viewWeek}: ${weekUrl}\n\n${d.unsubscribe}: ${unsubscribe.href}`;
  return { subject, html, text };
}

export async function sendWeeklyNewsletter(origin: string) {
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.NEWSLETTER_FROM?.trim() || !process.env.NEWSLETTER_SECRET?.trim() || !newsletterStorageConfigured()) return { skipped: 'not configured' };
  const subscribers = await newsletterSubscribers();
  if (!subscribers.length) return { sent: 0, failed: 0 };
  const week = isoWeek(new Date());
  const data = await getQuickWeekData(week, 'en');
  if (data.status !== 'ready' || data.partial) return { skipped: 'weekly data unavailable' };
  if (!data.titles.length) return { skipped: 'no titles' };
  let sent = 0;
  let failed = 0;
  // Resend's batch endpoint keeps recipient addresses private and accepts up to
  // 100 individual messages. Do not retry an ambiguous provider response here.
  for (let offset = 0; offset < subscribers.length; offset += 100) {
    const batch = subscribers.slice(offset, offset + 100);
    const payload = batch.map(({ email, locale }) => ({
      from: process.env.NEWSLETTER_FROM!.trim(), to: [email],
      ...buildWeeklyDigest({ titles: data.titles, week, email, locale, origin: process.env.NEWSLETTER_SITE_URL?.trim() || origin }),
    }));
    try {
      const response = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY!.trim()}`, 'Content-Type': 'application/json',
          'Idempotency-Key': `newsletter-${formatWeek(week)}-${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
        },
        body: JSON.stringify(payload), cache: 'no-store', signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error('Newsletter delivery failed');
      const result = await response.json();
      if (!Array.isArray(result.data) || result.data.length !== batch.length || result.data.some((item: { id?: unknown }) => typeof item?.id !== 'string')) throw new Error('Invalid delivery response');
      sent += batch.length;
    } catch { failed += batch.length; }
  }
  return { sent, failed };
}
