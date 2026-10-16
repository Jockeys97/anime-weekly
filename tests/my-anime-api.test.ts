import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const { cookies, stats, invalidate } = vi.hoisted(() => ({ cookies: vi.fn(), stats: vi.fn(), invalidate: vi.fn() }));
vi.mock('next/headers', () => ({ cookies }));
vi.mock('next/cache', () => ({ revalidateTag: invalidate }));
vi.mock('../lib/my-anime-stats', () => ({ getPersonalStats: stats }));
import { GET } from '../app/api/my-anime/stats/route';
import { POST } from '../app/api/my-anime/refresh/route';
import { encryptCookie, tokenCookie } from '../lib/my-anime-auth';
const connect = (accessToken: string, expiresAt = Date.now() + 3600000) => {
  const value = encryptCookie({ accessToken, refreshToken: 'private-refresh', expiresAt }, tokenCookie('trakt'));
  cookies.mockResolvedValue({ get: (name: string) => name === tokenCookie('trakt') ? { value } : undefined });
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_COOKIE_SECRET', 'offline-secret'); vi.stubEnv('TRAKT_CLIENT_ID', 'offline-client'); vi.stubEnv('MAL_CLIENT_ID', '');
  cookies.mockResolvedValue({ get: () => undefined });
  stats.mockResolvedValue({ status: 'ready', series: 2, episodes: 10, minutes: 240 });
});
afterEach(() => vi.unstubAllEnvs());
it('requires a valid connected session before fetching private statistics', async () => {
  expect((await GET()).status).toBe(401); expect(stats).not.toHaveBeenCalled();
  connect('expired', 1);
  expect((await GET()).status).toBe(401); expect(stats).not.toHaveBeenCalled();
  vi.stubEnv('TRAKT_CLIENT_ID', ''); expect((await GET()).status).toBe(404);
});
it('returns private aggregates without credentials and marks upstream failure as unavailable', async () => {
  connect('private-access');
  const response = await GET();
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ status: 'ready', series: 2, episodes: 10, minutes: 240 });
  stats.mockResolvedValue({ status: 'unavailable' });
  expect((await GET()).status).toBe(503);
});
it('rejects unauthenticated and cross-origin cache refresh requests', async () => {
  expect((await POST(new Request('https://example.com/api/my-anime/refresh', { method: 'POST', headers: { Origin: 'https://example.com' } }))).status).toBe(401);
  connect('csrf-account');
  expect((await POST(new Request('https://example.com/api/my-anime/refresh', { method: 'POST', headers: { Origin: 'https://attacker.example' } }))).status).toBe(403);
  expect(invalidate).not.toHaveBeenCalled();
});
it('refreshes only the connected account and limits repeat manual refreshes', async () => {
  connect('refresh-account-a');
  const request = () => new Request('https://example.com/api/my-anime/refresh', { method: 'POST', headers: { Origin: 'https://example.com' } });
  expect((await POST(request())).status).toBe(200);
  const tagA = invalidate.mock.calls[0][0];
  expect(tagA).toMatch(/^my-anime:[a-f0-9]{64}$/); expect(tagA).not.toContain('refresh-account-a');
  expect((await POST(request())).status).toBe(429); expect(invalidate).toHaveBeenCalledTimes(1);
  connect('refresh-account-b'); expect((await POST(request())).status).toBe(200);
  expect(invalidate.mock.calls[1][0]).not.toBe(tagA);
});
