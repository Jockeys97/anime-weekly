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

it('expires a queued optional request without fetching it later', async () => {
  vi.useFakeTimers();
  let finish: (response: Response) => void = () => {};
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; })).mockResolvedValue(new Response('late'));
  vi.stubGlobal('fetch', fetchMock);
  const request = throttle(1);
  const first = request('https://example.com/first');
  await Promise.resolve();
  const queued = request('https://example.com/queued', {}, 100);
  await vi.advanceTimersByTimeAsync(101);
  expect((await queued).status).toBe(429);
  finish(new Response('done'));
  await first;
  await vi.runAllTimersAsync();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});
