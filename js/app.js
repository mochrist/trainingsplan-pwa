import * as store from './store.js';
import { toastError } from './components/toast.js';
import { esc } from './lib/html.js';
import * as today from './views/today.js';
import * as calendar from './views/calendar.js';
import * as plans from './views/plans.js';
import * as progress from './views/progress.js';
import * as settings from './views/settings.js';
import * as workout from './views/workout.js';
import * as sessionDetail from './views/session-detail.js';

// Routen: '#/<name>/<param>'. `tab` bestimmt den markierten Tab, `fullscreen` blendet die Tab-Leiste aus.
const routes = {
  today: { view: today, tab: 'today' },
  calendar: { view: calendar, tab: 'calendar' },
  plans: { view: plans, tab: 'plans' },
  progress: { view: progress, tab: 'progress' },
  settings: { view: settings, tab: 'settings' },
  workout: { view: workout, fullscreen: true },
  session: { view: sessionDetail, tab: 'calendar' },
};

const DEFAULT_ROUTE = 'today';

let viewRoot = document.getElementById('view');
const tabLinks = document.querySelectorAll('.tabbar a[data-tab]');

export function parseHash(hash) {
  const [name, ...params] = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: name || DEFAULT_ROUTE, params: params.map(decodeURIComponent) };
}

export function navigate(path) {
  location.hash = `#/${path}`;
}

let currentView = null;

function renderRoute() {
  const { name, params } = parseHash(location.hash);
  const route = routes[name];
  if (!route) {
    navigate(DEFAULT_ROUTE);
    return;
  }

  document.body.classList.toggle('fullscreen', Boolean(route.fullscreen));
  for (const link of tabLinks) {
    if (link.dataset.tab === route.tab) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  currentView?.destroy?.();
  currentView = route.view;
  // Neues Element statt replaceChildren, damit Event-Listener der alten View verschwinden
  const fresh = viewRoot.cloneNode(false);
  viewRoot.replaceWith(fresh);
  viewRoot = fresh;
  try {
    route.view.render(viewRoot, params);
  } catch (err) {
    toastError(err);
  }
  window.scrollTo(0, 0);
}

function showFatalError(err) {
  console.error(err);
  document.body.classList.add('fullscreen');
  viewRoot.innerHTML = `
    <h1>Daten nicht verfügbar</h1>
    <p>Die lokale Datenbank konnte nicht geöffnet werden. Im privaten Modus von Safari oder bei vollem Speicher
       kann die App nicht arbeiten.</p>
    <p class="muted small">${esc(err?.message || err)}</p>
    <button type="button" class="btn btn-primary" onclick="location.reload()">Erneut versuchen</button>
  `;
}

// ---------- Service Worker und Update-Hinweis ----------

const updateBanner = document.getElementById('update-banner');

function showUpdateBanner(worker) {
  updateBanner.hidden = false;
  updateBanner.querySelector('[data-action="reload"]').onclick = () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const registration = await navigator.serviceWorker.register('sw.js');

  // Eine Version, die schon beim Start wartet (z. B. nach dem letzten Öffnen geladen)
  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner(registration.waiting);
  }

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      // Ohne bisherigen Controller ist es die Erstinstallation, kein Update
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner(installing);
      }
    });
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });

  // iOS prüft selten selbst auf Updates, deshalb beim Zurückkehren in die App
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // Nicht unterstützt: still ignorieren
  }
}

async function start() {
  registerServiceWorker().catch((err) => console.error('Service Worker:', err));
  requestPersistentStorage();

  try {
    await store.init({
      onVersionChange: () => {
        updateBanner.hidden = false;
        updateBanner.querySelector('span').textContent = 'Neue Version aktiv – bitte neu laden';
        updateBanner.querySelector('[data-action="reload"]').onclick = () => location.reload();
      },
      onBlocked: () => toastError(new Error('Bitte andere geöffnete Fenster der App schließen.')),
    });
  } catch (err) {
    showFatalError(err);
    return;
  }
  store.setErrorHandler(toastError);

  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

start();
