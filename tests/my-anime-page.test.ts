import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('server-only', () => ({}));
const { cookies, personalWeek } = vi.hoisted(() => ({ cookies: vi.fn(), personalWeek: vi.fn() }));
vi.mock('next/headers', () => ({ cookies }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('404'); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); }, usePathname: () => '/my-anime' }));
vi.mock('@/lib/my-anime-data', () => ({ getPersonalWeek: personalWeek }));
vi.mock('@/components/MyAnimeContent', () => ({ MyAnimeContent: (props: unknown) => createElement('div', { 'data-props': JSON.stringify(props) }) }));
import MyAnimePage from '../app/[locale]/my-anime/page';
import { HeaderNavigation } from '../components/HeaderNavigation';
import { encryptCookie, tokenCookie } from '../lib/my-anime-auth';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('AUTH_COOKIE_SECRET', 'offline-secret'); vi.stubEnv('MAL_CLIENT_ID', 'mal-id');
  vi.stubEnv('TRAKT_CLIENT_ID', ''); vi.stubEnv('TRAKT_CLIENT_SECRET', '');
  cookies.mockResolvedValue({ get: () => undefined });
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Tests must stay offline'); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('isolated personal page', () => {
  it('calls notFound before reading cookies or data when disabled', async () => {
    vi.stubEnv('AUTH_COOKIE_SECRET', '');
    await expect(MyAnimePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('404');
    expect(cookies).not.toHaveBeenCalled(); expect(personalWeek).not.toHaveBeenCalled();
  });
  it('shows only configured providers and skips all provider fetches until connected', async () => {
    const element = await MyAnimePage({ searchParams: Promise.resolve({}) });
    expect(element.props.providers).toEqual({ trakt: false, mal: true });
    expect(element.props.connected).toEqual({ trakt: false, mal: false });
    expect(element.props.data).toBeNull(); expect(personalWeek).not.toHaveBeenCalled();
  });
  it('enables Trakt with only a client ID and hides unconfigured MAL', async () => {
    vi.stubEnv('TRAKT_CLIENT_ID', 'trakt-id');
    vi.stubEnv('TRAKT_CLIENT_SECRET', undefined);
    vi.stubEnv('MAL_CLIENT_ID', undefined);
    const element = await MyAnimePage({ searchParams: Promise.resolve({}) });
    expect(element.props.providers).toEqual({ trakt: true, mal: false });
    expect(element.props.connected).toEqual({ trakt: false, mal: false });
    expect(element.props.data).toBeNull(); expect(personalWeek).not.toHaveBeenCalled();
  });
  it('redirects an expired session to a cookie-writing refresh endpoint before fetching data', async () => {
    const value = encryptCookie({ accessToken: 'a', refreshToken: 'r', expiresAt: 1 }, tokenCookie('mal'));
    cookies.mockResolvedValue({ get: () => ({ value }) });
    await expect(MyAnimePage({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/api/auth/mal/refresh');
    expect(personalWeek).not.toHaveBeenCalled();
  });
  it('passes connected data to the UI without sending tokens to the client', async () => {
    const token = { accessToken: 'private-access', refreshToken: 'private-refresh', expiresAt: Date.now() + 3600000 };
    cookies.mockResolvedValue({ get: () => ({ value: encryptCookie(token, tokenCookie('mal')) }) });
    personalWeek.mockResolvedValue({ releases: [], followed: 1, unmatched: 0, unavailable: [] });
    const element = await MyAnimePage({ searchParams: Promise.resolve({ auth: 'error' }) });
    expect(element.props.connected.mal).toBe(true); expect(element.props.authError).toBe(true);
    expect(JSON.stringify(element.props)).not.toContain('private-access');
    expect(JSON.stringify(element.props)).not.toContain('private-refresh');
  });
  it('renders the nav from its server-supplied flag without reading cookies', () => {
    expect(renderToStaticMarkup(createElement(HeaderNavigation, { locale: 'it', myAnimeEnabled: false }))).not.toContain('/my-anime');
    const html = renderToStaticMarkup(createElement(HeaderNavigation, { locale: 'it', myAnimeEnabled: true }));
    expect(html).toContain('I miei anime'); expect(html).toContain('href="/my-anime"');
    expect(cookies).not.toHaveBeenCalled();
  });
});
