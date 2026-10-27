import * as store from '../store.js';
import { esc } from '../lib/html.js';
import { normalizeName } from '../lib/normalize.js';
import { openSheet, confirmDialog, promptDialog } from '../components/sheet.js';
import { toast, toastError } from '../components/toast.js';

let libraryQuery = '';
let showArchived = false;

export function render(root) {
  root.innerHTML = `
    <h1>Pläne</h1>

    <section class="library">
      <div class="section-header">
        <h2>Übungen</h2>
        <button type="button" class="btn" data-action="new-exercise">+ Übung</button>
      </div>
      <input type="search" class="search-input" placeholder="Übungen durchsuchen" value="${esc(libraryQuery)}"
        autocomplete="off" aria-label="Übungen durchsuchen">
      <label class="switch-row">
        <input type="checkbox" data-action="toggle-archived" ${showArchived ? 'checked' : ''}>
        <span>Archivierte anzeigen</span>
      </label>
      <ul class="list" data-exercise-list></ul>
    </section>
  `;

  const listEl = root.querySelector('[data-exercise-list]');
  const renderLibrary = () => {
    listEl.innerHTML = renderExerciseList();
  };
  renderLibrary();

  root.querySelector('.search-input').addEventListener('input', (event) => {
    libraryQuery = event.target.value;
    renderLibrary();
  });

  root.addEventListener('change', (event) => {
    if (event.target.matches('[data-action="toggle-archived"]')) {
      showArchived = event.target.checked;
      renderLibrary();
    }
  });

  root.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'new-exercise') {
      const name = await promptDialog({ title: 'Neue Übung', label: 'Name', confirmLabel: 'Anlegen' });
      if (name == null) return;
      try {
        const existing = store.getExercises().find((e) => e.nameNorm === normalizeName(name));
        await store.createExercise(name);
        if (existing && !existing.archived) toast(`„${existing.name}“ gibt es schon.`);
        renderLibrary();
      } catch (err) {
        toastError(err);
      }
    } else if (action === 'open-exercise') {
      openExerciseSheet(target.dataset.id, renderLibrary);
    }
  });
}

function renderExerciseList() {
  const queryNorm = normalizeName(libraryQuery);
  const exercises = store
    .getExercises()
    .filter((e) => (showArchived || !e.archived) && e.nameNorm.includes(queryNorm))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  if (!exercises.length) return `<li class="empty-state">Keine Übungen gefunden</li>`;

  return exercises
    .map(
      (e) => `
        <li>
          <button type="button" class="list-item" data-action="open-exercise" data-id="${esc(e.id)}">
            <span class="list-item-title">${esc(e.name)}</span>
            ${e.archived ? '<span class="badge">archiviert</span>' : ''}
            ${e.note ? '<span class="muted list-item-sub">' + esc(e.note) + '</span>' : ''}
          </button>
        </li>`,
    )
    .join('');
}

function openExerciseSheet(id, onChange) {
  const exercise = store.getExercise(id);
  if (!exercise) return;
  const used = store.isExerciseUsed(id);
  let noteEl = null;

  openSheet({
    title: exercise.name,
    async onClose() {
      // Notiz auch speichern, wenn das Sheet ohne Blur geschlossen wird
      const current = store.getExercise(id);
      if (noteEl && current && noteEl.value !== current.note) {
        await store.updateExerciseNote(id, noteEl.value).catch(toastError);
      }
      onChange();
    },
    render(body, close) {
      body.innerHTML = `
        <form class="stack" data-form="rename">
          <label class="field">
            <span>Name</span>
            <div class="input-row">
              <input type="text" name="name" value="${esc(exercise.name)}" autocomplete="off" required>
              <button type="submit" class="btn">Umbenennen</button>
            </div>
          </label>
        </form>
        <label class="field">
          <span>Notiz (z. B. Sitzhöhe, Griffbreite)</span>
          <textarea name="note" rows="3">${esc(exercise.note)}</textarea>
        </label>
        <div class="stack">
          <button type="button" class="btn btn-block" data-action="archive">
            ${exercise.archived ? 'Wiederherstellen' : 'Archivieren'}
          </button>
          ${
            used
              ? '<p class="muted small">Wird verwendet und kann deshalb nur archiviert werden.</p>'
              : '<button type="button" class="btn btn-block btn-danger-outline" data-action="delete">Löschen</button>'
          }
        </div>
      `;

      body.querySelector('[data-form="rename"]').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
          await store.renameExercise(id, event.target.elements.name.value);
          toast('Umbenannt');
          close();
        } catch (err) {
          toastError(err);
        }
      });

      noteEl = body.querySelector('[name="note"]');

      body.querySelector('[data-action="archive"]').addEventListener('click', async () => {
        try {
          await store.setExerciseArchived(id, !exercise.archived);
          close();
        } catch (err) {
          toastError(err);
        }
      });

      body.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
        if (!(await confirmDialog({ title: 'Übung löschen?', message: exercise.name, confirmLabel: 'Löschen', danger: true }))) return;
        try {
          await store.deleteExercise(id);
          close();
        } catch (err) {
          toastError(err);
        }
      });
    },
  });
}
