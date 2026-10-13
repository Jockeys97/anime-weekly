import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { LocalizedSynopsis } from '../components/LocalizedSynopsis';
afterEach(() => { vi.unstubAllGlobals(); });
it('hides English while translation is pending and renders a supplied server translation immediately', () => {
  const props = { original: 'English original', titles: ['Example'], anilistId: 1, locale: 'it' as const, kind: 'tv' as const };
  const pending = renderToStaticMarkup(React.createElement(LocalizedSynopsis, props));
  expect(pending).not.toContain('English original');
  expect(pending).toContain('role="status"');
  const translated = renderToStaticMarkup(React.createElement(LocalizedSynopsis, { ...props, initial: { synopsis: 'Trama italiana', language: 'it', source: 'deepl' } }));
  expect(translated).toContain('Trama italiana');
  expect(translated).not.toContain('English original');
  expect(translated).toContain('DeepL');
});
it('shows the labelled original only after a failed translation lookup', () => {
  const html = renderToStaticMarkup(React.createElement(LocalizedSynopsis, { original: 'English original', titles: ['Example'], anilistId: 1, locale: 'it', kind: 'tv', initial: { synopsis: null, language: null, source: null } }));
  expect(html).toContain('English original');
  expect(html).toContain('Traduzione non disponibile');
});
it('shares completed and in-flight requests across client remounts', async () => {
  vi.resetModules();
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ synopsis: 'Trama', language: 'it', source: 'tmdb' }));
  vi.stubGlobal('fetch', fetchMock);
  const { loadSynopsis } = await import('../lib/synopsis-client');
  const first = loadSynopsis('locale=it&anilist=1');
  expect(loadSynopsis('locale=it&anilist=1')).toBe(first);
  await first;
  await loadSynopsis('locale=it&anilist=1');
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
