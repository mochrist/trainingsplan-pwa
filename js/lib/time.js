// Datum, Zeit und Kalenderlogik in lokaler Zeit (ohne DOM).

export const WEEKDAYS_SHORT = ['So.', 'Mo.', 'Di.', 'Mi.', 'Do.', 'Fr.', 'Sa.'];
export const WEEKDAYS_MONDAY_FIRST = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

/** Kalendertag in lokaler Zeit: 'YYYY-MM-DD'. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 'YYYY-MM-DD' → lokales Date um 0:00. */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Laufende Dauer: m:ss bzw. ab einer Stunde h:mm:ss. */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Dauer für Listen: "42 min" bzw. "1 h 05 min". */
export function formatMinutes(ms) {
  const minutes = Math.round(Math.max(0, ms) / 60000);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)} min`;
}

/** "Do., 22.10." */
export function formatDateShort(ts) {
  const d = new Date(ts);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** "22.10.2026" */
export function formatDate(ts) {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "Do., 22.10.2026" */
export function formatDateLong(ts) {
  return `${WEEKDAYS_SHORT[new Date(ts).getDay()]}, ${formatDate(ts)}`;
}

/** "18:05" */
export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Werte für <input type="date"> und <input type="time">. */
export function toDateInput(ts) {
  return dayKey(ts);
}

export function toTimeInput(ts) {
  return formatTime(ts);
}

/** 'YYYY-MM-DD' + 'HH:MM' → Zeitstempel in lokaler Zeit, ungültig → null. */
export function combineDateTime(dateStr, timeStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) || !/^\d{2}:\d{2}$/.test(timeStr)) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const date = new Date(y, m - 1, d, hh, mm);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Monatsraster mit Wochenstart Montag. Liefert ganze Wochen inkl. Tage der Nachbarmonate.
 * @param month 0–11
 * @returns [[{ key, day, inMonth }, …7], …]
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const weeks = [];
  // Tagesweise über setDate, damit Sommerzeitwechsel nicht stören
  const cursor = new Date(year, month, 1 - offset);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push({ key: dayKey(cursor), day: cursor.getDate(), inMonth: cursor.getMonth() === month });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === month);
  return weeks;
}

/** Monat verschieben: { year, month } ± delta. */
export function addMonths({ year, month }, delta) {
  const d = new Date(year, month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

/** Beginn eines Diagramm-Zeitraums ('4w', '3m', '6m', '1y', 'all'). */
export function rangeStart(range, now = Date.now()) {
  const d = new Date(now);
  switch (range) {
    case '4w':
      return now - 28 * DAY_MS;
    case '3m':
      return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate()).getTime();
    case '6m':
      return new Date(d.getFullYear(), d.getMonth() - 6, d.getDate()).getTime();
    case '1y':
      return new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()).getTime();
    default:
      return -Infinity;
  }
}

export { DAY_MS };
