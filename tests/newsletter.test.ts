import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/tmdb', () => ({ getQuickWeekData: vi.fn() }));
import { getDictionary } from '../lib/i18n';
import { locales } from '../lib/locales';
import { newsletterEnabled, normalizeNewsletterEmail } from '../lib/newsletter';
import { newsletterRateLimit, newsletterToken, verifyNewsletterToken } from '../lib/newsletter-server';
import { buildWeeklyDigest, sendWeeklyNewsletter } from '../lib/newsletter-send';
import { getQuickWeekData, type AnimeTitle } from '../lib/tmdb';
import { POST as subscribe } from '../app/api/newsletter/subscribe/route';
import { GET as unsubscribe } from '../app/api/newsletter/unsubscribe/route';
import { POST as send } from '../app/api/newsletter/send/route';

const fetchMock = vi.fn<typeof fetch>();
let ip = 0;
function signup(body: unknown, address = `test-${++ip}`) {
  return new Request('https://example.test/api/newsletter/subscribe', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': address }, body: JSON.stringify(body),
  });
}
const valid = { email: ' Reader+Anime@Example.COM ', consent: true, website: '', locale: 'it' };
const title: AnimeTitle = { id: 1, kind: 'tv', name: 'Anime & <script>"test"</script>', overview: '', poster: null, ratings: { anilistId: 23 }, recommendation: null, providers: {}, providersUnavailable: false };
function configured() {
  vi.stubEnv('KV_REST_API_URL', 'https://redis.example.test/');
  vi.stubEnv('KV_REST_API_TOKEN', 'redis-token');
  vi.stubEnv('NEWSLETTER_SECRET', 'newsletter-secret');
  vi.stubEnv('RESEND_API_KEY', 'resend-token');
  vi.stubEnv('NEWSLETTER_FROM', 'Anime <news@example.test>');
}
function json(data: unknown, status = 200) { return Response.json(data, { status }); }
beforeEach(() => {
  for (const key of ['NEXT_PUBLIC_NEWSLETTER_ENABLED', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'NEWSLETTER_SECRET', 'RESEND_API_KEY', 'NEWSLETTER_FROM', 'CRON_SECRET', 'NEWSLETTER_SITE_URL']) vi.stubEnv(key, '');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockRejectedValue(new Error('Unexpected network request'));
});
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('newsletter validation and token', () => {
  it.each([null, 42, '', 'x', 'a@b', 'a b@example.com', '.a@example.com', 'a..b@example.com', 'a.@example.com', 'a@-example.com', 'a@example-.com', 'a@example..com', 'a@example.com\r\nBcc: x@y.com', `${'a'.repeat(65)}@example.com`, `a@${'x'.repeat(64)}.com`, `${'a'.repeat(64)}@${'b'.repeat(63)}.${'c'.repeat(63)}.${'d'.repeat(63)}.com`])('rejects invalid email %s', value => {
    expect(normalizeNewsletterEmail(value)).toBeNull();
  });
  it('normalizes valid email addresses', () => {
    expect(normalizeNewsletterEmail(valid.email)).toBe('reader+anime@example.com');
    expect(normalizeNewsletterEmail('a.b@sub.example.co.it')).toBe('a.b@sub.example.co.it');
  });
  it('binds deterministic HMACs to the normalized email and secret', () => {
    const token = newsletterToken(valid.email, 'secret');
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyNewsletterToken('reader+anime@example.com', token, 'secret')).toBe(true);
    expect(verifyNewsletterToken('other@example.com', token, 'secret')).toBe(false);
    expect(verifyNewsletterToken(valid.email, token, 'different')).toBe(false);
    for (const bad of ['', 'x'.repeat(64), token.slice(1), `${token}aa`, '00'.repeat(32)]) expect(verifyNewsletterToken(valid.email, bad, 'secret')).toBe(false);
    expect(verifyNewsletterToken(valid.email, token, '')).toBe(false);
    expect(() => newsletterToken(valid.email, '')).toThrow();
  });
  it('expires the per-IP limit and separates clients', () => {
    for (let attempt = 0; attempt < 5; attempt++) expect(newsletterRateLimit('unit-limit', 1000)).toBe(0);
    expect(newsletterRateLimit('unit-limit', 1000)).toBe(900);
    expect(newsletterRateLimit('another-unit-limit', 1000)).toBe(0);
    expect(newsletterRateLimit('unit-limit', 901000)).toBe(0);
  });
});

