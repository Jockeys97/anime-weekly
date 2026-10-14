'use client';
import { useId } from 'react';
import { getDictionary } from '@/lib/i18n';
import { useLocale } from '@/components/LanguageSelector';
export function TitleFilters({ genres, platforms, genre, platform, onlyWatchlist, onGenre, onPlatform, onWatchlist }: {
  genres: string[]; platforms: [string, string][]; genre: string; platform: string; onlyWatchlist: boolean;
  onGenre: (value: string) => void; onPlatform: (value: string) => void; onWatchlist: (value: boolean) => void;
}) {
  const dictionary = getDictionary(useLocale()); const d = dictionary.features; const id = useId();
  return <div className="title-filters">
    <label htmlFor={`${id}-genre`}>{d.genre} <select id={`${id}-genre`} value={genre} onChange={event => onGenre(event.target.value)}><option value="">{d.all}</option>{genres.map(value => <option key={value} value={value}>{dictionary.explore.genres[value as keyof typeof dictionary.explore.genres] ?? value}</option>)}</select></label>
    <label htmlFor={`${id}-platform`}>{d.platform} <select id={`${id}-platform`} value={platform} onChange={event => onPlatform(event.target.value)}><option value="">{d.all}</option>{platforms.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label><input type="checkbox" checked={onlyWatchlist} onChange={event => onWatchlist(event.target.checked)} /> {d.onlyWatchlist}</label>
  </div>;
}
