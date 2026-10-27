import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { dayKey, monthGrid, addMonths, MONTHS, WEEKDAYS_MONDAY_FIRST, formatTime, formatMinutes, formatDateLong, parseDayKey } from '../lib/time.js';

const MAX_DOTS = 3;

// Bleibt beim Wechsel ins Session-Detail und zurück erhalten
let shown = null;
let selectedDay = null;

function currentMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function render(root) {
  shown ??= currentMonth();

  // Sessions nach Kalendertag gruppieren
  const byDay = new Map();
  for (const workout of store.getFinishedWorkouts()) {
    const key = dayKey(workout.startedAt);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(workout);
  }

  function draw() {
    const todayKey = dayKey(Date.now());
    const weeks = monthGrid(shown.year, shown.month);
    const monthPrefix = `${shown.year}-${String(shown.month + 1).padStart(2, '0')}-`;
    const monthCount = [...byDay.entries()]
      .filter(([key]) => key.startsWith(monthPrefix))
      .reduce((sum, [, list]) => sum + list.length, 0);

    root.innerHTML = `
      <div class="cal-header">
        <button type="button" class="icon-btn" data-nav="-1" aria-label="Vorheriger Monat">‹</button>
        <h1 class="cal-title">${MONTHS[shown.month]} ${shown.year}</h1>
        <button type="button" class="icon-btn" data-nav="1" aria-label="Nächster Monat">›</button>
        <button type="button" class="btn" data-nav="today">Heute</button>
      </div>

      <div class="cal-grid" role="grid">
        ${WEEKDAYS_MONDAY_FIRST.map((d) => `<div class="cal-weekday" role="columnheader">${d}</div>`).join('')}
        ${weeks
          .flat()
          .map((cell) => {
            const sessions = byDay.get(cell.key) ?? [];
            const classes = ['cal-day'];
            if (!cell.inMonth) classes.push('is-outside');
            if (cell.key === todayKey) classes.push('is-today');
            if (cell.key === selectedDay) classes.push('is-selected');
            if (sessions.length) classes.push('has-sessions');
            const label = `${cell.day}.${sessions.length ? ` – ${sessions.length} ${sessions.length === 1 ? 'Training' : 'Trainings'}` : ''}`;
            return `
              <button type="button" class="${classes.join(' ')}" data-day="${cell.key}" aria-label="${esc(label)}">
                <span class="cal-num">${cell.day}</span>
                <span class="cal-dots">${'<span class="cal-dot"></span>'.repeat(Math.min(sessions.length, MAX_DOTS))}</span>
              </button>`;
          })
          .join('')}
      </div>

      <p class="muted cal-count">${monthCount} ${monthCount === 1 ? 'Training' : 'Trainings'} in diesem Monat</p>

      ${selectedDay && byDay.has(selectedDay) ? renderDayList(selectedDay, byDay.get(selectedDay)) : ''}
    `;
  }

  root.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-nav]');
    if (nav) {
      shown = nav.dataset.nav === 'today' ? currentMonth() : addMonths(shown, Number(nav.dataset.nav));
      if (nav.dataset.nav === 'today') selectedDay = dayKey(Date.now());
      draw();
      return;
    }
    const day = event.target.closest('[data-day]');
    if (day) {
      const key = day.dataset.day;
      selectedDay = byDay.has(key) && selectedDay !== key ? key : null;
      // Tap auf einen Tag im Nachbarmonat wechselt dorthin
      const date = parseDayKey(key);
      if (date.getMonth() !== shown.month) shown = { year: date.getFullYear(), month: date.getMonth() };
      draw();
      root.querySelector('.day-list')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  });

  draw();
}

function renderDayList(key, sessions) {
  const sorted = [...sessions].sort((a, b) => a.startedAt - b.startedAt);
  return `
    <section class="day-list">
      <h2>${formatDateLong(parseDayKey(key).getTime())}</h2>
      <ul class="list">
        ${sorted
          .map(
            (w) => `
              <li>
                <a class="list-item" href="#/session/${esc(w.id)}">
                  <span class="list-item-title">${esc(w.name)}</span>
                  <span class="muted small">${formatTime(w.startedAt)} Uhr</span>
                  <span class="muted list-item-sub">${formatMinutes(w.endedAt - w.startedAt)} · ${w.items.length} ${w.items.length === 1 ? 'Übung' : 'Übungen'}</span>
                </a>
              </li>`,
          )
          .join('')}
      </ul>
    </section>
  `;
}
