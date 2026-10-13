import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>) => {
  const values = new Map<string, unknown>();
  return async (...args: unknown[]) => {
    const key = JSON.stringify(args);
    if (values.has(key)) return values.get(key);
    const value = await fn(...args); values.set(key, value); return value;
  };
} }));
beforeEach(() => { vi.resetModules(); vi.stubEnv('DEEPL_AUTH_KEY', 'test-free-key:fx'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const translated = () => Response.json({ translations: [{ text: 'Trama tradotta.' }] });

describe('DeepL Free synopsis fallback', () => {
  it.each(['', 'pro-key-without-free-suffix'])('never calls a paid endpoint or uses an absent/incompatible key (%s)', async key => {
    vi.stubEnv('DEEPL_AUTH_KEY', key);
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis, isDeepLConfigured } = await import('../lib/deepl');
    expect(isDeepLConfigured()).toBe(false);
    expect(await translateSynopsis('English source.', 'it')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('uses the Free host with server-side header auth and caches successful text per language', async () => {
    const fetchMock = vi.fn().mockImplementation(translated); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    expect(await translateSynopsis(' English source. ', 'it')).toBe('Trama tradotta.');
    expect(await translateSynopsis('English source.', 'it')).toBe('Trama tradotta.');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://api-free.deepl.com/v2/translate', expect.objectContaining({ method: 'POST', cache: 'no-store', redirect: 'error', headers: { Authorization: 'DeepL-Auth-Key test-free-key:fx', 'Content-Type': 'application/json' } }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: ['English source.'], source_lang: 'EN', target_lang: 'IT', preserve_formatting: true });
    await translateSynopsis('English source.', 'fr');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('uses European Portuguese and skips the original English', async () => {
    const fetchMock = vi.fn().mockImplementation(translated); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    expect(await translateSynopsis('English source.', 'en')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await translateSynopsis('English source.', 'pt');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).target_lang).toBe('PT-PT');
  });
  it.each([403, 429, 456, 500])('does not retry or cache a failed translation (HTTP %s)', async status => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status })).mockImplementation(translated); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    expect(await translateSynopsis('English source.', 'it')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await translateSynopsis('English source.', 'it')).toBe('Trama tradotta.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('contains network failures and invalid responses', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(Response.json({ translations: [{ text: ' ' }] })).mockImplementation(translated); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    expect(await translateSynopsis('English source.', 'it')).toBeNull();
    expect(await translateSynopsis('English source.', 'it')).toBeNull();
    expect(await translateSynopsis('English source.', 'it')).toBe('Trama tradotta.');
  });
  it('skips blank and oversized text', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    expect(await translateSynopsis('  ', 'it')).toBeNull();
    expect(await translateSynopsis('x'.repeat(12001), 'it')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('coalesces concurrent identical requests before the persistent cache fills', async () => {
    let finish!: (response: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>(resolve => { finish = resolve; })); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    const a = translateSynopsis('English source.', 'it'); const b = translateSynopsis('English source.', 'it');
    expect(fetchMock).toHaveBeenCalledTimes(1); finish(translated());
    expect(await Promise.all([a, b])).toEqual(['Trama tradotta.', 'Trama tradotta.']);
  });
  it('bounds concurrent translations and releases capacity after errors', async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetchMock = vi.fn(() => new Promise<Response>(resolve => resolvers.push(resolve))); vi.stubGlobal('fetch', fetchMock);
    const { translateSynopsis } = await import('../lib/deepl');
    const pending = [1, 2, 3, 4].map(n => translateSynopsis(`English ${n}`, 'it'));
    expect(await translateSynopsis('English 5', 'it')).toBeNull(); expect(fetchMock).toHaveBeenCalledTimes(4);
    resolvers.forEach(resolve => resolve(new Response(null, { status: 456 }))); await Promise.all(pending);
    const next = translateSynopsis('English 5', 'it'); expect(fetchMock).toHaveBeenCalledTimes(5); resolvers[4](translated());
    expect(await next).toBe('Trama tradotta.');
  });
});

it('supports an explicit Japanese source, including English targets and distinct source cache keys', async () => {
  const fetchMock = vi.fn().mockImplementation(translated); vi.stubGlobal('fetch', fetchMock);
  const { translateText } = await import('../lib/deepl');
  await translateText('日本語', 'en', 'JA');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ source_lang: 'JA', target_lang: 'EN-GB' });
  await translateText('same text', 'it', 'EN');
  await translateText('same text', 'it', 'JA');
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
