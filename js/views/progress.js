// Tab „Fortschritt“: gespeicherte Diagramme und Diagramm-Baukasten.
import * as store from '../store.js';
import { esc } from '../lib/html.js';
import {
  SOURCES, METRICS, RANGES, CHART_TYPES, BODYWEIGHT_STATES,
  chartSeriesSets, metricsFor, defaultTitle, hasRpeData, selectedBodyweightSeries,
} from '../lib/stats.js';
import { renderChart } from '../components/chart.js';
import { openSheet, confirmDialog } from '../components/sheet.js';
import { pickExercise } from '../components/exercise-picker.js';
import { toastError } from '../components/toast.js';
import { icons } from '../components/icons.js';

export function render(root) {
  const charts = store.getCharts();
  const data = { workouts: store.getWorkouts(), bodyweights: store.getBodyweights() };
  // Frischer Container bei jedem Rendern, damit Listener nicht doppelt hängen
  const container = document.createElement('div');
  root.replaceChildren(container);

  container.innerHTML = `
    <div class="section-header page-header">
      <h1>Fortschritt</h1>
      <button type="button" class="btn btn-primary" data-action="new-chart">+ Diagramm</button>
    </div>
    ${charts.length ? '' : '<p class="empty-state">Noch keine Diagramme. Lege mit „+ Diagramm“ eines an.</p>'}
    ${charts
      .map(
        (chart) => `
          <section class="card chart-card" data-chart="${esc(chart.id)}">
            <header class="chart-header">
              <div>
                <h2 class="chart-title">${esc(chart.title)}</h2>
                <p class="muted small">${esc(RANGES[chart.range])}</p>
              </div>
              <button type="button" class="icon-btn" data-action="chart-menu" aria-label="Diagramm-Optionen">${icons.more}</button>
            </header>
            ${chart.source.kind === 'bodyweight' ? renderStateToggles(chart) : ''}
            <div class="chart-body"></div>
          </section>`,
      )
      .join('')}
  `;

  for (const chart of charts) {
    const body = container.querySelector(`[data-chart="${CSS.escape(chart.id)}"] .chart-body`);
    renderChart(body, chartSeriesSets(chart, data), { type: chart.chartType, unit: METRICS[chart.metric]?.unit ?? '' });
  }

  const rerender = () => render(root);

  container.addEventListener('click', async (event) => {
    const toggle = event.target.closest('[data-state-toggle]');
    if (toggle) {
      const chart = store.getChart(toggle.closest('[data-chart]').dataset.chart);
      const states = toggleState(selectedBodyweightSeries(chart), toggle.dataset.stateToggle);
      if (!states) return;
      await store.saveChart({ ...chart, states }).catch(toastError);
      rerender();
      return;
    }
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'new-chart') openBuilder(null, rerender);
    if (button.dataset.action === 'chart-menu') openChartMenu(button.closest('[data-chart]').dataset.chart, rerender);
  });
}

/** Messart an- oder abwählen. Mindestens eine bleibt ausgewählt (sonst null). */
function toggleState(selected, key) {
  const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
  return next.length ? Object.keys(BODYWEIGHT_STATES).filter((k) => next.includes(k)) : null;
}

/** Mehrfachauswahl der Messarten (Farbpunkt = Linienfarbe im Diagramm). */
function renderStateToggles(chart, attr = 'data-state-toggle') {
  const selected = selectedBodyweightSeries(chart);
  return `
    <div class="state-toggles" role="group" aria-label="Messarten anzeigen">
      ${Object.entries(BODYWEIGHT_STATES)
        .map(
          ([key, label]) => `
            <button type="button" class="state-chip" ${attr}="${key}" aria-pressed="${selected.includes(key)}">
              <span class="series-dot series-${key}"></span>${esc(label)}
            </button>`,
        )
        .join('')}
    </div>`;
}

function openChartMenu(id, onChange) {
  const charts = store.getCharts();
  const index = charts.findIndex((c) => c.id === id);
  const chart = charts[index];

  openSheet({
    title: chart.title,
    render(body, close) {
      body.innerHTML = `
        <div class="stack">
          <button type="button" class="btn btn-block" data-do="edit">Bearbeiten</button>
          <button type="button" class="btn btn-block" data-do="up" ${index === 0 ? 'disabled' : ''}>Nach oben</button>
          <button type="button" class="btn btn-block" data-do="down" ${index === charts.length - 1 ? 'disabled' : ''}>Nach unten</button>
          <button type="button" class="btn btn-block btn-danger-outline" data-do="delete">Löschen</button>
        </div>
      `;
      body.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-do]')?.dataset.do;
        if (!action) return;
        try {
          if (action === 'edit') {
            close();
            openBuilder(chart, onChange);
            return;
          }
          if (action === 'up' || action === 'down') {
            await store.moveChart(id, action === 'up' ? -1 : 1);
          } else if (action === 'delete') {
            const ok = await confirmDialog({ title: 'Diagramm löschen?', message: chart.title, confirmLabel: 'Löschen', danger: true });
            if (!ok) return;
            await store.deleteChart(id);
          }
          close();
          onChange();
        } catch (err) {
          toastError(err);
        }
      });
    },
  });
}

