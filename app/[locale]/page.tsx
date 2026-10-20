import Link from '@/components/LocaleLink';
import { WeeklyGuide } from '@/components/WeeklyGuide';
import { isoWeek } from '@/lib/week';
import { pageMetadata } from '@/lib/seo';
import { getDictionary } from '@/lib/i18n';
import { JsonLd } from '@/components/JsonLd';
import { websiteSearch } from '@/lib/structured-data';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
export async function generateMetadata({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params); const d = getDictionary(locale);
  return pageMetadata(d.metadata.title, d.metadata.description, '/', undefined, locale);
}
export const dynamic = 'error';
export const revalidate = 900; // re-read the cron-cached ratings snapshot (cache-only) every 15 min
export default async function Home({ params }: { params?: LocaleParams } = {}) { const locale = await getRequestLocale(params); const d = getDictionary(locale); return <><nav className="catalog-filters landing-home-links"><Link href="/this-week">{d.landings.weekNav}</Link><Link href="/best-this-season">{d.landings.bestNav}</Link></nav><JsonLd data={websiteSearch(locale)} /><WeeklyGuide week={isoWeek(new Date())} locale={locale} newsletter /></>; }
