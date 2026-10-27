import * as store from '../store.js';
import { formatNumber } from '../lib/numbers.js';
import { toastError } from '../components/toast.js';
import { exportBackup, importBackup } from '../components/backup-actions.js';
import { REMINDER_OPTIONS } from '../lib/backup.js';
import { formatDateLong } from '../lib/time.js';

const REST_STEP = 15;
const REST_MIN = 15;
const REST_MAX = 600;
const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5];

const formatRest = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;

export function render(root) {
  // Frischer Container bei jedem Rendern, damit Listener nicht doppelt hängen
  const container = document.createElement('div');
  root.replaceChildren(container);
  const settings = store.getSettings();
  const backup = store.getBackupMeta();

  container.innerHTML = `
    <h1>Einstellungen</h1>

    <section class="card settings-group">
      <h2>Training</h2>
      <div class="setting-row">
        <span>Pausentimer</span>
        <div class="stepper">
          <button type="button" class="icon-btn" data-rest="-1" aria-label="Kürzer">−</button>
          <span class="stepper-value" data-rest-value>${formatRest(settings.restSeconds)}</span>
          <button type="button" class="icon-btn" data-rest="1" aria-label="Länger">+</button>
        </div>
      </div>
      <label class="setting-row">
        <span>Gewicht-Schrittweite</span>
        <select data-setting="weightStep" class="setting-select">
          ${WEIGHT_STEPS.map((v) => `<option value="${v}" ${v === settings.weightStep ? 'selected' : ''}>${formatNumber(v)} kg</option>`).join('')}
        </select>
      </label>
      <label class="setting-row">
        <span>RPE pro Satz erfassen</span>
        <input type="checkbox" class="toggle" data-setting="rpeEnabled" ${settings.rpeEnabled ? 'checked' : ''}>
      </label>
      <p class="muted small">Ausgeblendete RPE-Werte bleiben gespeichert.</p>
    </section>

    <section class="card settings-group">
      <h2>Backup</h2>
      <p class="muted small">
        Alle Daten liegen nur auf diesem Gerät. Letzter Export:
        <strong>${backup.lastExportAt ? formatDateLong(backup.lastExportAt) : 'noch nie'}</strong>
      </p>
      <div class="stack">
        <button type="button" class="btn btn-primary btn-block" data-action="export">Backup exportieren</button>
        <button type="button" class="btn btn-block" data-action="import">Backup importieren</button>
      </div>
      <label class="setting-row">
        <span>Erinnerung</span>
        <select data-setting="backupReminderDays" class="setting-select">
          ${REMINDER_OPTIONS.map((d) => `<option value="${d}" ${d === settings.backupReminderDays ? 'selected' : ''}>${d ? `alle ${d} Tage` : 'aus'}</option>`).join('')}
        </select>
      </label>
    </section>

    <p class="muted small app-version">Version <span data-version>–</span></p>
  `;

  container.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') {
      if (await exportBackup()) render(root);
      return;
    }
    if (action === 'import') {
      importBackup(() => render(root));
      return;
    }
    const button = event.target.closest('[data-rest]');
    if (!button) return;
    const current = store.getSettings().restSeconds;
    const next = Math.min(REST_MAX, Math.max(REST_MIN, current + Number(button.dataset.rest) * REST_STEP));
    container.querySelector('[data-rest-value]').textContent = formatRest(next);
    await store.updateSettings({ restSeconds: next }).catch(toastError);
  });

  container.addEventListener('change', (event) => {
    const key = event.target.dataset.setting;
    if (key === 'weightStep') store.updateSettings({ weightStep: Number(event.target.value) }).catch(toastError);
    if (key === 'rpeEnabled') store.updateSettings({ rpeEnabled: event.target.checked }).catch(toastError);
    if (key === 'backupReminderDays') store.updateSettings({ backupReminderDays: Number(event.target.value) }).catch(toastError);
  });

  showAppVersion(container.querySelector('[data-version]'));
}

// APP_VERSION steht nur in sw.js, deshalb fragt die Seite den aktiven Service Worker.
function showAppVersion(target) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return;
  const onMessage = (event) => {
    if (event.data?.type !== 'VERSION') return;
    target.textContent = event.data.version;
    navigator.serviceWorker.removeEventListener('message', onMessage);
  };
  navigator.serviceWorker.addEventListener('message', onMessage);
  controller.postMessage({ type: 'GET_VERSION' });
}
