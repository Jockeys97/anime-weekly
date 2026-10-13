import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
export default async function LoadingAnime() {
  const locale = await getRequestLocale();
  return <main className="catalog-page" lang={locale} aria-busy="true">
    <p role="status">{getDictionary(locale).catalog.loadingAnime}</p>
    <div className="anime-loading" aria-hidden="true"><div className="anime-loading-poster" /><div className="anime-loading-copy"><div className="anime-loading-line" /><div className="anime-loading-line" /><div className="anime-loading-line" /><div className="anime-loading-line" /></div></div>
  </main>;
}
