import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import type { AniListAnime } from '@/lib/anilist';
import type { DetailAvailability } from '@/lib/detail-availability';

const formats: Record<string, string> = {
  TV: 'Serie TV', TV_SHORT: 'Serie TV', MOVIE: 'Film', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special',
};
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > limit / 2 ? head.slice(0, space) : head).trimEnd()}…`;
}

// Inputs come from the detail's existing server loaders. Never infer offers from
// another country or from seriesWatch: those do not prove this season is offered.
export function formatAnimeSeo(
  name: string,
  anime: Pick<AniListAnime, 'format' | 'startDate' | 'seasonYear' | 'averageScore'>,
  italianSynopsis = '',
  availability?: Pick<DetailAvailability, 'providers' | 'providersUnavailable'> | null,
  locale: Locale = 'it',
): { title: string; description: string } {
  name = compact(name);
  const format = formats[anime.format || ''];
  const validYear = (year: number | null | undefined): year is number => Number.isInteger(year) && year! > 0 && year! <= 9999;
  const year = validYear(anime.startDate?.year) ? anime.startDate.year : validYear(anime.seasonYear) ? anime.seasonYear : undefined;
  const datedName = `${name}${year ? ` (${year})` : ''}`;
  const label = format ? `${format} anime` : 'Anime';
  if (locale !== 'it') {
    const d = getDictionary(locale);
    const format = d.catalog.formats[anime.format as keyof typeof d.catalog.formats] || 'Anime';
    const suffix = ` – ${d.seo.watchTitle}`;
    const title = truncate(datedName, 65 - suffix.length) + suffix;
    const parts = [year ? d.seo.animeYear.replace('{format}', format).replace('{year}', String(year)) : `${format}.`];
    const score = anime.averageScore;
    if (typeof score === 'number' && Number.isFinite(score) && score > 0 && score <= 100) {
      parts.push(d.seo.animeScore.replace('{score}', new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(score / 10)));
    }
    parts.push(compact(italianSynopsis) || d.seo.animeFallback.replace('{name}', name));
    return { title, description: truncate(parts.join(' '), 155) };
  }
  const suffixes = [` – ${label}: dove vederlo in streaming`, ` – ${label} in streaming`, ` – ${label}`];
  const title = suffixes.map(suffix => datedName + suffix).find(candidate => candidate.length <= 65)
    ?? `${truncate(name, 65 - (year ? ` (${year})` : '').length - suffixes[2].length)}${year ? ` (${year})` : ''}${suffixes[2]}`;

  const parts: string[] = [];
  if (format || year) parts.push(`${label}${year ? ` del ${year}` : ''}.`);
  const score = anime.averageScore;
  if (typeof score === 'number' && Number.isFinite(score) && score > 0 && score <= 100) {
    parts.push(`Voto ${(score / 10).toFixed(1).replace('.', ',')}/10.`);
  }
  const platforms = availability && !availability.providersUnavailable
    ? [...new Set((availability.providers.IT?.providers || []).map(provider => compact(provider.provider_name)).filter(Boolean))]
    : [];
  // Keep complete platform names and sentences even when the provider list is long.
  const selected: string[] = [];
  for (const platform of platforms) {
    const sentence = `In streaming su ${[...selected, platform].join(', ')} in Italia.`;
    if ([...parts, sentence].join(' ').length <= 155) selected.push(platform);
  }
  if (selected.length) parts.push(`In streaming su ${selected.join(', ')} in Italia.`);
  const synopsis = compact(italianSynopsis);
  if (synopsis) parts.push(synopsis);
  if (!parts.length) parts.push(`Trama, valutazioni e dove guardare ${name} in streaming.`);
  return { title, description: truncate(parts.join(' '), 155) };
}
