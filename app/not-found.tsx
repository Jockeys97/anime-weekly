import { getRequestLocale } from '@/lib/request-locale';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n';
export default async function NotFound() { const locale = await getRequestLocale(); const d = getDictionary(locale); return <main className="empty-state"><h1>{d.notFound.title}</h1><p>{d.notFound.body}</p><Link href="/" className="button">{d.notFound.back}</Link></main>; }
