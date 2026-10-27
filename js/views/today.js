import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { parseDecimal, formatNumber } from '../lib/numbers.js';
import { dayKey, formatDateLong, formatTime, parseDayKey } from '../lib/time.js';
import { openSheet, confirmDialog } from '../components/sheet.js';
import { toast, toastError } from '../components/toast.js';
import { navigate } from '../nav.js';
import { shouldRemind, SNOOZE_MS } from '../lib/backup.js';
import { exportBackup } from '../components/backup-actions.js';
import { BODYWEIGHT_STATES, DEFAULT_BODYWEIGHT_STATE } from '../lib/stats.js';

/** Auswahl der Messart (genau eine, Standard „Normal“). */
function renderStateChoice(current = DEFAULT_BODYWEIGHT_STATE) {
  return `
    <div class="state-choice" role="radiogroup" aria-label="Messart">
      ${Object.entries(BODYWEIGHT_STATES)
        .map(([key, label]) => `<button type="button" role="radio" class="state-chip" data-bw-state="${key}" aria-checked="${key === current}">${esc(label)}</button>`)
        .join('')}
    </div>`;
}

/** Klick auf eine Messart im Container übernehmen. Gibt true zurück, wenn der Klick eine Messart war. */
function handleStateClick(event) {
  const chip = event.target.closest('[data-bw-state]');
  if (!chip) return false;
  for (const el of chip.parentElement.querySelectorAll('[data-bw-state]')) {
    el.setAttribute('aria-checked', String(el === chip));
  }
  return true;
}

function selectedState(container) {
  return container.querySelector('[data-bw-state][aria-checked="true"]')?.dataset.bwState ?? DEFAULT_BODYWEIGHT_STATE;
}

export function render(root) {
  // Frischer Container bei jedem Rendern, damit Listener nicht doppelt hängen
  const container = document.createElement('div');
  root.replaceChildren(container);

  const active = store.getActiveWorkout();
  const templates = store.getTemplates();
  const todayKey = dayKey(Date.now());
  const todayWeight = store.getBodyweight(todayKey);
  const lastWeight = store.getBodyweights().at(-1);
  const backup = store.getBackupMeta();
  const remindBackup = shouldRemind({
    backup,
    reminderDays: store.getSettings().backupReminderDays,
    hasFinishedWorkout: store.getFinishedWorkouts().length > 0,
  });

  container.innerHTML = `
    <h1>Training</h1>
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

    ${
      remindBackup
        ? `<section class="card banner-backup">
            <div class="banner-title">Zeit für ein Backup</div>
            <p class="muted small">${backup.lastExportAt ? `Letzter Export am ${formatDateLong(backup.lastExportAt)}.` : 'Es gibt noch kein Backup.'}
              Die Daten liegen nur auf diesem iPhone.</p>
            <div class="sheet-actions">
              <button type="button" class="btn" data-action="backup-later">Später</button>
              <button type="button" class="btn btn-primary" data-action="backup-now">Jetzt exportieren</button>
            </div>
          </section>`
        : ''
    }

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
        ${renderStateChoice(todayWeight?.state)}
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
      await store.setBodyweight(todayKey, kg, selectedState(event.target));
      event.target.elements.kg.blur();
      toast(`${formatNumber(kg)} kg gespeichert`);
      render(root);
    } catch (err) {
      toastError(err);
    }
  });

  container.addEventListener('click', async (event) => {
    if (handleStateClick(event)) return;
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'bw-history') {
      openBodyweightHistory(() => render(root));
      return;
    }
    if (action === 'backup-now') {
      if (await exportBackup()) render(root);
      return;
    }
    if (action === 'backup-later') {
      await store.snoozeBackupReminder(Date.now() + SNOOZE_MS).catch(toastError);
      render(root);
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

/** Gewicht und Messart eines Eintrags ändern. Resolves true nach dem Speichern. */
function editBodyweight(date, title) {
  const entry = store.getBodyweight(date);
  return new Promise((resolve) => {
    let saved = false;
    openSheet({
      title,
      onClose: () => resolve(saved),
      render(body, close) {
        body.innerHTML = `
          <form class="stack">
            <label class="field">
              <span>Gewicht in kg</span>
              <input type="text" inputmode="decimal" name="kg" value="${esc(formatNumber(entry.kg))}" autocomplete="off">
            </label>
            ${renderStateChoice(entry.state)}
            <div class="sheet-actions">
              <button type="button" class="btn" data-sheet-close>Abbrechen</button>
              <button type="submit" class="btn btn-primary">Speichern</button>
            </div>
          </form>
        `;
        const form = body.querySelector('form');
        form.addEventListener('click', handleStateClick);
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const kg = parseDecimal(form.elements.kg.value);
          try {
            if (kg == null || kg <= 0) throw new Error('Bitte ein gültiges Gewicht eingeben.');
            await store.setBodyweight(date, kg, selectedState(form));
            saved = true;
            close();
          } catch (err) {
            toastError(err);
          }
        });
      },
    });
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
                      <span class="bw-date">${formatDateLong(parseDayKey(e.date).getTime())}
                        <span class="muted small">${esc(BODYWEIGHT_STATES[e.state] ?? BODYWEIGHT_STATES[DEFAULT_BODYWEIGHT_STATE])}</span></span>
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
            if (await editBodyweight(date, label)) draw();
            return;
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
