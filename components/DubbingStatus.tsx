'use client';
import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/components/LanguageSelector';
import { getDictionary, type Locale } from '@/lib/i18n';
import { validMalId, type DubbingResult } from '@/lib/dubbing';
import { loadDubbing } from '@/lib/dubbing-client';
import { observeNearViewport } from '@/lib/viewport-observer';
import { DubbingFlag } from '@/components/DubbingFlag';

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
  // A prefetched result fits when it is for this language and the exact entry: same MAL ID, or the
  // calendar's AniList season it was looked up for (the caller keys it by that season).
  const known = initial?.language === language && (validMalId(malId) ? initial.malId === malId : validMalId(anilistId)) ? initial : undefined;
  const result = loaded?.key === key ? loaded.result : known;
  const pending = Boolean(query && !result);
  useEffect(() => {
    if (!query || known) return;
    let active = true;
    const load = () => {
      void loadDubbing(query, language, validMalId(malId) ? malId : undefined).then(result => { if (active) setLoaded({ key, result }); })
        .catch(() => { if (active) setLoaded({ key, result: { status: 'unverified', language, reason: 'upstream' } }); });
    };
    const stopObserving = ref.current ? observeNearViewport(ref.current, load) : undefined;
    return () => { active = false; stopObserving?.(); };
  }, [query, language, malId, known, key]);
  const status = result?.status ?? 'unverified';
  const exactId = result?.malId ?? (validMalId(malId) ? malId : undefined);
  const checked = result?.checkedAt && Number.isFinite(Date.parse(result.checkedAt)) ? result.checkedAt : undefined;
  const shortStatus = pending ? d.loading : status === 'reported' ? d.reportedShort : status === 'partial' ? d.partialShort : d.unverified;
  const hasReport = !pending && (status === 'reported' || status === 'partial');
  const languageLabel = hasReport ? d.label : d.lookupLanguage;
  return <section ref={ref} className="dubbing-status" data-status={pending ? 'pending' : status} aria-busy={pending}>
    <details>
      <summary className="dubbing-summary" aria-label={`${languageLabel}: ${d.language} · ${shortStatus}`}>
        {hasReport ? <DubbingFlag language={language} /> : <span className="dubbing-unknown" aria-hidden="true">?</span>}
        <span className="dubbing-language"><span>{languageLabel}</span><strong>{d.language}</strong></span>
        <span className="dubbing-badge"><span aria-hidden="true" />{shortStatus}</span>
        <svg className="dubbing-chevron" aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m6 8 4 4 4-4" /></svg>
      </summary>
      <div className="dubbing-details">
        <p className="dubbing-note"><strong>{pending ? d.loading : d[status]}.</strong> {status === 'unverified' ? !query || result?.reason === 'identity' ? d.identity : d.missing : d.note}</p>
        {checked && <p className="dubbing-source">{d.checked} <time dateTime={checked}>{new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(checked))}</time></p>}
        <p className="dubbing-source"><a href="https://mydublist.com" target="_blank" rel="noopener noreferrer">MyDubList ↗</a>
          {exactId && <> · <a href={`https://myanimelist.net/anime/${exactId}`} target="_blank" rel="noopener noreferrer">{d.entry} ↗</a></>}</p>
      </div>
    </details>
  </section>;
}
