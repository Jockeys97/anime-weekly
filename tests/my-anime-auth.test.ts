import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
vi.mock('server-only', () => ({}));
const { upstream } = vi.hoisted(() => ({ upstream: vi.fn() }));
vi.mock('@/lib/rate-limited-fetch', () => ({ throttle: () => upstream }));
import { myAnimeConfig } from '../lib/my-anime-config';
import { createOAuthFlow, decryptCookie, encryptCookie, flowCookie, oauthCallback, oauthLogin, oauthLogout,
  oauthRefresh, readToken, tokenCookie, validOAuthState, type AuthToken, type OAuthFlow } from '../lib/my-anime-auth';

const origin = 'https://anime.example';
const reader = (provider: 'trakt' | 'mal', flow: OAuthFlow) => ({ get: (name: string) => name === flowCookie(provider)
  ? { value: encryptCookie(flow, name) } : undefined });
beforeEach(() => {
  vi.stubEnv('AUTH_COOKIE_SECRET', 'offline-secret-with-at-least-thirty-two-bytes');
  vi.stubEnv('TRAKT_CLIENT_ID', 'trakt-id'); vi.stubEnv('TRAKT_CLIENT_SECRET', 'trakt-secret');
  vi.stubEnv('MAL_CLIENT_ID', 'mal-id'); vi.stubEnv('MAL_CLIENT_SECRET', '');
  upstream.mockReset();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must stay offline'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('personal anime feature gate', () => {
  it.each([
    [{}, { enabled: false, trakt: false, mal: false }],
    [{ TRAKT_CLIENT_ID: 'id', TRAKT_CLIENT_SECRET: 'secret', MAL_CLIENT_ID: 'id' }, { enabled: false, trakt: false, mal: false }],
    [{ AUTH_COOKIE_SECRET: 'secret' }, { enabled: false, trakt: false, mal: false }],
    [{ AUTH_COOKIE_SECRET: 'secret', TRAKT_CLIENT_ID: 'id' }, { enabled: true, trakt: true, mal: false }],
    [{ AUTH_COOKIE_SECRET: 'secret', TRAKT_CLIENT_ID: ' ', TRAKT_CLIENT_SECRET: 'secret' }, { enabled: false, trakt: false, mal: false }],
    [{ AUTH_COOKIE_SECRET: 'secret', TRAKT_CLIENT_ID: 'id', TRAKT_CLIENT_SECRET: 'secret' }, { enabled: true, trakt: true, mal: false }],
    [{ AUTH_COOKIE_SECRET: 'secret', MAL_CLIENT_ID: 'id' }, { enabled: true, trakt: false, mal: true }],
    [{ AUTH_COOKIE_SECRET: ' ', MAL_CLIENT_ID: 'id' }, { enabled: false, trakt: false, mal: false }],
  ])('gates using only server configuration: %j', (env, expected) => expect(myAnimeConfig(env)).toEqual(expected));
  it.each(['trakt', 'mal'] as const)('returns 404 on all %s auth actions when disabled', async provider => {
    vi.stubEnv('AUTH_COOKIE_SECRET', '');
    const request = new Request(`${origin}/api/auth/${provider}/callback`), cookies = { get: vi.fn() };
    expect(oauthLogin(request, provider).status).toBe(404);
    expect((await oauthCallback(request, provider, cookies)).status).toBe(404);
    expect((await oauthLogout(request, provider, cookies)).status).toBe(404);
    expect((await oauthRefresh(request, provider, cookies)).status).toBe(404);
    expect(cookies.get).not.toHaveBeenCalled(); expect(upstream).not.toHaveBeenCalled();
  });
});