describe('signup gates and storage', () => {
  it.each(['', '0', 'true', ' 1', '1 '])('stays disabled for flag %s', async flag => {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', flag);
    expect(newsletterEnabled()).toBe(false);
    const response = await subscribe(signup(valid));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'comingSoon', message: getDictionary('it').newsletter.comingSoon });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['KV_REST_API_URL', 'KV_REST_API_TOKEN'])('requires both Redis variables (%s missing)', async missing => {
    configured(); vi.stubEnv(missing, ''); vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    expect(newsletterEnabled()).toBe(true);
    const response = await subscribe(signup(valid));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'comingSoon' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([{ ...valid, consent: false }, { ...valid, consent: 'true' }, { ...valid, email: 'invalid' }, { ...valid, website: 4 }, null, 'text', { ...valid, email: 'a'.repeat(5000) }])('validates input before storage', async input => {
    configured(); vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    expect((await subscribe(signup(input))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('handles malformed JSON', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    const response = await subscribe(new Request('https://example.test/api/newsletter/subscribe', { method: 'POST', body: '{', headers: { 'x-forwarded-for': `test-${++ip}` } }));
    expect(response.status).toBe(400);
  });
  it('silently discards honeypot submissions', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    expect((await subscribe(signup({ ...valid, website: 'spam.example' }))).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('stores the normalized address in a set and the selected language atomically', async () => {
    configured(); vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    fetchMock.mockResolvedValue(json([{ result: 1 }, { result: 1 }]));
    const response = await subscribe(signup({ ...valid, locale: 'fr' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ message: getDictionary('fr').newsletter.success });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://redis.example.test/multi-exec', expect.objectContaining({
      method: 'POST', cache: 'no-store', headers: expect.objectContaining({ Authorization: 'Bearer redis-token' }),
      body: JSON.stringify([['SADD', 'newsletter:subscribers', 'reader+anime@example.com'], ['HSET', 'newsletter:locales', 'reader+anime@example.com', 'fr']]),
    }));
  });
  it.each([json({ error: 'unavailable' }, 500), json([{ error: 'WRONGTYPE' }, { result: 1 }]), json([])])('reports storage errors without leaking provider details', async result => {
    configured(); vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1'); fetchMock.mockResolvedValue(result);
    const response = await subscribe(signup(valid));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: 'error', message: getDictionary('it').newsletter.error });
  });
  it('rate limits a shared forwarded IP before hitting storage', async () => {
    vi.stubEnv('NEXT_PUBLIC_NEWSLETTER_ENABLED', '1');
    const address = `limited-${++ip}`;
    for (let attempt = 0; attempt < 5; attempt++) await subscribe(signup(valid, `${address}, proxy`));
    const response = await subscribe(signup(valid, `${address}, other-proxy`));
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('unsubscribe', () => {
  it('rejects forged links without storage calls', async () => {
    configured();
    const response = await unsubscribe(new Request('https://example.test/api/newsletter/unsubscribe?email=a@example.com&token=bad'));
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('removes both entries even while signup is disabled, and permits repeated cancellation', async () => {
    configured(); fetchMock.mockImplementation(async () => json([{ result: 0 }, { result: 0 }]));
    const params = new URLSearchParams({ email: valid.email, token: newsletterToken(valid.email), locale: 'es' });
    for (let i = 0; i < 2; i++) {
      const response = await unsubscribe(new Request(`https://example.test/api/newsletter/unsubscribe?${params}`));
      expect(response.status).toBe(200);
      expect(await response.text()).toBe(getDictionary('es').newsletter.unsubscribed);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
    }
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual([['SREM', 'newsletter:subscribers', 'reader+anime@example.com'], ['HDEL', 'newsletter:locales', 'reader+anime@example.com']]);
  });
  it('returns a friendly unavailable response if storage is missing', async () => {
    vi.stubEnv('NEWSLETTER_SECRET', 'secret');
    const params = new URLSearchParams({ email: valid.email, token: newsletterToken(valid.email) });
    expect((await unsubscribe(new Request(`https://example.test/api/newsletter/unsubscribe?${params}`))).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('digest and sending', () => {
  it.each(locales)('has complete newsletter copy and a safe localized digest in %s', locale => {
    configured();
    expect(Object.keys(getDictionary(locale).newsletter)).toEqual(Object.keys(getDictionary('it').newsletter));
    const digest = buildWeeklyDigest({ titles: [title, { ...title, name: 'Other title', ratings: {} }], week: { year: 2026, week: 42 }, email: 'a+b@example.com', origin: 'https://example.test', locale });
    expect(digest.html).toContain(`<html lang="${locale}">`);
    expect(digest.subject).toContain(getDictionary(locale).newsletter.digestTitle);
    expect(digest.html).toContain('Anime &amp; &lt;script&gt;&quot;test&quot;&lt;/script&gt;');
    expect(digest.html).not.toContain('<script>');
    expect(digest.html).toContain('https://example.test/anime/23');
    expect(digest.html).toContain('https://example.test/search?q=Other+title');
    expect(digest.html).toContain('/week/2026-42');
    const unsubscribeLink = new URL(digest.text.split('\n').at(-1)!.split(': ').slice(1).join(': '));
    expect(unsubscribeLink.searchParams.get('email')).toBe('a+b@example.com');
    expect(verifyNewsletterToken('a+b@example.com', unsubscribeLink.searchParams.get('token')!)).toBe(true);
    expect(digest.html).not.toContain('newsletter-secret');
  });
  it('limits the digest to ten titles', () => {
    configured();
    const digest = buildWeeklyDigest({ titles: Array.from({ length: 12 }, (_, id) => ({ ...title, name: `Title-${id}` })), week: { year: 2026, week: 42 }, email: 'a@example.com', origin: 'https://example.test' });
    expect(digest.html.match(/<li>/g)).toHaveLength(10);
    expect(digest.html).not.toContain('Title-10');
  });
  it('rejects unauthenticated sends before any external work', async () => {
    configured();
    for (const secret of ['', 'cron-secret']) {
      vi.stubEnv('CRON_SECRET', secret);
      expect((await send(new Request('https://example.test/api/newsletter/send'))).status).toBe(401);
    }
    expect(fetchMock).not.toHaveBeenCalled(); expect(getQuickWeekData).not.toHaveBeenCalled();
  });
  it.each(['RESEND_API_KEY', 'NEWSLETTER_FROM', 'NEWSLETTER_SECRET', 'KV_REST_API_URL', 'KV_REST_API_TOKEN'])('skips sending when %s is missing', async key => {
    configured(); vi.stubEnv(key, ''); vi.stubEnv('CRON_SECRET', 'cron-secret');
    const response = await send(new Request('https://example.test/api/newsletter/send', { headers: { Authorization: 'Bearer cron-secret' } }));
    expect(await response.json()).toEqual({ skipped: 'not configured' });
    expect(fetchMock).not.toHaveBeenCalled(); expect(getQuickWeekData).not.toHaveBeenCalled();
  });
  it('sends private localized messages through Resend with the configured canonical origin', async () => {
    configured(); vi.stubEnv('NEWSLETTER_SITE_URL', 'https://canonical.test');
    fetchMock.mockResolvedValueOnce(json([{ result: ['a@example.com', 'b@example.com'] }]))
      .mockResolvedValueOnce(json([{ result: ['fr', null] }]))
      .mockResolvedValueOnce(json({ data: [{ id: 'one' }, { id: 'two' }] }));
    vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [title] });
    expect(await sendWeeklyNewsletter('https://preview.test')).toEqual({ sent: 2, failed: 0 });
    expect(fetchMock).toHaveBeenLastCalledWith('https://api.resend.com/emails/batch', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer resend-token', 'Idempotency-Key': expect.stringMatching(/^newsletter-/) }) }));
    const payload = JSON.parse(fetchMock.mock.calls[2][1]!.body as string);
    expect(payload.map((item: { to: string[] }) => item.to)).toEqual([['a@example.com'], ['b@example.com']]);
    expect(payload[0].subject).toContain(getDictionary('fr').newsletter.digestTitle);
    expect(payload[1].subject).toContain(getDictionary('it').newsletter.digestTitle);
    expect(payload[0].html).toContain('https://canonical.test/anime/23');
    expect(payload[0].html).not.toContain('b@example.com');
  });
  it('returns failure counts when Resend rejects a batch', async () => {
    configured(); vi.stubEnv('CRON_SECRET', 'cron-secret');
    fetchMock.mockResolvedValueOnce(json([{ result: ['a@example.com'] }]))
      .mockResolvedValueOnce(json([{ result: ['it'] }]))
      .mockResolvedValueOnce(json({ message: 'quota' }, 429));
    vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'ready', titles: [title] });
    const response = await send(new Request('https://example.test/api/newsletter/send', { headers: { Authorization: 'Bearer cron-secret' } }));
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ sent: 0, failed: 1 });
  });
  it('avoids discovery and delivery for an empty subscriber set', async () => {
    configured(); fetchMock.mockResolvedValueOnce(json([{ result: [] }]));
    expect(await sendWeeklyNewsletter('https://example.test')).toEqual({ sent: 0, failed: 0 });
    expect(getQuickWeekData).not.toHaveBeenCalled(); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('skips unavailable weekly data rather than mailing an empty digest', async () => {
    configured();
    fetchMock.mockResolvedValueOnce(json([{ result: ['a@example.com'] }])).mockResolvedValueOnce(json([{ result: ['it'] }]));
    vi.mocked(getQuickWeekData).mockResolvedValue({ status: 'error', titles: [] });
    expect(await sendWeeklyNewsletter('https://example.test')).toEqual({ skipped: 'weekly data unavailable' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
