import * as store from '../store.js';
import { formatNumber } from '../lib/numbers.js';
import { toastError } from '../components/toast.js';

const REST_STEP = 15;
const REST_MIN = 15;
const REST_MAX = 600;
const WEIGHT_STEPS = [0.5, 1, 1.25, 2, 2.5, 5];

const formatRest = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;

export function render(root) {
  const settings = store.getSettings();

  root.innerHTML = `
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

    <section data-backup-section></section>

    <p class="muted small app-version">Version <span data-version>–</span></p>
  `;

  root.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-rest]');
    if (!button) return;
    const current = store.getSettings().restSeconds;
    const next = Math.min(REST_MAX, Math.max(REST_MIN, current + Number(button.dataset.rest) * REST_STEP));
    root.querySelector('[data-rest-value]').textContent = formatRest(next);
    await store.updateSettings({ restSeconds: next }).catch(toastError);
  });

  root.addEventListener('change', (event) => {
    const key = event.target.dataset.setting;
    if (key === 'weightStep') store.updateSettings({ weightStep: Number(event.target.value) }).catch(toastError);
    if (key === 'rpeEnabled') store.updateSettings({ rpeEnabled: event.target.checked }).catch(toastError);
  });

  showAppVersion(root.querySelector('[data-version]'));
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
