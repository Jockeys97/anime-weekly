import 'server-only';

export type AnimeProvider = 'trakt' | 'mal';
export function myAnimeConfig(env: Partial<NodeJS.ProcessEnv> = process.env) {
  const secret = Boolean(env.AUTH_COOKIE_SECRET?.trim());
  const trakt = secret && Boolean(env.TRAKT_CLIENT_ID?.trim() && env.TRAKT_CLIENT_SECRET?.trim());
  const mal = secret && Boolean(env.MAL_CLIENT_ID?.trim());
  return { enabled: trakt || mal, trakt, mal };
}
