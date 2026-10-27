// Feste Zeitzone, damit Kalender- und Sommerzeittests überall gleich laufen
process.env.TZ = 'Europe/Berlin';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey, parseDayKey, monthGrid, addMonths, formatDuration, formatMinutes, formatDateShort,
  combineDateTime, rangeStart, formatDaysAgo,
} from '../js/lib/time.js';

test('monthGrid beginnt am Montag und enthält ganze Wochen', () => {
  // Oktober 2026 beginnt an einem Donnerstag
  const weeks = monthGrid(2026, 9);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[0][0].key, '2026-09-28');
  assert.equal(weeks[0][3].key, '2026-10-01');
  assert.equal(weeks[0][0].inMonth, false);
  assert.equal(weeks[0][3].inMonth, true);
  const last = weeks.at(-1);
  assert.equal(last[5].key, '2026-10-31');
  assert.equal(last[6].key, '2026-11-01');
  assert.equal(weeks.flat().filter((c) => c.inMonth).length, 31);
});

test('monthGrid: Monat, der an einem Montag beginnt (Juni 2026)', () => {
  const weeks = monthGrid(2026, 5);
  assert.equal(weeks[0][0].key, '2026-06-01');
  assert.equal(weeks.length, 5);
});

test('monthGrid: Februar im Schaltjahr und über den Jahreswechsel', () => {
  assert.equal(monthGrid(2028, 1).flat().filter((c) => c.inMonth).length, 29);
  const dec = monthGrid(2026, 11);
  assert.equal(dec.at(-1).at(-1).key, '2027-01-03');
});

test('monthGrid: Sommerzeitwechsel verschluckt keinen Tag', () => {
  for (const month of [2, 9]) {
    const keys = monthGrid(2026, month).flat().map((c) => c.key);
    assert.equal(new Set(keys).size, keys.length);
  }
});

test('addMonths über Jahresgrenzen', () => {
  assert.deepEqual(addMonths({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
});

test('dayKey und parseDayKey in lokaler Zeit', () => {
  const ts = new Date(2026, 9, 22, 23, 59).getTime();
  assert.equal(dayKey(ts), '2026-10-22');
  assert.equal(parseDayKey('2026-10-22').getDate(), 22);
});

test('formatDuration: mm:ss und ab einer Stunde h:mm:ss', () => {
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(65_000), '01:05');
  assert.equal(formatDuration(3_725_000), '1:02:05');
  assert.equal(formatMinutes(42 * 60000), '42 min');
  assert.equal(formatMinutes(65 * 60000), '1 h 05 min');
});

test('formatDateShort im deutschen Format', () => {
  assert.equal(formatDateShort(new Date(2026, 9, 22).getTime()), 'Do., 22.10.');
});

test('combineDateTime', () => {
  assert.equal(combineDateTime('2026-10-22', '18:05'), new Date(2026, 9, 22, 18, 5).getTime());
  assert.equal(combineDateTime('', '18:05'), null);
  assert.equal(combineDateTime('2026-10-22', ''), null);
});

test('rangeStart', () => {
  const now = new Date(2026, 9, 27, 12).getTime();
  assert.equal(rangeStart('4w', now), now - 28 * 86400000);
  assert.equal(rangeStart('3m', now), new Date(2026, 6, 27).getTime());
  assert.equal(rangeStart('1y', now), new Date(2025, 9, 27).getTime());
  assert.equal(rangeStart('all', now), -Infinity);
});

test('formatDaysAgo nach Kalendertagen, auch über die Zeitumstellung', () => {
  const now = new Date(2026, 9, 27, 8).getTime();
  assert.equal(formatDaysAgo(new Date(2026, 9, 27, 0, 5).getTime(), now), 'heute');
  assert.equal(formatDaysAgo(new Date(2026, 9, 26, 23, 50).getTime(), now), 'gestern');
  assert.equal(formatDaysAgo(new Date(2026, 9, 20, 18).getTime(), now), 'vor 7 Tagen');
});
