let current = null;

/** Kurze Meldung am unteren Rand. */
export function toast(message, { duration = 3000, error = false } = {}) {
  current?.remove();
  const el = document.createElement('div');
  el.className = `toast${error ? ' toast-error' : ''}`;
  el.setAttribute('role', error ? 'alert' : 'status');
  el.textContent = message;
  document.body.append(el);
  current = el;
  setTimeout(() => {
    if (current === el) current = null;
    el.remove();
  }, duration);
}

export function toastError(err) {
  console.error(err);
  toast(err?.message || 'Unbekannter Fehler', { error: true, duration: 5000 });
}
