'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary, type Locale } from '@/lib/i18n';
import { validMalId, type DubbingResult } from '@/lib/dubbing';
import { loadDubbing } from '@/lib/dubbing-client';

export function DubbingStatus({ malId, anilistId, locale = 'en', initial, followLocale = false }: {
  malId?: number | null; anilistId?: number; locale?: Locale; initial?: DubbingResult; followLocale?: boolean;
}) {
  const selected = useLocale();
  const language = followLocale ? selected : locale;
  const d = getDictionary(language).dubbing;
  const ref = useRef<HTMLElement>(null);
  const query = validMalId(malId) ? `mal=${malId}` : validMalId(anilistId) ? `anilist=${anilistId}` : '';
  const [loaded, setLoaded] = useState<{ key: string; result: DubbingResult } | null>(null);
  const key = `${language}:${query}`;
  const known = initial?.language === language && initial.malId === malId ? initial : undefined;
  const result = loaded?.key === key ? loaded.result : known;
  const pending = Boolean(query && !result);
  useEffect(() => {
    if (!query || known) return;
    let active = true;
    const load = () => {
      observer?.disconnect();
      void loadDubbing(query, language, validMalId(malId) ? malId : undefined).then(result => { if (active) setLoaded({ key, result }); })
        .catch(() => { if (active) setLoaded({ key, result: { status: 'unverified', language, reason: 'upstream' } }); });
    };
    const observer = typeof IntersectionObserver === 'undefined' ? undefined
      : new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) load(); }, { rootMargin: '100px' });
    if (observer && ref.current) observer.observe(ref.current); else load();
    return () => { active = false; observer?.disconnect(); };
  }, [query, language, malId, known, key]);
  const status = result?.status ?? 'unverified';
  const exactId = result?.malId ?? (validMalId(malId) ? malId : undefined);
  const checked = result?.checkedAt && Number.isFinite(Date.parse(result.checkedAt)) ? result.checkedAt : undefined;
  return <section ref={ref} className="dubbing-status" data-status={status} aria-busy={pending}>
    <p className="dubbing-line"><span>{d.label} · {d.language}</span><strong>{pending ? d.loading : d[status]}</strong></p>
    <p className="dubbing-note">{status === 'unverified' ? !query || result?.reason === 'identity' ? d.identity : d.missing : d.note}</p>
    {checked && <p className="dubbing-source">{d.checked} <time dateTime={checked}>{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(checked))}</time></p>}
    <p className="dubbing-source"><a href="https://mydublist.com" target="_blank" rel="noopener noreferrer">MyDubList ↗</a>
      {exactId && <> · <a href={`https://myanimelist.net/anime/${exactId}`} target="_blank" rel="noopener noreferrer">{d.entry} ↗</a></>}</p>
  </section>;
}
