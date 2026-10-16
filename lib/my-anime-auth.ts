import 'server-only';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { myAnimeConfig, type AnimeProvider } from '@/lib/my-anime-config';
import { throttle } from '@/lib/rate-limited-fetch';
import { traktHeaders } from '@/lib/trakt-headers';
import { siteUrl } from '@/lib/seo';

export const traktFetch = throttle(350);
export const malFetch = throttle(1000);
export const tokenCookie = (provider: AnimeProvider) => `__Host-my-anime-${provider}`;
export const flowCookie = (provider: AnimeProvider) => `__Secure-my-anime-${provider}-state`;
const secureCookie = { httpOnly: true, secure: true, sameSite: 'lax' as const };
const SESSION_SECONDS = 90 * 86400;
export interface AuthToken { accessToken: string; refreshToken: string; expiresAt: number }
export interface OAuthFlow { state: string; verifier?: string; expiresAt: number }
export function tokenNeedsRefresh(token: AuthToken, now = Date.now()): boolean { return token.expiresAt <= now + 60000; }

function cookieKey(secret = process.env.AUTH_COOKIE_SECRET): Buffer {
  if (!secret?.trim()) throw new Error('AUTH_COOKIE_SECRET is required');
  return createHash('sha256').update(secret).digest();
}
export function encryptCookie(value: unknown, context: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', cookieKey(secret), iv);
  cipher.setAAD(Buffer.from(context));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
export function decryptCookie<T>(value: string | undefined, context: string, secret?: string): T | null {
  try {
    if (!value || value.length > 4096 || !/^[\w-]+$/.test(value)) return null;
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.length < 29) return null;
    const decipher = createDecipheriv('aes-256-gcm', cookieKey(secret), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')) as T;
  } catch { return null; }
}
export function readToken(provider: AnimeProvider, value?: string): AuthToken | null {
  const token = decryptCookie<AuthToken>(value, tokenCookie(provider));
  return token && typeof token.accessToken === 'string' && token.accessToken.length > 0
    && typeof token.refreshToken === 'string' && token.refreshToken.length > 0
    && Number.isSafeInteger(token.expiresAt) ? token : null;
}
export function createOAuthFlow(_provider: AnimeProvider, now = Date.now()): OAuthFlow {
  return { state: randomBytes(32).toString('base64url'), expiresAt: now + 600000,
    verifier: randomBytes(64).toString('base64url') };
}
export function validOAuthState(flow: OAuthFlow | null, state: string | null, _provider: AnimeProvider, now = Date.now()): boolean {
  if (!flow || !Number.isSafeInteger(flow.expiresAt) || flow.expiresAt <= now || typeof flow.state !== 'string'
    || !state || state.length > 128 || typeof flow.verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(flow.verifier)) return false;
  const expected = Buffer.from(flow.state), actual = Buffer.from(state);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
const callbackUri = (origin: string, provider: AnimeProvider) => {
  const canonical = siteUrl();
  const request = new URL(origin);
  // Keep state cookies and callback origins aligned on legacy/preview hosts.
  const base = request.host === canonical.host ? canonical.origin : request.origin;
  return `${base}/api/auth/${provider}/callback`;
};
const flowPath = (provider: AnimeProvider) => `/api/auth/${provider}`;
function clearFlow(response: NextResponse, provider: AnimeProvider) {
  response.cookies.set(flowCookie(provider), '', { ...secureCookie, path: flowPath(provider), maxAge: 0 });
}
function clearToken(response: NextResponse, provider: AnimeProvider) {
  response.cookies.set(tokenCookie(provider), '', { ...secureCookie, path: '/', maxAge: 0 });
}
function saveToken(response: NextResponse, provider: AnimeProvider, token: AuthToken) {
  response.cookies.set(tokenCookie(provider), encryptCookie(token, tokenCookie(provider)), { ...secureCookie, path: '/', maxAge: SESSION_SECONDS });
}
function privateResponse(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
function errorResponse(status: number) {
  const response = privateResponse(new NextResponse(null, { status }));
  if (status === 405) response.headers.set('Allow', 'POST');
  return response;
}
function returnToPage(origin: string, failed = false) {
  return privateResponse(NextResponse.redirect(`${origin}/my-anime${failed ? '?auth=error' : ''}`, 303));
}
type CookieReader = { get(name: string): { value: string } | undefined };

const oauthErrorCodes = new Set(['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client',
  'unsupported_grant_type', 'invalid_scope', 'access_denied', 'redirect_uri_mismatch', 'invalid_redirect_uri',
  'temporarily_unavailable', 'server_error']);
function safeProviderError(value: unknown): string {
  // Vendor descriptions can echo credentials or codes. Log known OAuth error
  // identifiers only; never log response bodies or arbitrary exception text.
  return typeof value === 'string' && oauthErrorCodes.has(value) ? value : 'unknown_provider_error';
}
class OAuthExchangeError extends Error {
  constructor(readonly diagnostic: { stage: string; httpStatus?: number; providerError?: string; responseType?: string; challenge?: boolean }) {
    super('OAuth token exchange failed');
  }
}
function logOAuthFailure(provider: AnimeProvider, operation: 'callback' | 'refresh', origin: string,
  error: unknown, stage = 'session_cookie_write_failed') {
  console.error('[my-anime-auth] OAuth failure', {
    provider, operation, redirectUri: callbackUri(origin, provider),
    ...(error instanceof OAuthExchangeError ? error.diagnostic : { stage }),
  });
}

export function oauthLogin(request: Request, provider: AnimeProvider) {
  if (!myAnimeConfig()[provider]) return errorResponse(404);
  const flow = createOAuthFlow(provider), origin = new URL(request.url).origin;
  const url = new URL(provider === 'trakt' ? 'https://trakt.tv/oauth/authorize' : 'https://myanimelist.net/v1/oauth2/authorize');
  url.search = new URLSearchParams({ response_type: 'code', client_id: provider === 'trakt' ? process.env.TRAKT_CLIENT_ID! : process.env.MAL_CLIENT_ID!,
    redirect_uri: callbackUri(origin, provider), state: flow.state,
    code_challenge: provider === 'trakt' ? createHash('sha256').update(flow.verifier!).digest('base64url') : flow.verifier!,
    code_challenge_method: provider === 'trakt' ? 'S256' : 'plain' }).toString();
  const response = privateResponse(NextResponse.redirect(url));
  response.cookies.set(flowCookie(provider), encryptCookie(flow, flowCookie(provider)), { ...secureCookie, path: flowPath(provider), maxAge: 600 });
  return response;
}

async function exchangeToken(provider: AnimeProvider, origin: string, grant: Record<string, string>, previousRefresh?: string): Promise<AuthToken> {
  const credentials = provider === 'trakt'
    ? { client_id: process.env.TRAKT_CLIENT_ID!, ...(process.env.TRAKT_CLIENT_SECRET?.trim() ? { client_secret: process.env.TRAKT_CLIENT_SECRET } : {}) }
    : { client_id: process.env.MAL_CLIENT_ID!, ...(process.env.MAL_CLIENT_SECRET ? { client_secret: process.env.MAL_CLIENT_SECRET } : {}) };
  const payload = { ...credentials, redirect_uri: callbackUri(origin, provider), ...grant };
  let response: Response;
  try { response = await (provider === 'trakt' ? traktFetch : malFetch)(provider === 'trakt'
    ? 'https://api.trakt.tv/oauth/token' : 'https://myanimelist.net/v1/oauth2/token', {
    method: 'POST', cache: 'no-store', next: undefined,
    headers: provider === 'trakt' ? traktHeaders() : { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: provider === 'trakt' ? JSON.stringify(payload) : new URLSearchParams(payload).toString(),
  }, 12000); }
  catch (error) {
    throw new OAuthExchangeError({ stage: error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
      ? 'token_request_timeout' : 'token_request_failed' });
  }
  const contentType = response.headers.get('content-type') ?? '';
  const responseType = contentType.includes('json') ? 'json' : contentType.includes('html') ? 'html' : 'other';
  const diagnostic = { httpStatus: response.status, responseType };
  const body: unknown = await response.json().catch(() => null);
  const data = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : null;
  if (!response.ok) throw new OAuthExchangeError({ ...diagnostic, stage: 'token_http_error', providerError: safeProviderError(data?.error),
    challenge: response.headers.get('cf-mitigated') === 'challenge' });
  if (!data) throw new OAuthExchangeError({ ...diagnostic, stage: 'token_response_not_json_object' });
  const refreshToken = data.refresh_token ?? previousRefresh;
  if (typeof data.access_token !== 'string' || !data.access_token || typeof refreshToken !== 'string' || !refreshToken
    || typeof data.expires_in !== 'number' || !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0) throw new OAuthExchangeError({ ...diagnostic, stage: 'token_response_invalid_fields' });
  const issuedAt = provider === 'trakt' && typeof data.created_at === 'number' ? data.created_at * 1000 : Date.now();
  const token = { accessToken: data.access_token, refreshToken, expiresAt: Math.floor(issuedAt + data.expires_in * 1000) };
  if (!Number.isSafeInteger(token.expiresAt) || token.expiresAt <= Date.now()) throw new OAuthExchangeError({ ...diagnostic, stage: 'token_response_expired' });
  return token;
}
export async function oauthCallback(request: Request, provider: AnimeProvider, cookies: CookieReader) {
  if (!myAnimeConfig()[provider]) return errorResponse(404);
  const url = new URL(request.url);
  const flow = decryptCookie<OAuthFlow>(cookies.get(flowCookie(provider))?.value, flowCookie(provider));
  // Reject before any upstream request; consume the flow even on failure.
  if (!validOAuthState(flow, url.searchParams.get('state'), provider)) {
    logOAuthFailure(provider, 'callback', url.origin, null, !flow ? 'state_cookie_missing_or_unreadable'
      : flow.expiresAt <= Date.now() ? 'state_expired' : 'state_invalid');
    const response = errorResponse(400); clearFlow(response, provider); return response;
  }
  const code = url.searchParams.get('code');
  const response = returnToPage(url.origin, !code || url.searchParams.has('error'));
  clearFlow(response, provider);
  if (!code || url.searchParams.has('error')) {
    logOAuthFailure(provider, 'callback', url.origin, new OAuthExchangeError({ stage: !code ? 'authorization_code_missing' : 'authorization_rejected',
      ...(url.searchParams.has('error') ? { providerError: safeProviderError(url.searchParams.get('error')) } : {}) }));
    return response;
  }
  try {
    saveToken(response, provider, await exchangeToken(provider, url.origin, { grant_type: 'authorization_code', code,
      code_verifier: flow!.verifier! }));
    return response;
  } catch (error) { logOAuthFailure(provider, 'callback', url.origin, error); const failed = returnToPage(url.origin, true); clearFlow(failed, provider); return failed; }
}

// Coalesce rotating refresh tokens within one server instance, including brief
// overlap between tabs. Keys contain only hashes; expired entries are bounded.
const refreshes = new Map<string, { until: number; promise: Promise<AuthToken> }>();
async function refreshToken(provider: AnimeProvider, origin: string, token: AuthToken) {
  const key = `${provider}:${origin}:${tokenHash(token.refreshToken)}`;
  for (const [key, entry] of refreshes) if (entry.until <= Date.now()) refreshes.delete(key);
  const existing = refreshes.get(key);
  if (existing) return existing.promise;
  const promise = exchangeToken(provider, origin, { grant_type: 'refresh_token', refresh_token: token.refreshToken }, token.refreshToken);
  if (refreshes.size >= 100) refreshes.delete(refreshes.keys().next().value!);
  refreshes.set(key, { until: Date.now() + 30000, promise });
  try { return await promise; } catch (error) { refreshes.delete(key); throw error; }
}
export async function oauthRefresh(request: Request, provider: AnimeProvider, cookies: CookieReader) {
  if (!myAnimeConfig()[provider]) return errorResponse(404);
  const origin = new URL(request.url).origin;
  const token = readToken(provider, cookies.get(tokenCookie(provider))?.value);
  if (!token) { logOAuthFailure(provider, 'refresh', origin, null, 'session_missing_or_unreadable'); const response = returnToPage(origin, true); clearToken(response, provider); return response; }
  if (!tokenNeedsRefresh(token)) return returnToPage(origin);
  try {
    const response = returnToPage(origin);
    saveToken(response, provider, await refreshToken(provider, origin, token));
    return response;
  } catch (error) { logOAuthFailure(provider, 'refresh', origin, error); const response = returnToPage(origin, true); clearToken(response, provider); return response; }
}
export async function oauthLogout(request: Request, provider: AnimeProvider, cookies: CookieReader) {
  if (!myAnimeConfig()[provider]) return errorResponse(404);
  if (request.method !== 'POST') return errorResponse(405);
  const origin = new URL(request.url).origin;
  if (request.headers.get('origin') !== origin) return errorResponse(403);
  const token = readToken(provider, cookies.get(tokenCookie(provider))?.value);
  const response = returnToPage(origin); clearToken(response, provider); clearFlow(response, provider);
  if (provider === 'trakt' && token) {
    try {
      await traktFetch('https://api.trakt.tv/oauth/revoke', { method: 'POST', cache: 'no-store', next: undefined,
        headers: traktHeaders(token.accessToken), body: JSON.stringify({ token: token.accessToken,
          client_id: process.env.TRAKT_CLIENT_ID,
          ...(process.env.TRAKT_CLIENT_SECRET?.trim() ? { client_secret: process.env.TRAKT_CLIENT_SECRET } : {}) }) }, 5000);
    } catch { /* Local logout succeeds even when remote revocation fails. */ }
  }
  return response;
}
