import { getDictionary } from '@/lib/i18n';

export function SearchBox({ query = '', id = 'header-search' }: { query?: string; id?: string }) {
  const d = getDictionary('it').catalog;
  return <form action="/search" method="GET" className="search-box" role="search" lang="it">
    <label className="sr-only" htmlFor={id}>{d.searchLabel}</label>
    <input id={id} type="search" name="q" defaultValue={query} placeholder={d.searchPlaceholder} maxLength={200} />
    <button type="submit" className="button">{d.search}</button>
  </form>;
}
