import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { formatDateLong, formatTime } from '../lib/time.js';
import { toastError } from '../components/toast.js';
import { navigate } from '../nav.js';

export function render(root) {
  const active = store.getActiveWorkout();
  const templates = store.getTemplates();

  root.innerHTML = `
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
  `;

  root.addEventListener('click', async (event) => {
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
