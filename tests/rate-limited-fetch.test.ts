import { afterEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { throttle } from '../lib/rate-limited-fetch';
afterEach(() => vi.unstubAllGlobals());
it('declines long upstream cooldowns instead of holding optional sections or retrying early', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '600' } }));
  vi.stubGlobal('fetch', fetchMock);
  const response = await throttle(1)('https://example.com');
  expect(response.status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(1);
}, 1000);
