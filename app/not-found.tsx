'use client';
import { useLocale } from '@/components/LanguageSelector';
import Link from 'next/link';
import { getDictionary } from '@/lib/i18n';
export default function NotFound() { const d = getDictionary(useLocale()); return <main className="empty-state"><h1>{d.notFound.title}</h1><p>{d.notFound.body}</p><Link href="/" className="button">{d.notFound.back}</Link></main>; }
