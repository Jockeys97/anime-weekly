import { getRequestLocale } from '@/lib/request-locale';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n';

export default async function CatalogNotFound() {
  const locale = await getRequestLocale();
  const d = getDictionary(locale).catalog;
  return <main className="empty-state" lang={locale}><h1>{d.notFoundTitle}</h1><p>{d.notFoundBody}</p><Link href="/season" prefetch={false} className="button">{d.back}</Link></main>;
}
