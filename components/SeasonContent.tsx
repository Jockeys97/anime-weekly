'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { StreamingCountrySelector, useStreamingCountry } from '@/components/StreamingCountry';
import { TitleFilters } from '@/components/TitleFilters';
import { useWatchlist } from '@/components/Watchlist';
import { filterOptions, filterTitles } from '@/lib/title-filters';
import type { AnimeTitle } from '@/lib/tmdb';
import { getDictionary, type Locale } from '@/lib/i18n';
export function SeasonContent({ entries, locale }: { entries: { id: number; genres: string[]; card: ReactNode }[]; locale: Locale }) {
  const { region } = useStreamingCountry(); const watchlist = useWatchlist();
  const [genre, setGenre] = useState(''); const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [selection, setSelection] = useState({ region, value: '' }); const platform = selection.region === region ? selection.value : '';
  if (selection.region !== region) setSelection({ region, value: '' });
  const [providers, setProviders] = useState<Record<number, AnimeTitle['providers']>>({});
  useEffect(() => {
    const controller = new AbortController();
    entries.forEach(entry => { void fetch(`/api/anime-providers/${entry.id}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Providers unavailable');
      return await response.json() as { providers: AnimeTitle['providers'] };
    }).then(summary => {
      if (!controller.signal.aborted) setProviders(previous => ({ ...previous, [entry.id]: summary.providers }));
    }).catch(() => {}); });
    return () => controller.abort();
  }, [entries]);
  const titles = entries.map(entry => ({ ...entry, key: `anilist:${entry.id}`, providers: providers[entry.id] ?? {} }));
  const options = filterOptions(titles, region);
  const visible = new Set(filterTitles(titles, { genre, platform, region, onlyWatchlist, watchlist }).map(title => title.id));
  return <><StreamingCountrySelector locale={locale} /><TitleFilters {...options} genre={genre} platform={platform} onlyWatchlist={onlyWatchlist} onGenre={setGenre} onPlatform={value => setSelection({ region, value })} onWatchlist={setOnlyWatchlist} />
    {!visible.size && <p role="status">{getDictionary(locale).features.noMatches}</p>}
    <div className="anime-grid">{entries.map(entry => <div key={entry.id} hidden={!visible.has(entry.id)}>{entry.card}</div>)}</div>
  </>;
}
