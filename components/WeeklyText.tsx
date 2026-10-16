'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cleanSynopsis, displayTitle } from '@/lib/title-text';
import { getDictionary, type Locale } from '@/lib/i18n';
type TextResult = { name: string | null; overview: string | null; overviewLanguage: string | null; machine: boolean; locale: Locale };
const japanese = /[\u3040-\u30ff\u3400-\u9fff]/;
export function WeeklyText({ id, kind, name, overview, locale, detailHref }: { id: number; kind: 'tv' | 'movie'; name: string; overview: string; locale: Locale; detailHref: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<TextResult | null>(null);
  const d = getDictionary(locale);
  const needsLookup = overview.length >= 900 || locale !== 'en' || !overview.trim() || japanese.test(name) || japanese.test(overview);
  useEffect(() => {
    if (!needsLookup || !ref.current) return;
    const controller = new AbortController();
    const load = () => {
      const query = new URLSearchParams({ id: String(id), kind, locale, names: 'original' });
      fetch(`/api/weekly-text?${query}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) }).then(async response => {
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && data.locale === locale) setText(data);
      }).catch(() => { /* Keep the source title and the explicit missing-synopsis state. */ });
    };
    if (typeof IntersectionObserver === 'undefined') { load(); return () => controller.abort(); }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); }
    }, { rootMargin: '150px' });
    observer.observe(ref.current);
    return () => { controller.abort(); observer.disconnect(); };
  }, [id, kind, locale, needsLookup]);
  const synopsis = cleanSynopsis(text?.overview || overview);
  return <div ref={ref} className="weekly-text">
    <h3><Link href={detailHref} prefetch={false}>{displayTitle(text?.name || (japanese.test(name) ? `Anime #${id}` : name))}</Link></h3>
    <p className="synopsis" lang={text?.overviewLanguage || (japanese.test(synopsis) ? 'ja' : undefined)}>{synopsis || d.state.noSynopsis}</p>
    {text?.machine && <p className="synopsis-fallback">{d.language.machineTranslation} · DeepL</p>}
    {text?.overview && text.overviewLanguage !== locale && <p className="synopsis-fallback">{d.language.sourceSynopsis}</p>}
  </div>;
}
