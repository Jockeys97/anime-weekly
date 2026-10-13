import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('../lib/tmdb', () => ({ getTMDBTextTranslations: vi.fn() }));
vi.mock('../lib/deepl', () => ({ translateText: vi.fn() }));
import { getTMDBTextTranslations } from '../lib/tmdb';
import { translateText } from '../lib/deepl';
import { getWeeklyText } from '../lib/weekly-text';
import { GET } from '../app/api/weekly-text/route';
beforeEach(() => { vi.resetAllMocks(); vi.mocked(translateText).mockResolvedValue(null); });
it('prefers the requested native translation without consuming DeepL quota', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'it', name: 'Titolo ufficiale', overview: 'Trama italiana.' }, { iso_639_1: 'ja', overview: '日本語' }]);
  expect(await getWeeklyText(10, 'tv', 'it')).toMatchObject({ name: 'Titolo ufficiale', overview: 'Trama italiana.', overviewLanguage: 'it', machine: false });
  expect(translateText).not.toHaveBeenCalled();
});
it('translates Japanese synopses and titles when no localized or English text exists', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'ja', name: '日本語タイトル', overview: '日本語のあらすじ' }]);
  vi.mocked(translateText).mockResolvedValueOnce('Titolo tradotto').mockResolvedValueOnce('Trama tradotta.');
  expect(await getWeeklyText(10, 'tv', 'it')).toMatchObject({ name: 'Titolo tradotto', overview: 'Trama tradotta.', overviewLanguage: 'it', machine: true });
  expect(translateText).toHaveBeenNthCalledWith(1, '日本語タイトル', 'it', 'JA');
  expect(translateText).toHaveBeenNthCalledWith(2, '日本語のあらすじ', 'it', 'JA');
});
it('keeps the official English name and translates its synopsis before the Japanese source', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'en', name: 'Official name', overview: 'English synopsis.' }, { iso_639_1: 'ja', name: '日本語', overview: '日本語' }]);
  vi.mocked(translateText).mockResolvedValue('Trama italiana.');
  expect(await getWeeklyText(10, 'tv', 'it')).toMatchObject({ name: 'Official name', overview: 'Trama italiana.', machine: true });
  expect(translateText).toHaveBeenCalledExactlyOnceWith('English synopsis.', 'it', 'EN');
});
it('can translate Japanese into English too', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'ja', overview: '日本語' }]);
  vi.mocked(translateText).mockResolvedValue('English synopsis.');
  expect(await getWeeklyText(10, 'movie', 'en')).toMatchObject({ overview: 'English synopsis.', overviewLanguage: 'en', machine: true });
  expect(translateText).toHaveBeenCalledWith('日本語', 'en', 'JA');
});
it('keeps and identifies the actual source language when translation is unavailable', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([{ iso_639_1: 'ja', overview: '日本語' }]);
  expect(await getWeeklyText(10, 'tv', 'it')).toMatchObject({ overview: '日本語', overviewLanguage: 'ja', machine: false });
});
it('does not invent missing source text or call the translator', async () => {
  vi.mocked(getTMDBTextTranslations).mockResolvedValue([]);
  expect(await getWeeklyText(10, 'tv', 'it')).toMatchObject({ name: null, overview: null, machine: false });
  expect(translateText).not.toHaveBeenCalled();
});
it.each(['id=0&kind=tv&locale=it', 'id=-1&kind=tv&locale=it', 'id=10&kind=other&locale=it', 'id=10&kind=tv&locale=ja', 'id=2147483648&kind=tv&locale=it'])('rejects invalid canonical lookup parameters: %s', async query => {
  expect((await GET(new Request(`https://example.test/api/weekly-text?${query}`))).status).toBe(400);
  expect(getTMDBTextTranslations).not.toHaveBeenCalled();
});
