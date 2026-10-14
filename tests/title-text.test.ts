import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { cleanSynopsis, displayTitle } from '../lib/title-text';
import { animeDescription } from '../lib/anilist';
it.each(['Ranma1/2', 'Ranma 1/2', 'Ranma½', 'Ranma ½'])('displays %s as Ranma ½', name => expect(displayTitle(name)).toBe('Ranma ½'));
it('removes source/rewrite/note artifacts while retaining story text and paragraphs', () => {
  const input = 'A story. (Source: Crunchyroll)\n\nAnother paragraph. [Written by MAL Rewrite]\nNote: Broadcast delayed.\nThe end.';
  expect(cleanSynopsis(input)).toBe('A story.\n\nAnother paragraph.\nThe end.');
  expect(animeDescription('<p>A story.</p><br>(Source: Crunchyroll)<br>[Written by MAL Rewrite]<br>Note: Extra info.')).toBe('A story.');
});