describe('encrypted cookies and OAuth flow', () => {
  it('roundtrips without exposing tokens and rejects tampering, other keys and contexts', () => {
    const token: AuthToken = { accessToken: 'private-access', refreshToken: 'private-refresh', expiresAt: Date.now() + 3600000 };
    const name = tokenCookie('trakt'), encoded = encryptCookie(token, name);
    expect(encoded).not.toContain(token.accessToken);
    expect(readToken('trakt', encoded)).toEqual(token);
    expect(encryptCookie(token, name)).not.toEqual(encoded);
    const bytes = Buffer.from(encoded, 'base64url'); bytes[bytes.length - 1] ^= 1;
    expect(decryptCookie(bytes.toString('base64url'), name)).toBeNull();
    expect(decryptCookie(encoded, name, 'another secret')).toBeNull();
    expect(readToken('mal', encoded)).toBeNull();
    expect(readToken('trakt', 'bad')).toBeNull();
  });
  it.each(['trakt', 'mal'] as const)('creates unique random %s states and PKCE verifiers of valid length', provider => {
    const flow = createOAuthFlow(provider, 1000), other = createOAuthFlow(provider, 1000);
    expect(flow.state).not.toEqual(other.state); expect(flow.verifier).not.toEqual(other.verifier);
    expect(flow.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(validOAuthState(flow, flow.state, provider, 1001)).toBe(true);
    expect(validOAuthState(flow, flow.state, provider, 601000)).toBe(false);
    expect(validOAuthState(flow, 'different', provider, 1001)).toBe(false);
    expect(validOAuthState({ ...flow, verifier: 'short' }, flow.state, provider, 1001)).toBe(false);
  });
  it.each([['trakt', undefined], ['trakt', 'trakt-secret'], ['mal', undefined]] as const)('sets a secure encrypted state cookie and exact %s authorize parameters with secret %j', (provider, secret) => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', secret);
    const response = oauthLogin(new Request(`${origin}/api/auth/${provider}/login`), provider);
    const url = new URL(response.headers.get('location')!);
    expect(url.origin).toBe(provider === 'trakt' ? 'https://trakt.tv' : 'https://myanimelist.net');
    expect(url.searchParams.get('redirect_uri')).toBe(`${origin}/api/auth/${provider}/callback`);
    expect(url.searchParams.get('response_type')).toBe('code');
    const cookie = response.cookies.get(flowCookie(provider))!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
    const flow = decryptCookie<OAuthFlow>(cookie.value, cookie.name)!;
    expect(flow.state).toBe(url.searchParams.get('state'));
    expect(flow.verifier).toMatch(/^[A-Za-z0-9._~-]{43,128}$/);
    expect(cookie.value).not.toContain(flow.verifier);
    expect(url.searchParams.has('client_secret')).toBe(false);
    if (provider === 'mal') {
      expect(url.searchParams.get('code_challenge')).toBe(flow.verifier);
      expect(url.searchParams.get('code_challenge_method')).toBe('plain');
    } else {
      expect(url.searchParams.get('code_challenge')).toBe(createHash('sha256').update(flow.verifier!).digest('base64url'));
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(url.searchParams.get('code_challenge')).not.toBe(flow.verifier);
      expect(url.searchParams.has('code_verifier')).toBe(false);
    }
  });
  it.each(['trakt', 'mal'] as const)('rejects a %s callback state mismatch before exchanging a code', async provider => {
    const flow = createOAuthFlow(provider);
    const response = await oauthCallback(new Request(`${origin}/api/auth/${provider}/callback?code=code&state=wrong`), provider, reader(provider, flow));
    expect(response.status).toBe(400); expect(upstream).not.toHaveBeenCalled();
    expect(response.cookies.get(flowCookie(provider))?.maxAge).toBe(0);
    expect(response.cookies.get(tokenCookie(provider))).toBeUndefined();
  });
  it.each([['trakt', undefined], ['trakt', ''], ['trakt', 'trakt-secret'], ['mal', undefined]] as const)('exchanges %s codes with secret %j and saves only encrypted tokens', async (provider, secret) => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', secret);
    const flow = createOAuthFlow(provider);
    upstream.mockResolvedValue(Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 }));
    const response = await oauthCallback(new Request(`${origin}/api/auth/${provider}/callback?code=code&state=${flow.state}`), provider, reader(provider, flow));
    expect(response.headers.get('location')).toBe(`${origin}/my-anime`);
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe(provider === 'trakt' ? 'https://api.trakt.tv/oauth/token' : 'https://myanimelist.net/v1/oauth2/token');
    expect(init.cache).toBe('no-store');
    const payload = provider === 'trakt' ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    expect(payload).toMatchObject({ grant_type: 'authorization_code', code: 'code', code_verifier: flow.verifier,
      client_id: `${provider}-id`, redirect_uri: `${origin}/api/auth/${provider}/callback` });
    if (provider === 'trakt' && secret) expect(payload.client_secret).toBe(secret);
    else expect(payload).not.toHaveProperty('client_secret');
    const cookie = response.cookies.get(tokenCookie(provider))!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    expect(readToken(provider, cookie.value)).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' });
    expect(response.cookies.get(flowCookie(provider))?.maxAge).toBe(0);
  });
  it('uses the optional MAL client secret when configured', async () => {
    vi.stubEnv('MAL_CLIENT_SECRET', 'optional-secret');
    const flow = createOAuthFlow('mal');
    upstream.mockResolvedValue(Response.json({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }));
    await oauthCallback(new Request(`${origin}/api/auth/mal/callback?code=c&state=${flow.state}`), 'mal', reader('mal', flow));
    expect(new URLSearchParams(upstream.mock.calls[0][1].body).get('client_secret')).toBe('optional-secret');
  });
  it.each(['missing', 'expired', 'tampered'] as const)('rejects %s callback flow without upstream calls', async kind => {
    const flow = createOAuthFlow('trakt');
    if (kind === 'expired') flow.expiresAt = 0;
    const cookies = kind === 'missing' ? { get: () => undefined } : kind === 'tampered' ? { get: () => ({ value: 'tampered' }) } : reader('trakt', flow);
    expect((await oauthCallback(new Request(`${origin}/api/auth/trakt/callback?code=c&state=${flow.state}`), 'trakt', cookies)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([undefined, 'short', 'a'.repeat(129), '!'.repeat(43)])('rejects a Trakt flow with missing or invalid verifier %j before exchanging a code', async verifier => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', undefined);
    const flow = { ...createOAuthFlow('trakt'), verifier };
    const response = await oauthCallback(new Request(`${origin}/api/auth/trakt/callback?code=c&state=${flow.state}`), 'trakt', reader('trakt', flow));
    expect(response.status).toBe(400);
    expect(response.cookies.get(flowCookie('trakt'))?.maxAge).toBe(0);
    expect(response.cookies.get(tokenCookie('trakt'))).toBeUndefined();
    expect(upstream).not.toHaveBeenCalled();
  });
  it('fails a Trakt callback when the verifier does not match the authorized challenge', async () => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', undefined);
    const login = oauthLogin(new Request(`${origin}/api/auth/trakt/login`), 'trakt');
    const challenge = new URL(login.headers.get('location')!).searchParams.get('code_challenge');
    const cookie = login.cookies.get(flowCookie('trakt'))!;
    const flow = decryptCookie<OAuthFlow>(cookie.value, cookie.name)!;
    // Model provider-side S256 validation against the original authorization.
    upstream.mockImplementation(async (_url, init) => {
      const payload = JSON.parse(init.body);
      return createHash('sha256').update(payload.code_verifier).digest('base64url') === challenge
        ? Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
        : Response.json({ error: 'invalid_grant' }, { status: 400 });
    });
    const mismatched = { ...flow, verifier: createOAuthFlow('trakt').verifier };
    const response = await oauthCallback(new Request(`${origin}/api/auth/trakt/callback?code=c&state=${flow.state}`), 'trakt', reader('trakt', mismatched));
    expect(upstream).toHaveBeenCalledOnce();
    expect(response.headers.get('location')).toBe(`${origin}/my-anime?auth=error`);
    expect(response.cookies.get(flowCookie('trakt'))?.maxAge).toBe(0);
    expect(response.cookies.get(tokenCookie('trakt'))).toBeUndefined();
  });
  it('shows a graceful connection error after an upstream failure or user denial', async () => {
    const flow = createOAuthFlow('mal'); upstream.mockRejectedValue(new Error('offline'));
    const response = await oauthCallback(new Request(`${origin}/api/auth/mal/callback?code=c&state=${flow.state}`), 'mal', reader('mal', flow));
    expect(response.headers.get('location')).toBe(`${origin}/my-anime?auth=error`);
    expect(response.cookies.get(flowCookie('mal'))?.maxAge).toBe(0);
    upstream.mockClear();
    await oauthCallback(new Request(`${origin}/api/auth/mal/callback?error=access_denied&state=${flow.state}`), 'mal', reader('mal', flow));
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('refresh and logout', () => {
  it.each([['trakt', undefined], ['trakt', 'trakt-secret'], ['mal', undefined]] as const)('refreshes expired %s sessions with secret %j and persists rotated tokens', async (provider, secret) => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', secret);
    const token = { accessToken: 'expired', refreshToken: `rotate-${provider}-${secret}`, expiresAt: Date.now() - 1 };
    const cookies = { get: () => ({ value: encryptCookie(token, tokenCookie(provider)) }) };
    upstream.mockResolvedValue(Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }));
    const response = await oauthRefresh(new Request(`${origin}/api/auth/${provider}/refresh`), provider, cookies);
    expect(readToken(provider, response.cookies.get(tokenCookie(provider))?.value)).toMatchObject({ accessToken: 'new-access', refreshToken: 'new-refresh' });
    const init = upstream.mock.calls[0][1];
    const payload = provider === 'trakt' ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body));
    expect(payload).toMatchObject({ grant_type: 'refresh_token', refresh_token: token.refreshToken });
    expect(payload).not.toHaveProperty('code_verifier');
    if (provider === 'trakt' && secret) expect(payload.client_secret).toBe(secret);
    else expect(payload).not.toHaveProperty('client_secret');
  });
  it('clears a failed refresh to avoid redirect loops', async () => {
    upstream.mockRejectedValue(new Error('offline'));
    const cookies = { get: () => ({ value: encryptCookie({ accessToken: 'a', refreshToken: 'bad-refresh', expiresAt: 1 }, tokenCookie('mal')) }) };
    const response = await oauthRefresh(new Request(`${origin}/api/auth/mal/refresh`), 'mal', cookies);
    expect(response.cookies.get(tokenCookie('mal'))?.maxAge).toBe(0);
    expect(response.headers.get('location')).toContain('auth=error');
  });
  it.each([null, 'https://other.example', 'null'])('rejects logout Origin %s without changing cookies or revoking', async originHeader => {
    const response = await oauthLogout(new Request(`${origin}/api/auth/trakt/logout`, { method: 'POST', headers: originHeader ? { Origin: originHeader } : {} }), 'trakt', { get: vi.fn() });
    expect(response.status).toBe(403); expect(response.cookies.getAll()).toEqual([]); expect(upstream).not.toHaveBeenCalled();
  });
  it.each([undefined, 'trakt-secret'])('rejects GET logout and succeeds locally when Trakt revocation fails with secret %j', async secret => {
    vi.stubEnv('TRAKT_CLIENT_SECRET', secret);
    const cookies = { get: () => ({ value: encryptCookie({ accessToken: 'a', refreshToken: 'r', expiresAt: Date.now() + 3600000 }, tokenCookie('trakt')) }) };
    expect((await oauthLogout(new Request(`${origin}/api/auth/trakt/logout`), 'trakt', cookies)).status).toBe(405);
    upstream.mockRejectedValue(new Error('offline'));
    const response = await oauthLogout(new Request(`${origin}/api/auth/trakt/logout`, { method: 'POST', headers: { Origin: origin } }), 'trakt', cookies);
    expect(response.cookies.get(tokenCookie('trakt'))).toMatchObject({ maxAge: 0, secure: true, httpOnly: true });
    expect(upstream.mock.calls[0][0]).toBe('https://api.trakt.tv/oauth/revoke');
    const payload = JSON.parse(upstream.mock.calls[0][1].body);
    expect(payload).toMatchObject({ token: 'a', client_id: 'trakt-id' });
    expect(payload).not.toHaveProperty('code_verifier');
    if (secret) expect(payload.client_secret).toBe(secret);
    else expect(payload).not.toHaveProperty('client_secret');
    expect(response.headers.get('location')).toBe(`${origin}/my-anime`);
  });
});
