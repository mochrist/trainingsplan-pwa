export function render(root) {
  root.innerHTML = `
    <h1>Einstellungen</h1>
    <p class="empty-state">Noch keine Einstellungen.</p>
    <p class="muted">Version <span data-version>–</span></p>
  `;
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
