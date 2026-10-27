// Bei jeder Änderung an App-Dateien erhöhen, sonst bekommt das iPhone die neue Version nicht.
const APP_VERSION = '1.1.1';
const CACHE_NAME = `trainingsplan-${APP_VERSION}`;

// Alle Pfade relativ zu sw.js. test/precache.test.js prüft, dass die Liste vollständig ist.
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './icons/apple-touch-icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/components/backup-actions.js',
  './js/components/chart.js',
  './js/components/exercise-picker.js',
  './js/components/icons.js',
  './js/components/rest-timer.js',
  './js/components/sheet.js',
  './js/components/toast.js',
  './js/components/workout-editor.js',
  './js/db.js',
  './js/lib/backup.js',
  './js/lib/history.js',
  './js/lib/html.js',
  './js/lib/migrate.js',
  './js/lib/normalize.js',
  './js/lib/numbers.js',
  './js/lib/pr.js',
  './js/lib/stats.js',
  './js/lib/time.js',
  './js/lib/workout.js',
  './js/nav.js',
  './js/store.js',
  './js/views/calendar.js',
  './js/views/plans.js',
  './js/views/progress.js',
  './js/views/session-detail.js',
  './js/views/settings.js',
  './js/views/today.js',
  './js/views/workout.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key.startsWith('trainingsplan-') && key !== CACHE_NAME).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'GET_VERSION') event.source?.postMessage({ type: 'VERSION', version: APP_VERSION });
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Hash-Routing: jede Navigation bekommt die App-Shell
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { ignoreSearch: true }).then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)),
  );
});
