import { expect, it } from 'vitest';
import { animePath, animeSlug, parseAnimeId } from '../lib/anime-url';

it.each([
  ['Death Note', 'death-note'],
  ['  Pokémon: Élite / déjà vu!! ', 'pokemon-elite-deja-vu'],
  ['Ｆｕｌｌ width', 'full-width'],
  ['日本語 !!!', ''],
  ['a'.repeat(59) + ' bbb', 'a'.repeat(59)],
  ['a'.repeat(80), 'a'.repeat(60)],
])('slugifies %s', (title, expected) => {
  expect(animeSlug(title)).toBe(expected);
  expect(animePath(1535, title)).toBe(`/anime/1535${expected ? `-${expected}` : ''}`);
});

it.each(['1535', '1535-death-note', '1535-OLD_slug!'])('parses the leading numeric ID in %s', value => {
  expect(parseAnimeId(value)).toBe(1535);
});

it.each(['0', '01', '-1', '1.5', 'bad-1535', '2147483648', '9007199254740992'])('rejects invalid ID %s', value => {
  expect(parseAnimeId(value)).toBeNull();
});
