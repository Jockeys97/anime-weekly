// TMDB sometimes files a new cour as a season of an older series, so the weekly
// TMDB key carries the older work's AniList/IMDb identity and streaming offers.
// These entries pin the cour that is actually airing. Each one is verified by
// hand and expires on its own: never infer them from a shared title prefix.
export interface WeeklyIdentity {
  anilistId: number;
  malId: number;
  imdbId: string;
  /** JustWatch title used for the verified seed page (its IMDb ID must match). */
  justWatchName: string;
  /** Exclusive end (UTC): one week after the final scheduled episode. */
  until: string;
}

const IDENTITIES: Record<string, WeeklyIdentity> = {
  // Verified 2026-10-20. TMDB tv:30984 merges Bleach (2004) with Thousand-Year
  // Blood War; AniList 185874 "The Calamity" airs Jul 2026 to ep. 10 on 2026-10-25.
  // https://anilist.co/anime/185874  https://www.imdb.com/title/tt14986406/
  // https://www.justwatch.com/it/serie-tv/bleach-thousand-year-blood-war (IT: Disney Plus only)
  'tv:30984': { anilistId: 185874, malId: 60636, imdbId: 'tt14986406', justWatchName: 'Bleach: Thousand-Year Blood War', until: '2026-11-02T00:00:00Z' },
};

export function verifiedWeeklyIdentity(key: string, now = Date.now()): WeeklyIdentity | null {
  const identity = IDENTITIES[key];
  return identity && now < Date.parse(identity.until) ? identity : null;
}

/** True when a stored mapping still points at an identity that has since expired. */
export function isExpiredWeeklyIdentity(key: string, ids: { anilistId?: number; imdbId?: string }, now = Date.now()): boolean {
  const identity = IDENTITIES[key];
  return Boolean(identity && now >= Date.parse(identity.until) && (ids.anilistId === identity.anilistId || ids.imdbId === identity.imdbId));
}

/** The pinned weekly entry for an AniList ID, while it is valid. */
export function verifiedIdentityForAnilist(anilistId: number, now = Date.now()): { key: string; identity: WeeklyIdentity } | null {
  const key = Object.keys(IDENTITIES).find(item => IDENTITIES[item].anilistId === anilistId);
  const identity = key ? verifiedWeeklyIdentity(key, now) : null;
  return key && identity ? { key, identity } : null;
}
