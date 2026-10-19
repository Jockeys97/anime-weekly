'use client';
import Link from '@/components/LocaleLink';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
export default function CatalogNotFound() {
  const locale = useLocale();
  const d = getDictionary(locale).catalog;
  return <main className="empty-state" lang={locale}><h1>{d.notFoundTitle}</h1><p>{d.notFoundBody}</p><Link href="/season" prefetch={false} className="button">{d.back}</Link></main>;
}
