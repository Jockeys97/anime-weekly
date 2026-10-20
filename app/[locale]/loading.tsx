'use client';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary } from '@/lib/i18n';
export default function Loading() { return <main className="empty-state route-loading" role="status"><p>{getDictionary(useLocale()).loading}</p></main>; }
