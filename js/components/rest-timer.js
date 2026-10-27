// Pausentimer mit Ziel-Zeitstempel (endAt). Läuft nach App-Wechsel, Sperrbildschirm und Neustart korrekt weiter,
// weil die Restzeit immer aus endAt berechnet wird und endAt in kv.restTimer liegt.
import * as store from '../store.js';

const DONE_VISIBLE_MS = 8000;
const TICK_MS = 250;

let audioCtx = null;

/** Muss aus einer Nutzergeste heraus aufgerufen werden (iOS erlaubt Audio erst danach). */
export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    // Ein stiller Puffer entsperrt die Wiedergabe auf iOS zuverlässig
    const source = audioCtx.createBufferSource();
    source.buffer = audioCtx.createBuffer(1, 1, 22050);
    source.connect(audioCtx.destination);
    source.start(0);
  } catch {
    // Kein Audio verfügbar: Timer funktioniert trotzdem (visuell)
  }
}

function beep() {
  if (!audioCtx) return;
  try {
    const start = audioCtx.currentTime + 0.01;
    for (let i = 0; i < 3; i++) {
      const t = start + i * 0.28;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  } catch {
    // ignorieren
  }
}

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Hängt die Timer-Leiste in container ein.
 * @returns { start(seconds), destroy() }
 */
export function mountRestTimer(container) {
  let endAt = store.getRestTimerEnd();
  let firedFor = null;

  // Längst abgelaufene Pause nicht mehr anzeigen
  if (endAt && Date.now() - endAt > DONE_VISIBLE_MS) {
    endAt = null;
    persist();
  }

  container.className = 'rest-timer-slot';
  container.innerHTML = `
    <div class="rest-timer" role="timer" aria-live="off">
      <div class="rest-info">
        <span class="rest-label">Pause</span>
        <span class="rest-time"></span>
      </div>
      <button type="button" class="btn" data-rest="-15" aria-label="15 Sekunden weniger">−15</button>
      <button type="button" class="btn" data-rest="15" aria-label="15 Sekunden mehr">+15</button>
      <button type="button" class="btn" data-rest="skip">Überspringen</button>
    </div>
  `;
  const bar = container.querySelector('.rest-timer');
  const label = container.querySelector('.rest-label');
  const time = container.querySelector('.rest-time');

  function persist() {
    store.setRestTimerEnd(endAt).catch(() => {});
  }

  function update() {
    container.hidden = !endAt;
    document.body.classList.toggle('has-rest-timer', Boolean(endAt));
    if (!endAt) return;
    const remaining = endAt - Date.now();
    const done = remaining <= 0;
    bar.classList.toggle('is-done', done);
    label.textContent = done ? 'Pause vorbei' : 'Pause';
    time.textContent = done ? '0:00' : formatRemaining(remaining);
  }

  function tick() {
    if (!endAt) return;
    const remaining = endAt - Date.now();
    if (remaining <= 0 && firedFor !== endAt) {
      firedFor = endAt;
      beep();
    }
    if (remaining <= -DONE_VISIBLE_MS) {
      stop();
      return;
    }
    update();
  }

  function start(seconds) {
    endAt = Date.now() + seconds * 1000;
    firedFor = null;
    persist();
    update();
  }

  function stop() {
    endAt = null;
    persist();
    update();
  }

  container.addEventListener('click', (event) => {
    const action = event.target.closest('[data-rest]')?.dataset.rest;
    if (!action || !endAt) return;
    if (action === 'skip') {
      stop();
      return;
    }
    const delta = Number(action) * 1000;
    const now = Date.now();
    // Nach Ablauf startet +15 eine neue kurze Pause
    endAt = endAt <= now ? (delta > 0 ? now + delta : endAt) : Math.max(now, endAt + delta);
    if (endAt > now) firedFor = null;
    persist();
    update();
  });

  update();
  const interval = setInterval(tick, TICK_MS);

  return {
    start,
    destroy() {
      clearInterval(interval);
      document.body.classList.remove('has-rest-timer');
    },
  };
}
