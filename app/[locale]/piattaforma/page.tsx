import Link from '@/components/LocaleLink';
import { PLATFORM_COUNTRIES, PLATFORM_PROVIDERS, platformTitle } from '@/lib/platforms';
import { pageMetadata } from '@/lib/seo';
import { getDictionary } from '@/lib/i18n';
import { getRequestLocale, type LocaleParams } from '@/lib/request-locale';
export async function generateMetadata({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params); const d = getDictionary(locale).seo;
  return pageMetadata(d.platformsTitle, d.platformsIntro, '/piattaforma', undefined, locale);
}
export default async function PlatformsPage({ params }: { params?: LocaleParams }) {
  const locale = await getRequestLocale(params); const d = getDictionary(locale).seo;
  return <main className="catalog-page" lang={locale}><h1>{d.platformsTitle}</h1><p className="catalog-intro">{d.platformsIntro}</p>
    {Object.entries(PLATFORM_PROVIDERS).map(([slug, provider]) => <section key={slug}><h2>{provider.name}</h2><ul>{Object.keys(PLATFORM_COUNTRIES).map(country => <li key={country}><Link prefetch={false} href={`/piattaforma/${slug}/${country}`}>{platformTitle(slug, country, locale)}</Link></li>)}</ul></section>)}
  </main>;
}
