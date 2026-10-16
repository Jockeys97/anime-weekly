import 'server-only';

// Identify the application consistently on OAuth and authenticated API calls.
// https://developer.trakt.tv/docs/required-headers
export function traktHeaders(accessToken?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'AnimeWeekly/0.1.0 (+https://weeklyanime.com)',
    'trakt-api-key': process.env.TRAKT_CLIENT_ID?.trim() ?? '',
    'trakt-api-version': '2',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  };
}
