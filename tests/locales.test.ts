import { describe, expect, it, vi } from 'vitest';
import { getDictionary } from '../lib/i18n';
import { isLocale, locales, negotiateLocale } from '../lib/locales';

describe('visitor language selection', () => {
  it.each([
    ['it-IT,it;q=0.9,en;q=0.8', 'it'],
    ['es-MX,es;q=0.9,en-US;q=0.8', 'es'],
    ['en;q=0.4,fr-CA;q=0.9', 'fr'],
    ['pt-BR,pt;q=0.8', 'pt'],
    ['de-DE,de;q=0.9', 'de'],
    ['ja-JP,it;q=0.8', 'it'],
    ['it;q=0,en;q=1', 'en'],
    ['it;q=bad,fr;q=0.7', 'fr'],
    ['ja-JP,*;q=0.8', 'en'],
    [null, 'en'],
  ])('resolves %s to %s', (header, locale) => expect(negotiateLocale(header)).toBe(locale));
  it('prioritizes an explicit saved choice and ignores invalid cookies', () => {
    expect(negotiateLocale('it-IT', 'es')).toBe('es');
    expect(negotiateLocale('it-IT', 'invalid')).toBe('it');
    expect(isLocale('it-IT')).toBe(false);
  });
  it.each(locales)('provides complete interface sections and country names for %s', locale => {
    const dictionary = getDictionary(locale);
    const english = getDictionary('en');
    expect(Object.keys(dictionary)).toEqual(Object.keys(english));
    for (const section of ['nav', 'hero', 'week', 'state', 'title', 'catalog', 'footer', 'language', 'notFound', 'error', 'sponsor', 'metadata'] as const) {
      expect(Object.keys(dictionary[section]).sort()).toEqual(Object.keys(english[section]).sort());
    }
    expect(Object.values(dictionary.regions).every(value => typeof value === 'string' && value.length > 0)).toBe(true);
  });
  it('localizes the weekly guide and catalog for an Italian visitor', () => {
    const d = getDictionary(negotiateLocale('it-IT,it;q=0.9'));
    expect(d.nav.current).toBe('Questa settimana');
    expect(d.catalog.search).toBe('Cerca');
    expect(d.regions.ES).toBe('Spagna');
  });
});

it('uses identical country names even when runtime region naming differs', () => {
  const names = vi.spyOn(Intl, 'DisplayNames').mockImplementation(() => { throw new Error('Different browser ICU'); });
  try {
    expect(getDictionary('it').regions.HK).toBe('Hong Kong');
    expect(getDictionary('fr').regions.IT).toBe('Italie');
  } finally { names.mockRestore(); }
});
