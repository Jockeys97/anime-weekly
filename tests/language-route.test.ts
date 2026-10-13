import { afterEach, describe, expect, it, vi } from 'vitest';
const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set }) }));
import { POST } from '../app/api/language/route';
afterEach(() => vi.clearAllMocks());
describe('manual language preference', () => {
  it('persists only a supported language in a scoped cookie', async () => {
    const response = await POST(new Request('https://example.com/api/language', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' }, body: JSON.stringify({ locale: 'it' }) }));
    expect(response.status).toBe(200);
    expect(set).toHaveBeenCalledWith('anime-language', 'it', expect.objectContaining({ httpOnly: true, sameSite: 'lax', secure: true, path: '/' }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['xx', 'it-IT', '../it'])('rejects unsupported %s without saving it', async locale => {
    expect((await POST(new Request('https://example.com/api/language', { method: 'POST', body: JSON.stringify({ locale }) }))).status).toBe(400);
    expect(set).not.toHaveBeenCalled();
  });
  it('rejects cross-origin writes', async () => {
    expect((await POST(new Request('https://example.com/api/language', { method: 'POST', headers: { Origin: 'https://elsewhere.test' }, body: JSON.stringify({ locale: 'it' }) }))).status).toBe(403);
    expect(set).not.toHaveBeenCalled();
  });
});
