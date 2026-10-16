'use client';

import Image from 'next/image';
import { useState } from 'react';
import { getDictionary } from '@/lib/i18n';
import { trailerLinks, type AnimeTrailer as TrailerData } from '@/lib/trailer';
import styles from './AnimeTrailer.module.css';

export function AnimeTrailer({ trailer, title, image, locale = 'it' }: {
  trailer?: TrailerData | null; title: string; image?: string | null; locale?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const links = trailerLinks(trailer);
  const d = getDictionary(locale).trailer;
  return <section className={styles.section} aria-label={`${d.heading} · ${title}`}>
    <h2>{d.heading}</h2>
    <p className={styles.caption}>{title}</p>
    {links ? <>
      <div className={styles.player}>
        {playing ? <iframe key={links.embed} src={links.embed} title={`${d.heading} · ${title}`} loading="lazy"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
          : <button type="button" className={styles.play} onClick={() => setPlaying(true)} aria-label={`${d.play} · ${title}`}>
            {image && <Image src={image} alt="" fill unoptimized={image.startsWith('https://s4.anilist.co/')} sizes="(max-width: 850px) 100vw, 900px" />}
            <span className={styles.overlay}><span className={styles.icon} aria-hidden="true">▶</span><span>{d.play}</span></span>
          </button>}
      </div>
      <p className={styles.note}>{d.note} <a href={links.watch} target="_blank" rel="noopener noreferrer">{d.external} ↗</a></p>
    </> : <p className={styles.note}>{d.unavailable}</p>}
  </section>;
}
