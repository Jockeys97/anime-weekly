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
