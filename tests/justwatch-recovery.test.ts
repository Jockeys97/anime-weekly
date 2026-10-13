import { afterEach, expect, it, vi } from 'vitest';
import { parseJustWatchPage, recoverJustWatchOffers } from '../lib/justwatch-recovery';
function fixture(country = 'IT', imdb = 'tt7441658', monetization = 'FLATRATE', href = 'https://www.netflix.com/title/80238012') {
  const table: unknown[] = [];
  function ref(value: unknown): number {
    const index = table.length; table.push(null);
    table[index] = Array.isArray(value) ? value.map(ref) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, ref(item)])) : value;
    return index;
  }
  const path = country === 'IT' ? '/it/serie-tv/black-clover' : '/us/tv-show/black-clover';
  ref({ __typename: 'Url', fullPath: path, node: { __ref: 'Show:123' } });
  ref({ 'Show:123': { ['content({"country":"'+country+'"})']: { externalIds: { imdbId: imdb } }, ['offers({"country":"'+country+'"})']: [{ country, monetizationType: monetization, package: { packageId: 8, clearName: 'Netflix' }, standardWebURL: href }] } });
  return `<link hreflang="it-IT" href="https://www.justwatch.com/it/serie-tv/black-clover"><script id="__NUXT_DATA__">${JSON.stringify(table)}</script>`;
}
afterEach(() => vi.unstubAllGlobals());
it('reads only verified primary-title regional offers and keeps their links', () => {
  expect(parseJustWatchPage(fixture(), 'https://www.justwatch.com/it/serie-tv/black-clover', 'tt7441658', 'IT')?.providers).toEqual([{ provider_id: 8, provider_name: 'Netflix', logo_path: null, watch_url: 'https://www.netflix.com/title/80238012' }]);
});
it('rejects a same-name page with a different IMDb identity', () => {
  expect(parseJustWatchPage(fixture('IT','tt999'), 'https://www.justwatch.com/it/serie-tv/black-clover', 'tt7441658', 'IT')).toBeNull();
});
it('does not inherit another country’s offers', () => {
  expect(parseJustWatchPage(fixture('US'), 'https://www.justwatch.com/us/tv-show/black-clover', 'tt7441658', 'IT')?.providers).toEqual([]);
});
it.each(['BUY','RENT'])('does not label %s offers as streaming', type => {
  expect(parseJustWatchPage(fixture('IT','tt7441658',type), 'https://www.justwatch.com/it/serie-tv/black-clover', 'tt7441658', 'IT')?.providers).toEqual([]);
});
it.each(['javascript:alert(1)','http://example.com','https://user:password@example.com'])('rejects unsafe offer links %s', href => {
  expect(parseJustWatchPage(fixture('IT','tt7441658','FLATRATE',href), 'https://www.justwatch.com/it/serie-tv/black-clover', 'tt7441658', 'IT')?.providers).toEqual([]);
});
it('follows a verified canonical regional path instead of guessing a localized slug', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(fixture('US'))).mockResolvedValueOnce(new Response(fixture()));
  vi.stubGlobal('fetch',fetch);
  expect((await recoverJustWatchOffers('Black Clover','tt7441658','IT'))?.providers).toHaveLength(1);
  expect(fetch.mock.calls[1][0]).toBe('https://www.justwatch.com/it/serie-tv/black-clover');
});
it('leaves unavailable data retryable when the seed cannot be verified', async () => {
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(fixture('US','tt999'))));
  expect(await recoverJustWatchOffers('Black Clover','tt7441658','IT')).toBeNull();
});
it('fails safely when markup changes', () => {
  expect(parseJustWatchPage('<script id="__NUXT_DATA__">bad</script>','https://www.justwatch.com/it/serie-tv/black-clover','tt7441658','IT')).toBeNull();
});
