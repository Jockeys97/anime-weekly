import { getDictionary } from '@/lib/i18n';
export default function Loading() { return <main className="empty-state" role="status"><p>{getDictionary().loading}</p></main>; }
