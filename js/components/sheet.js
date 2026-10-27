// Bottom-Sheet und einfache Dialoge (statt alert/confirm/prompt).
import { esc } from '../lib/html.js';

/**
 * Öffnet ein Bottom-Sheet. render(body, close) füllt den Inhalt.
 * @returns close()
 */
export function openSheet({ title, render, onClose }) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-header">
        <h2>${esc(title)}</h2>
        <button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">✕</button>
      </header>
      <div class="sheet-body"></div>
    </div>
  `;
  const previousFocus = document.activeElement;
  let closed = false;

  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    previousFocus?.focus?.({ preventScroll: true });
    onClose?.(result);
  }

  function onKey(event) {
    if (event.key === 'Escape') close();
  }

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-sheet-close]')) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  render(backdrop.querySelector('.sheet-body'), close);
  return close;
}

/** Bestätigungsdialog. Resolves true bei Bestätigung. */
export function confirmDialog({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Abbrechen', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    openSheet({
      title,
      onClose: () => resolve(result),
      render(body, close) {
        body.innerHTML = `
          ${message ? `<p>${esc(message)}</p>` : ''}
          <div class="sheet-actions">
            <button type="button" class="btn" data-sheet-close>${esc(cancelLabel)}</button>
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmLabel)}</button>
          </div>
        `;
        body.querySelector('[data-confirm]').addEventListener('click', () => {
          result = true;
          close();
        });
      },
    });
  });
}

/** Eingabedialog. Resolves den Text oder null bei Abbruch. */
export function promptDialog({ title, label = '', value = '', confirmLabel = 'Speichern', inputmode = 'text', type = 'text' }) {
  return new Promise((resolve) => {
    let result = null;
    openSheet({
      title,
      onClose: () => resolve(result),
      render(body, close) {
        body.innerHTML = `
          <form class="stack">
            <label class="field">
              ${label ? `<span>${esc(label)}</span>` : ''}
              <input type="${esc(type)}" inputmode="${esc(inputmode)}" value="${esc(value)}" autocomplete="off" required>
            </label>
            <div class="sheet-actions">
              <button type="button" class="btn" data-sheet-close>Abbrechen</button>
              <button type="submit" class="btn btn-primary">${esc(confirmLabel)}</button>
            </div>
          </form>
        `;
        const input = body.querySelector('input');
        body.querySelector('form').addEventListener('submit', (event) => {
          event.preventDefault();
          result = input.value;
          close();
        });
        input.focus();
        input.select();
      },
    });
  });
}
