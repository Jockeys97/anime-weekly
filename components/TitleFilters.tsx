'use client';
import { useId } from 'react';
import { getDictionary } from '@/lib/i18n';
import { useLocale } from '@/components/LanguageSelector';
import { POPULAR_PLATFORMS } from '@/lib/title-filters';
import { useStreamingDisplay } from '@/lib/streaming-display';
export function TitleFilters({ genres, platforms, genre, platform, onlyWatchlist, onGenre, onPlatform, onWatchlist, platformsPending = false, platformsFailed = false, onRetryPlatforms }: {
  genres: string[]; platforms: [string, string][]; genre: string; platform: string; onlyWatchlist: boolean;
  platformsPending?: boolean; platformsFailed?: boolean; onRetryPlatforms?: () => void;
  onGenre: (value: string) => void; onPlatform: (value: string) => void; onWatchlist: (value: boolean) => void;
}) {
  const dictionary = getDictionary(useLocale()); const d = dictionary.features; const id = useId();
  const [showStreaming, setShowStreaming] = useStreamingDisplay();
  const platformChoices = [...new Map([...POPULAR_PLATFORMS, ...platforms]).entries()];
  return <div className="title-filters">
    <label htmlFor={`${id}-genre`}>{d.genre} <select id={`${id}-genre`} value={genre} onChange={event => onGenre(event.target.value)}><option value="">{d.all}</option>{genres.map(value => <option key={value} value={value}>{dictionary.explore.genres[value as keyof typeof dictionary.explore.genres] ?? value}</option>)}</select></label>
    <label htmlFor={`${id}-platform`}>{d.platform} <select id={`${id}-platform`} value={platform} aria-busy={platformsPending} onChange={event => onPlatform(event.target.value)}><option value="">{d.all}</option>{platformChoices.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><input type="checkbox" checked={onlyWatchlist} onChange={event => onWatchlist(event.target.checked)} /> {d.onlyWatchlist}</label>
    <label><input type="checkbox" checked={showStreaming} onChange={event => setShowStreaming(event.target.checked)} /> {d.showStreaming}</label>
    {platformsPending ? <span role="status">{dictionary.catalog.loadingAvailability}</span> : platformsFailed && <span role="status">{dictionary.state.providersError} {onRetryPlatforms && <button type="button" onClick={onRetryPlatforms}>{dictionary.error.retry}</button>}</span>}
  </div>;
}
