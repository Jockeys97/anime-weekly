import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { pickTitleLogos } from '../lib/tmdb';
it('keeps the best logo per language, preferring PNG, votes, then width', () => {
  expect(pickTitleLogos([
    { file_path: '/ja1.png', iso_639_1: 'ja', vote_average: 5.3, width: 800 },
    { file_path: '/ja2.png', iso_639_1: 'ja', vote_average: 5.3, width: 1200 },
    { file_path: '/en1.svg', iso_639_1: 'en', vote_average: 9 },
    { file_path: '/en2.png', iso_639_1: 'en', vote_average: 1 },
    { file_path: '/none.png', iso_639_1: null, vote_average: 10 },
  ])).toEqual({ ja: 'https://image.tmdb.org/t/p/w500/ja2.png', en: 'https://image.tmdb.org/t/p/w500/en2.png' });
});
it('serves SVG logos at their original path and rejects unexpected paths', () => {
  expect(pickTitleLogos([{ file_path: '/it.svg', iso_639_1: 'it' }])).toEqual({ it: 'https://image.tmdb.org/t/p/original/it.svg' });
  expect(pickTitleLogos([{ file_path: '/../x.png', iso_639_1: 'en' }, { file_path: '/x.gif', iso_639_1: 'en' }, { file_path: '/x.png', iso_639_1: 'english' }])).toEqual({});
});
