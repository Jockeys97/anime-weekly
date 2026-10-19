import { localePath } from '@/lib/locale-routing';
import { getDictionary, type Locale } from '@/lib/i18n';

export function SearchBox({ query = '', id = 'header-search', locale = 'en' }: { query?: string; id?: string; locale?: Locale }) {
  const d = getDictionary(locale).catalog;
  return <form action={localePath('/search', locale)} method="GET" className="search-box" role="search" lang={locale}>
    <label className="sr-only" htmlFor={id}>{d.searchLabel}</label>
    <input id={id} type="search" name="q" defaultValue={query} placeholder={d.searchPlaceholder} maxLength={200} />
    <button type="submit" className="button">{d.search}</button>
  </form>;
}
