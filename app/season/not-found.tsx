import Link from 'next/link';
import { getDictionary } from '@/lib/i18n';

export default function CatalogNotFound() {
  const d = getDictionary('it').catalog;
  return <main className="empty-state" lang="it"><h1>{d.notFoundTitle}</h1><p>{d.notFoundBody}</p><Link href="/season" prefetch={false} className="button">{d.back}</Link></main>;
}
