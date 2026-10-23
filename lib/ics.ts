export interface CalendarEpisode { uid: string; title: string; episode: number; airingAt: number }
export function utcCalendarDate(value: number): string {
  return new Date(value * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
// RFC 5545 limits content lines to 75 octets, including continuation spaces.
export function foldCalendarLine(line: string): string {
  const encoder = new TextEncoder(); let result = ''; let current = ''; let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += `${current}\r\n`; current = ' '; bytes = 1; }
    current += char; bytes += size;
  }
  return result + current;
}
export function generateIcs(episodes: readonly CalendarEpisode[], stamp = new Date(), name?: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Weekly Anime//Calendario episodi//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  // Subscribed calendars show this name and poll at the suggested interval.
  if (name) lines.push(`X-WR-CALNAME:${escapeText(name)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H');
  const seen = new Set<string>();
  for (const event of [...episodes].sort((a, b) => a.airingAt - b.airingAt || a.uid.localeCompare(b.uid))) {
    if (!Number.isSafeInteger(event.airingAt) || !Number.isSafeInteger(event.episode) || event.episode <= 0 || !event.uid || seen.has(event.uid) || !Number.isFinite(new Date(event.airingAt * 1000).getTime())) continue;
    seen.add(event.uid);
    lines.push('BEGIN:VEVENT', `UID:${escapeText(event.uid)}`, `DTSTAMP:${utcCalendarDate(Math.floor(stamp.getTime() / 1000))}`, `DTSTART:${utcCalendarDate(event.airingAt)}`, `SUMMARY:${escapeText(`${event.title} – Ep ${event.episode}`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
export function calendarResponse(episodes: readonly CalendarEpisode[], filename: string, name?: string): Response {
  return new Response(generateIcs(episodes, new Date(), name), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400' } });
}
