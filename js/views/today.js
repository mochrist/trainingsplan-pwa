import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { parseDecimal, formatNumber } from '../lib/numbers.js';
import { dayKey, formatDateLong, formatTime, parseDayKey } from '../lib/time.js';
import { openSheet, confirmDialog, promptDialog } from '../components/sheet.js';
import { toast, toastError } from '../components/toast.js';
import { navigate } from '../nav.js';

export function render(root) {
  // Frischer Container bei jedem Rendern, damit Listener nicht doppelt hängen
  const container = document.createElement('div');
  root.replaceChildren(container);

  const active = store.getActiveWorkout();
  const templates = store.getTemplates();
  const todayKey = dayKey(Date.now());
  const todayWeight = store.getBodyweight(todayKey);
  const lastWeight = store.getBodyweights().at(-1);

  container.innerHTML = `
    <h1>Heute</h1>
    <p class="muted subtitle">${formatDateLong(Date.now())}</p>

    ${
      active
        ? `<a class="card banner banner-active" href="#/workout">
            <div>
              <div class="banner-title">Training fortsetzen</div>
              <div class="muted small">${esc(active.name)} · seit ${formatTime(active.startedAt)} Uhr</div>
            </div>
            <span class="btn btn-primary">Weiter</span>
          </a>`
        : ''
    }

    <div data-backup-banner></div>

    <section>
      <h2>Training starten</h2>
      <div class="start-grid">
        ${templates
          .map(
            (t) => `
              <button type="button" class="start-btn" data-start="${esc(t.id)}" ${active ? 'disabled' : ''}>
                <span class="start-btn-title">${esc(t.name)}</span>
                <span class="muted small">${t.items.length} ${t.items.length === 1 ? 'Übung' : 'Übungen'}</span>
              </button>`,
          )
          .join('')}
        <button type="button" class="start-btn start-btn-free" data-start="" ${active ? 'disabled' : ''}>
          <span class="start-btn-title">Freitext-Training</span>
          <span class="muted small">Übungen frei wählen</span>
        </button>
      </div>
      ${templates.length ? '' : '<p class="muted small">Templates legst du im Tab „Pläne“ an.</p>'}
    </section>

    <section class="card bw-card">
      <form class="bw-form" data-bw-form>
        <label class="bw-label" for="bw-input">Körpergewicht heute</label>
        <div class="input-row">
          <input id="bw-input" type="text" inputmode="decimal" autocomplete="off" name="kg"
            value="${todayWeight ? esc(formatNumber(todayWeight.kg)) : ''}"
            placeholder="${lastWeight ? esc(formatNumber(lastWeight.kg)) : 'kg'}" aria-label="Körpergewicht in kg">
          <button type="submit" class="btn btn-primary">${todayWeight ? 'Ändern' : 'Speichern'}</button>
        </div>
      </form>
      <button type="button" class="btn-link" data-action="bw-history">Verlauf ansehen</button>
    </section>
  `;

  container.querySelector('[data-bw-form]').addEventListener('submit', async (event) => {
    event.preventDefault();
    const kg = parseDecimal(event.target.elements.kg.value);
    if (kg == null || kg <= 0) {
      toastError(new Error('Bitte ein gültiges Gewicht eingeben.'));
      return;
    }
    try {
      await store.setBodyweight(todayKey, kg);
      event.target.elements.kg.blur();
      toast(`${formatNumber(kg)} kg gespeichert`);
      render(root);
    } catch (err) {
      toastError(err);
    }
  });

  container.addEventListener('click', async (event) => {
    if (event.target.closest('[data-action="bw-history"]')) {
      openBodyweightHistory(() => render(root));
      return;
    }
    const button = event.target.closest('[data-start]');
    if (!button || button.disabled) return;
    try {
      await store.startWorkout({ templateId: button.dataset.start || null });
      navigate('workout');
    } catch (err) {
      toastError(err);
    }
  });
}

function openBodyweightHistory(onChange) {
  openSheet({
    title: 'Körpergewicht',
    onClose: onChange,
    render(body) {
      function draw() {
        const entries = store.getBodyweights().reverse();
        body.innerHTML = entries.length
          ? `<ul class="list bw-list">
              ${entries
                .map(
                  (e) => `
                    <li class="bw-entry" data-date="${e.date}">
                      <span class="bw-date">${formatDateLong(parseDayKey(e.date).getTime())}</span>
                      <span class="bw-kg">${formatNumber(e.kg)} kg</span>
                      <button type="button" class="icon-btn" data-do="edit" aria-label="Bearbeiten">✎</button>
                      <button type="button" class="icon-btn" data-do="delete" aria-label="Löschen">✕</button>
                    </li>`,
                )
                .join('')}
            </ul>`
          : '<p class="empty-state">Noch keine Einträge.</p>';
      }

      body.addEventListener('click', async (event) => {
        const action = event.target.closest('[data-do]')?.dataset.do;
        const date = event.target.closest('[data-date]')?.dataset.date;
        if (!action || !date) return;
        const label = formatDateLong(parseDayKey(date).getTime());
        try {
          if (action === 'edit') {
            const value = await promptDialog({
              title: label,
              label: 'Gewicht in kg',
              value: formatNumber(store.getBodyweight(date).kg),
              inputmode: 'decimal',
            });
            if (value == null) return;
            const kg = parseDecimal(value);
            if (kg == null || kg <= 0) throw new Error('Bitte ein gültiges Gewicht eingeben.');
            await store.setBodyweight(date, kg);
          } else if (action === 'delete') {
            if (!(await confirmDialog({ title: 'Eintrag löschen?', message: label, confirmLabel: 'Löschen', danger: true }))) return;
            await store.deleteBodyweight(date);
          }
          draw();
        } catch (err) {
          toastError(err);
        }
      });

      draw();
    },
  });
}
