import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/locales';
import type { AniListAnime } from '@/lib/anilist';
import type { DetailAvailability } from '@/lib/detail-availability';
import type { Ratings } from '@/lib/ratings';
import { animeAlternateNames } from '@/lib/anime-titles';

const formats: Record<string, string> = {
  TV: 'Serie TV', TV_SHORT: 'Serie TV', MOVIE: 'Film', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Special',
};
const capitalize = (text: string, locale: Locale) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
const compact = (text: string) => text.replace(/\s+/g, ' ').trim();

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > limit / 2 ? head.slice(0, space) : head).trimEnd()}…`;
}

function truncateAnimeName(name: string, limit: number): string {
  if (name.length <= limit) return name;
  const words = name.split(' ');
  const selected = words.slice(0, 4);
  for (const word of words.slice(4)) {
    if ([...selected, word].join(' ').length + 1 > limit) break;
    selected.push(word);
  }
  return selected.join(' ') + '…';
}

function ctrTitle(name: string, anime: Pick<AniListAnime, 'nextAiringEpisode'> & { format?: string | null }, locale: Locale, adult = false) {
  name = compact(name).replace(/\.+$/, '');
  const d = getDictionary(locale).seo;
  const next = nextAnimeEpisode(anime);
  const date = next && new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: locale === 'it' ? 'Europe/Rome' : 'UTC' }).format(next.date);
  const suffix = next ? ` ${d.ctrEpisode} ${next.episode}: ${d.ctrRelease} ${date} – ${d.ctrWatch}` : ` – ${adult ? d.ctrWatch : d.ctrWatchDate}`;
  const base = anime.format ? ` ${anime.format === 'TV_SHORT' ? 'TV' : anime.format}` : '';
  // Adult (AniList isAdult) titles: searchers qualify with "hentai"; front-load it next to the name.
  const format = adult ? ` hentai${base}` : base;
  const label = name.length + format.length + suffix.length <= 75 ? format : '';
  return truncateAnimeName(name, 75 - suffix.length - label.length) + label + suffix;
}

// Ratings are supplied by the detail's existing shared loader. This formatter
// performs no I/O and never treats the AniList/MAL score as an IMDb rating.
export function animeDetailSeo(
  name: string,
  anime: Parameters<typeof formatAnimeSeo>[1] & Pick<AniListAnime, 'title' | 'relations' | 'synonyms' | 'isAdult'>,
  synopsis: string,
  locale: Locale,
  ratings: Ratings = {},
): { title: string; description: string } {
  name = compact(name).replace(/\.+$/, '');
  const aliases = animeAlternateNames(name, anime.title, anime.synonyms);
  const next = nextAnimeEpisode(anime);
  const d = getDictionary(locale).seo;
  const adult = anime.isAdult === true;
  const episode = next ? `${capitalize(d.ctrEpisode, locale)} ${next.episode}: ${d.ctrRelease} ${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: locale === 'it' ? 'Europe/Rome' : 'UTC' }).format(next.date)}.` : '';
  const intro = [episode, animeIntro({ ...anime, nextAiringEpisode: null }, ratings, locale)].filter(Boolean).join(' ');
  const format = anime.format || '';
  const lead = adult ? `${d.adultLead.replace('{name}', name).replace('{format}', format || 'anime')}` : '';
  const description = [lead, intro, !adult && format && `${format}.`, aliases.length && `${getDictionary(locale).seo.alsoKnownAs}: ${aliases.join(' · ')}.`, compact(synopsis), getDictionary(locale).seo.detailContext].filter(Boolean).join(' ');
  return { title: ctrTitle(name, anime, locale, adult), description: truncate(description, 160) };
}

// Inputs come from the detail's existing server loaders. Never infer offers from
// another country or from seriesWatch: those do not prove this season is offered.
export function formatAnimeSeo(
  name: string,
  anime: Pick<AniListAnime, 'format' | 'startDate' | 'seasonYear' | 'averageScore' | 'nextAiringEpisode'>,
  italianSynopsis = '',
  availability?: Pick<DetailAvailability, 'providers' | 'providersUnavailable'> | null,
  locale: Locale = 'it',
): { title: string; description: string } {
  name = compact(name);
  if (nextAnimeEpisode(anime)) {
    const title = animeHeading(name, anime, locale);
    return { title, description: truncate(`${animeIntro(anime, {}, locale)} ${anime.format || ""}. ${compact(italianSynopsis)}`, 155) };
  }
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

const episodeCopy = {
  it: { episode: 'episodio', suffix: 'data di uscita e voti', next: 'Prossimo episodio {n}: {date}' },
  en: { episode: 'episode', suffix: 'release date & ratings', next: 'Next episode {n}: {date}' },
  es: { episode: 'episodio', suffix: 'fecha de estreno y valoraciones', next: 'Próximo episodio {n}: {date}' },
  fr: { episode: 'épisode', suffix: 'date de sortie et notes', next: 'Prochain épisode {n} : {date}' },
  de: { episode: 'Folge', suffix: 'Erscheinungsdatum und Bewertungen', next: 'Nächste Folge {n}: {date}' },
  pt: { episode: 'episódio', suffix: 'data de lançamento e avaliações', next: 'Próximo episódio {n}: {date}' },
};

export function nextAnimeEpisode(anime: Pick<AniListAnime, 'nextAiringEpisode'>) {
  const next = anime.nextAiringEpisode;
  if (!next || !Number.isSafeInteger(next.episode) || next.episode <= 0 || !Number.isSafeInteger(next.airingAt) || next.airingAt <= 0) return null;
  const date = new Date(next.airingAt * 1000);
  return Number.isNaN(date.getTime()) ? null : { ...next, date };
}

export function animeHeading(name: string, anime: Pick<AniListAnime, 'nextAiringEpisode'> & { format?: string | null }, locale: Locale) {
  const next = nextAnimeEpisode(anime);
  return next ? ctrTitle(name, anime, locale) : compact(name).replace(/\.+$/, '');
}

export function animeIntro(anime: Pick<AniListAnime, 'nextAiringEpisode' | 'seasonYear' | 'averageScore'> & Partial<Pick<AniListAnime, 'season'>>, ratings: import('@/lib/ratings').Ratings, locale: Locale) {
  const parts: string[] = [];
  const next = nextAnimeEpisode(anime);
  if (next) {
    const zone = locale === 'it' ? 'Europe/Rome' : 'UTC';
    const date = new Intl.DateTimeFormat(locale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: zone }).format(next.date);
    parts.push(episodeCopy[locale].next.replace('{n}', String(next.episode)).replace('{date}', `${date} (${zone})`));
  }
  const season = anime.season?.toLowerCase();
  if (season && ['winter', 'spring', 'summer', 'fall'].includes(season) && Number.isInteger(anime.seasonYear) && anime.seasonYear! > 0) {
    parts.push(`${getDictionary(locale).catalog.seasonNames[season as 'winter' | 'spring' | 'summer' | 'fall']} ${anime.seasonYear}`);
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  for (const [name, score] of [
    ['IMDb', ratings.imdbRating?.trim() ? Number(ratings.imdbRating) : NaN],
    ['MyAnimeList', ratings.malScore], ['AniList', anime.averageScore == null ? NaN : anime.averageScore / 10],
  ] as const) {
    if (typeof score === 'number' && Number.isFinite(score) && score > 0 && score <= 10) parts.push(`${name} ${number.format(score)}/10`);
  }
  return parts.length ? `${parts.join(' · ')}.` : '';
}

// Keep the full published title: truncating it can make distinct anime share
// metadata. The template describes the page; facts below are only real inputs.
export function animeScheduleSeo(name: string, anime: Parameters<typeof formatAnimeSeo>[1], synopsis: string, locale: Locale) {
  const d = getDictionary(locale).rankings;
  const title = d.animeTitle.replace('{name}', compact(name));
  const intro = animeIntro(anime, {}, locale);
  const description = [d.animeDescription.replace('{name}', compact(name)), intro, compact(synopsis)].filter(Boolean).join(' ');
  return { title, description: truncate(description, Math.max(300, compact(name).length + 100)) };
}
