import { getRequestLocale } from '@/lib/request-locale';
import { getDictionary } from '@/lib/i18n';
export default async function Loading() { const locale = await getRequestLocale(); return <main className="empty-state" role="status"><p>{getDictionary(locale).loading}</p></main>; }
