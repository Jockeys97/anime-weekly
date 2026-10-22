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

it('applies long Retry-After cooldowns to later lookups without extra upstream calls', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { 'Retry-After': '600' } }));
  vi.stubGlobal('fetch', fetchMock);
  const request = throttle(1);
  expect((await request('https://example.com/first')).status).toBe(429);
  expect((await request('https://example.com/second')).status).toBe(429);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('serializes concurrent calls and honors a short 429 Retry-After before recovering', async () => {
  vi.useFakeTimers();
  try {
    const starts: number[] = [];
    let active = 0;
    const fetchMock = vi.fn(async () => {
      expect(++active).toBe(1);
      starts.push(Date.now());
      await Promise.resolve();
      active--;
      return starts.length === 1
        ? new Response(null, { status: 429, headers: { 'Retry-After': '3' } })
        : Response.json({ ok: true });
    });
    vi.stubGlobal('fetch', fetchMock);
    const request = throttle(2100);
    const pending = Promise.all([request('https://example.com/first', { cache: 'no-store' }), request('https://example.com/second', { cache: 'no-store' })]);
    await vi.runAllTimersAsync();
    expect((await pending).map(response => response.status)).toEqual([200, 200]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(3000);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(2100);
  } finally { vi.useRealTimers(); }
});
it('retries transient cron responses with backoff without caching the error bodies', async () => {
  vi.useFakeTimers();
  try {
    const starts: number[] = [];
    const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => { starts.push(Date.now()); return starts.length < 3 ? new Response(null, { status: 503 }) : Response.json({ ok: true }); });
    vi.stubGlobal('fetch', fetchMock);
    const pending = throttle(1100)('https://example.com', { cache: 'no-store', next: undefined }, 12000);
    await vi.runAllTimersAsync();
    expect((await pending).status).toBe(200);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(2200);
    expect(fetchMock.mock.calls.every(([, init]) => (init as RequestInit).cache === 'no-store')).toBe(true);
  } finally { vi.useRealTimers(); }
});
