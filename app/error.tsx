'use client';
import { getDictionary } from '@/lib/i18n';
export default function ErrorPage({ reset }: { reset: () => void }) { const d = getDictionary(); return <main className="empty-state"><h1>{d.error.title}</h1><p>{d.error.body}</p><button className="button" onClick={reset}>{d.error.retry}</button></main>; }
