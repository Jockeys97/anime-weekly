import { getDictionary } from '@/lib/i18n';
import { localePath } from '@/lib/locale-routing';
import type { Locale } from '@/lib/locales';

export function DiscoveryUnavailable({ locale, path }: { locale: Locale; path: string }) {
  const d = getDictionary(locale);
  return <main id="main" className="catalog-page" lang={locale}>
    <h1>{d.error.title}</h1>
    <div className="empty-state" role="status"><p>{d.error.body}</p>
      <a className="button" href={localePath(path, locale)}>{d.error.retry}</a>
    </div>
  </main>;
}
