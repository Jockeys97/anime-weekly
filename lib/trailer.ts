export interface AnimeTrailer { id: string | null; site: string | null }
export function trailerLinks(trailer: AnimeTrailer | null | undefined): { watch: string; embed: string } | null {
  if (trailer?.site === 'youtube' && /^[A-Za-z0-9_-]{11}$/.test(trailer.id || '')) {
    return { watch: `https://www.youtube.com/watch?v=${trailer.id}`, embed: `https://www.youtube-nocookie.com/embed/${trailer.id}?autoplay=1` };
  }
  if (trailer?.site === 'dailymotion' && /^[A-Za-z0-9]{6,20}$/.test(trailer.id || '')) {
    return { watch: `https://www.dailymotion.com/video/${trailer.id}`, embed: `https://www.dailymotion.com/embed/video/${trailer.id}?autoplay=1` };
  }
  return null;
}

/** Chrome-less autoplay embed for hover previews. Browsers allow sound only after
 *  the visitor has interacted with the page, so callers pick the muted variant otherwise. */
export function trailerPreview(trailer: AnimeTrailer | null | undefined, muted = true): string | null {
  const links = trailerLinks(trailer);
  if (!links) return null;
  const mute = muted ? '&mute=1' : '&mute=0';
  return trailer!.site === 'youtube'
    ? `${links.embed}${mute}&controls=0&playsinline=1&rel=0&modestbranding=1&disablekb=1`
    : `${links.embed}${mute}&controls=0&queue-enable=false&ui-start-screen-info=false`;
}
