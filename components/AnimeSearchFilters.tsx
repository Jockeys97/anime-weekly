import Form from 'next/form';
import { SearchGenres } from '@/components/SearchGenres';
import { localePath } from '@/lib/locale-routing';
import Link from '@/components/LocaleLink';
import { SearchPlatformSelect } from '@/components/PlatformOptions';
import { getDictionary, type Locale } from '@/lib/i18n';
import { SEARCH_FORMATS, SEARCH_SEASONS, SEARCH_SORTS, SEARCH_STATUSES, type AnimeFilters } from '@/lib/anime-search';
export function AnimeSearchFilters({ filters, locale }: { filters: AnimeFilters; locale: Locale }) {
  const { explore: d, catalog: c } = getDictionary(locale);
  return <Form prefetch={false} action={localePath('/search', locale)} className="anime-search-filters" role="search">
    <div className="explore-query"><label htmlFor="explore-query">{c.searchLabel}</label><div><input id="explore-query" type="search" name="q" defaultValue={filters.q} placeholder={c.searchPlaceholder} maxLength={200} /><button className="button" type="submit">{d.apply} →</button></div><p>{d.optionalTitle}</p></div>
    <fieldset><legend>{d.filters}</legend><div className="explore-fields">
      <SearchGenres selected={filters.genres} locale={locale} />
      <label>{d.year}<input type="number" name="year" defaultValue={filters.year || ''} min={1900} max={new Date().getFullYear() + 5} placeholder={d.anyYear} /></label>
      <label>{c.seasonLabel}<select name="season" defaultValue={filters.season || ''}><option value="">{d.allSeasons}</option>{SEARCH_SEASONS.map(season => <option key={season} value={season}>{c.seasonNames[season.toLowerCase() as keyof typeof c.seasonNames]}</option>)}</select></label>
      <label>{c.format}<select name="format" defaultValue={filters.format || ''}><option value="">{d.allFormats}</option>{SEARCH_FORMATS.map(format => <option key={format} value={format}>{c.formats[format as keyof typeof c.formats] || format}</option>)}</select></label>
      <label>{c.status}<select name="status" defaultValue={filters.status || ''}><option value="">{d.allStatuses}</option>{SEARCH_STATUSES.map(status => <option key={status} value={status}>{c.statuses[status as keyof typeof c.statuses] || status}</option>)}</select></label>
      <label>{d.minScore}<select name="minScore" defaultValue={filters.minScore || ''}><option value="">{d.anyScore}</option>{[6, 7, 8, 9].map(score => <option key={score} value={score}>≥ {score} / 10</option>)}</select></label>
      <label>{d.sort}<select name="sort" defaultValue={filters.sort}>{SEARCH_SORTS.map(sort => <option key={sort} value={sort}>{d.sorts[sort]}</option>)}</select></label>
      <SearchPlatformSelect />
    </div><label className="explore-classification" title={d.mildNudityHint}><input type="checkbox" name="malRating" value="r-plus" defaultChecked={filters.malRating === 'r-plus'} /><span>{d.mildNudity}</span></label><label className="explore-classification" title={d.hentaiHint}><input type="checkbox" name="malRating" value="hx" defaultChecked={filters.malRating === 'hx'} /><span>{d.hentai}</span></label></fieldset>
    <div className="explore-actions"><span>{d.scoreHint}</span><Link href="/search" prefetch={false}>{d.reset} ↗</Link></div>
  </Form>;
}
