// Session-Detail (Kalender) und Zusammenfassung nach dem Beenden.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { formatNumber } from '../lib/numbers.js';
import { formatDateLong, formatTime, formatMinutes } from '../lib/time.js';
import { workoutTotals } from '../lib/stats.js';
import { icons } from '../components/icons.js';

export function render(root, [id, mode] = []) {
  const workout = store.getWorkout(id);
  if (!workout || workout.status !== 'finished') {
    root.innerHTML = `
      <a href="#/calendar" class="btn">‹ Kalender</a>
      <p class="empty-state">Training nicht gefunden.</p>
    `;
    return;
  }
  renderView(root, workout, mode === 'summary');
}

function getPrSetIds() {
  return new Set();
}

function renderView(root, workout, isSummary) {
  const settings = store.getSettings();
  const prSetIds = getPrSetIds();
  const totals = workoutTotals(workout, prSetIds);

  root.innerHTML = `
    <div class="toolbar">
      ${isSummary ? '<span></span>' : '<a href="#/calendar" class="btn">‹ Kalender</a>'}
    </div>

    ${isSummary ? '<p class="summary-kicker">Training beendet</p>' : ''}
    <h1>${esc(workout.name)}</h1>
    <p class="muted subtitle">${formatDateLong(workout.startedAt)} · ${formatTime(workout.startedAt)}–${formatTime(workout.endedAt)} Uhr</p>

    <div class="stat-grid">
      <div class="stat"><span class="stat-value">${formatMinutes(totals.durationMs)}</span><span class="stat-label">Dauer</span></div>
      <div class="stat"><span class="stat-value">${totals.setCount}</span><span class="stat-label">Sätze</span></div>
      <div class="stat"><span class="stat-value">${formatNumber(Math.round(totals.volume))} kg</span><span class="stat-label">Volumen</span></div>
      <div class="stat"><span class="stat-value">${totals.prCount}</span><span class="stat-label">PRs</span></div>
    </div>

    ${workout.items.map((item) => renderItem(item, prSetIds, settings)).join('')}

    ${isSummary ? '<a href="#/today" class="btn btn-primary btn-block">Fertig</a>' : ''}
  `;
}

function renderItem(item, prSetIds, settings) {
  let workNumber = 0;
  const rows = item.sets
    .map((set) => {
      const label = set.type === 'warmup' ? 'W' : ++workNumber;
      const rpe = settings.rpeEnabled && set.rpe != null ? ` <span class="muted">@${formatNumber(set.rpe)}</span>` : '';
      return `
        <li class="detail-set${set.type === 'warmup' ? ' is-warmup' : ''}">
          <span class="detail-set-num">${label}</span>
          <span class="detail-set-values">${formatNumber(set.weight)} kg × ${set.reps}${rpe}</span>
          ${prSetIds.has(set.id) ? `<span class="pr-inline" title="Persönlicher Rekord">${icons.trophy}</span>` : ''}
          ${set.note ? `<span class="detail-set-note muted small">${esc(set.note)}</span>` : ''}
        </li>`;
    })
    .join('');
  return `
    <section class="card">
      <h3 class="detail-ex-name">${esc(store.exerciseName(item.exerciseId))}</h3>
      <ul class="detail-sets">${rows}</ul>
    </section>
  `;
}
