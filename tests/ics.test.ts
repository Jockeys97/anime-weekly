import { expect, it } from 'vitest';
import { calendarResponse, foldCalendarLine, generateIcs } from '../lib/ics';
const event = { uid: 'anilist-21-episode-2@anime-weekly', title: 'Title', episode: 2, airingAt: Date.parse('2026-10-14T15:00:00Z') / 1000 };
const stamp = new Date('2026-10-14T12:00:00Z');
it('generates a complete UTC calendar with stable UIDs, summaries, CRLF and deterministic ordering', () => {
  const ics = generateIcs([{ ...event, episode: 3, uid: 'later', airingAt: event.airingAt + 86400 }, event, event], stamp);
  expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
  expect(ics).toContain('DTSTART:20261014T150000Z\r\n');
  expect(ics).toContain('DTSTAMP:20261014T120000Z\r\n');
  expect(ics).toContain('SUMMARY:Title – Ep 2\r\n');
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
  expect(ics.indexOf(event.uid)).toBeLessThan(ics.indexOf('UID:later'));
  expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
});
it('escapes text against calendar injection and folds at 75 UTF-8 octets without breaking Unicode', () => {
  const title = 'é'.repeat(80) + ',semi;slash\\\r\nBEGIN:VEVENT';
  const ics = generateIcs([{ ...event, title }], stamp);
  expect(ics.match(/BEGIN:VEVENT\r\n/g)).toHaveLength(1);
  const unfolded = ics.replace(/\r\n /g, '');
  expect(unfolded).toContain('\\,semi\\;slash\\\\\\nBEGIN:VEVENT – Ep 2');
  for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  expect(foldCalendarLine('a'.repeat(76))).toBe('a'.repeat(75) + '\r\n a');
});
it('returns a valid empty calendar for missing data and excludes invalid episodes', async () => {
  expect(generateIcs([{ ...event, episode: 0 }, { ...event, airingAt: NaN }], stamp)).not.toContain('BEGIN:VEVENT');
  const response = calendarResponse([], 'week.ics');
  expect(response.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
  expect(response.headers.get('Content-Disposition')).toContain('filename="week.ics"');
  expect(await response.text()).toContain('END:VCALENDAR');
});
