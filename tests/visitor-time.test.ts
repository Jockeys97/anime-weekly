import { expect, it } from 'vitest';
import { calendarDate, formatVisitorDate, validTimeZone } from '../lib/visitor-time';
it('defaults to Italian dates and Rome time, including daylight saving', () => {
  expect(formatVisitorDate('2026-10-14')).toBe('14 ott 2026');
  expect(formatVisitorDate('2026-10-14T14:00:00Z', undefined, undefined, { hour: '2-digit', minute: '2-digit' })).toBe('16:00');
  expect(formatVisitorDate('2026-12-14T14:00:00Z', undefined, undefined, { hour: '2-digit', minute: '2-digit' })).toBe('15:00');
});
it('uses the visitor locale and timezone without shifting date-only releases', () => {
  expect(calendarDate(Date.parse('2026-10-12T23:30:00Z'), 'Europe/Rome')).toBe('2026-10-13');
  expect(formatVisitorDate('2026-10-14', 'en-US', 'America/Los_Angeles')).toBe('Oct 14, 2026');
  expect(validTimeZone('Invalid/Zone')).toBe('Europe/Rome');
});
