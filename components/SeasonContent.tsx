'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { StreamingCountrySelector, useStreamingCountry } from '@/components/StreamingCountry';
import { TitleFilters } from '@/components/TitleFilters';
import { useWatchlist } from '@/components/Watchlist';
import { filterOptions, filterTitles } from '@/lib/title-filters';
import { mergePlatformSnapshot, type PlatformSnapshot } from '@/lib/platform-data';
import { invalidateWeeklyLookup, loadWeeklyLookup } from '@/lib/weekly-client';
import { getDictionary, type Locale } from '@/lib/i18n';
import { CatalogWatchProvider } from '@/components/CatalogWatchContext';
export function SeasonContent({ entries, locale, providerUrl, initialProviders }: { entries: { id: number; genres: string[]; card: ReactNode }[]; locale: Locale; providerUrl: string; initialProviders?: PlatformSnapshot }) {
  const { region, platformFilter: platform, setPlatformFilter: setPlatform } = useStreamingCountry(); const watchlist = useWatchlist();
  const [genre, setGenre] = useState(''); const [onlyWatchlist, setOnlyWatchlist] = useState(false);
  const [providers, setProviders] = useState<PlatformSnapshot | null>(initialProviders ?? null);
  const [pending, setPending] = useState(true);
  const [attempt, retry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    if (attempt) invalidateWeeklyLookup(providerUrl);
    void loadWeeklyLookup<PlatformSnapshot>(providerUrl, controller.signal)
      .then(summary => { if (!controller.signal.aborted) setProviders(previous => mergePlatformSnapshot(previous, summary)); })
      .catch(() => { if (!controller.signal.aborted) setProviders(previous => ({ titles: previous?.titles ?? {}, unavailable: true })); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [providerUrl, attempt]);
  const titles = entries.map(entry => ({ ...entry, key: `anilist:${entry.id}`, providers: providers?.titles[`anilist:${entry.id}`]?.providers ?? {}, seriesWatch: providers?.titles[`anilist:${entry.id}`]?.seriesWatch }));
  const incomplete = providers?.unavailable || Boolean(providers && entries.some(entry => !providers.titles[`anilist:${entry.id}`]));
  const options = filterOptions(titles, region, platform);
  const visible = new Set(filterTitles(titles, { genre, platform, region, onlyWatchlist, watchlist }).map(title => title.id));
  return <><StreamingCountrySelector locale={locale} /><TitleFilters {...options} genre={genre} platform={platform} onlyWatchlist={onlyWatchlist} onGenre={setGenre} onPlatform={setPlatform} onWatchlist={setOnlyWatchlist} platformsPending={pending} platformsFailed={incomplete} onRetryPlatforms={() => { setPending(true); retry(value => value + 1); }} />
    {!visible.size && (!platform || (!pending && !incomplete)) && <p role="status">{getDictionary(locale).features.noMatches}</p>}
    <CatalogWatchProvider snapshot={providers}><div className="anime-grid">{entries.map(entry => <div key={entry.id} hidden={!visible.has(entry.id)}>{entry.card}</div>)}</div></CatalogWatchProvider>
  </>;
}