/** Builder in vier Schritten: Datenquelle, Metrik, Zeitraum, Typ. */
function openBuilder(existing, onSaved) {
  const draft = existing
    ? structuredClone(existing)
    : { title: '', source: { kind: 'exercise', exerciseId: null }, metric: 'maxWeight', range: '3m', chartType: 'line' };
  // Titel automatisch vorschlagen, bis der Nutzer ihn selbst ändert
  let titleEdited = Boolean(existing) && existing.title !== suggestedTitle(existing);

  function suggestedTitle(chart) {
    const name = chart.source.exerciseId ? store.exerciseName(chart.source.exerciseId) : '';
    return defaultTitle(chart, name);
  }

  function availableMetrics() {
    const hasRpe = draft.source.kind === 'exercise' && draft.source.exerciseId
      ? hasRpeData(store.getWorkouts(), draft.source.exerciseId)
      : false;
    return metricsFor(draft.source.kind, { hasRpe });
  }

  function isValid() {
    return draft.source.kind !== 'exercise' || Boolean(draft.source.exerciseId);
  }

  const segmented = (name, options, current) => `
    <div class="segmented" role="radiogroup">
      ${Object.entries(options)
        .map(([value, label]) => `<button type="button" role="radio" aria-checked="${value === current}" data-set="${name}" data-value="${esc(value)}">${esc(label)}</button>`)
        .join('')}
    </div>`;

  openSheet({
    title: existing ? 'Diagramm bearbeiten' : 'Neues Diagramm',
    render(body, close) {
      function draw() {
        const metrics = availableMetrics();
        if (!metrics.includes(draft.metric)) draft.metric = metrics[0];
        if (!titleEdited) draft.title = isValid() ? suggestedTitle(draft) : '';

        body.innerHTML = `
          <div class="builder">
            <h3>1. Datenquelle</h3>
            ${segmented('kind', SOURCES, draft.source.kind)}
            ${
              draft.source.kind === 'exercise'
                ? `<button type="button" class="btn btn-block builder-exercise" data-pick>
                    ${draft.source.exerciseId ? esc(store.exerciseName(draft.source.exerciseId)) : 'Übung wählen …'}
                  </button>`
                : ''
            }

            <h3>2. Metrik</h3>
            ${segmented('metric', Object.fromEntries(metrics.map((m) => [m, METRICS[m].label])), draft.metric)}
            ${
              draft.source.kind === 'bodyweight'
                ? `<p class="muted small builder-hint">Messarten (mehrere übereinander möglich):</p>${renderStateToggles(draft, 'data-builder-state')}`
                : ''
            }

            <h3>3. Zeitraum</h3>
            ${segmented('range', RANGES, draft.range)}

            <h3>4. Typ</h3>
            ${segmented('chartType', CHART_TYPES, draft.chartType)}

            <label class="field builder-title">
              <span>Titel</span>
              <input type="text" name="title" value="${esc(draft.title)}" autocomplete="off" placeholder="Wird automatisch vorgeschlagen">
            </label>

            <div class="sheet-actions">
              <button type="button" class="btn" data-sheet-close>Abbrechen</button>
              <button type="button" class="btn btn-primary" data-save ${isValid() ? '' : 'disabled'}>Speichern</button>
            </div>
          </div>
        `;
      }

      body.addEventListener('input', (event) => {
        if (event.target.name === 'title') {
          draft.title = event.target.value;
          titleEdited = Boolean(event.target.value.trim());
        }
      });

      body.addEventListener('click', async (event) => {
        const stateButton = event.target.closest('[data-builder-state]');
        if (stateButton) {
          const states = toggleState(selectedBodyweightSeries(draft), stateButton.dataset.builderState);
          if (states) draft.states = states;
          draw();
          return;
        }
        const option = event.target.closest('[data-set]');
        if (option) {
          const { set, value } = option.dataset;
          if (set === 'kind') draft.source = value === 'exercise' ? { kind: 'exercise', exerciseId: draft.source.exerciseId ?? null } : { kind: value };
          else draft[set] = value;
          draw();
          return;
        }
        if (event.target.closest('[data-pick]')) {
          const exercise = await pickExercise({ title: 'Übung wählen' });
          if (exercise) {
            draft.source = { kind: 'exercise', exerciseId: exercise.id };
            draw();
          }
          return;
        }
        if (event.target.closest('[data-save]') && isValid()) {
          if (!draft.title.trim()) draft.title = suggestedTitle(draft);
          if (draft.source.kind !== 'exercise') delete draft.source.exerciseId;
          if (draft.source.kind !== 'bodyweight') delete draft.states;
          try {
            await store.saveChart(draft);
            close();
            onSaved();
          } catch (err) {
            toastError(err);
          }
        }
      });

      draw();
    },
  });
}
