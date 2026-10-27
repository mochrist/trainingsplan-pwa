// Export (Share-Sheet bzw. Download) und Import mit Bestätigung.
import * as store from '../store.js';
import { buildBackup, backupFileName, parseBackup } from '../lib/backup.js';
import { formatDateLong } from '../lib/time.js';
import { esc } from '../lib/html.js';
import { openSheet } from './sheet.js';
import { toast, toastError } from './toast.js';

/**
 * Exportiert alle Daten als JSON. Primär über die Web Share API (iOS: „In Dateien sichern“),
 * sonst als Download.
 * @returns true, wenn exportiert wurde
 */
export async function exportBackup() {
  const readAt = Date.now();
  const json = JSON.stringify(buildBackup(store.exportData(), readAt), null, 1);
  const name = backupFileName(readAt);
  const file = new File([json], name, { type: 'application/json' });

  try {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
      } catch (err) {
        if (err.name === 'AbortError') return false;
        throw err;
      }
    } else {
      downloadFile(file);
    }
    await store.markExported(readAt);
    toast('Backup exportiert');
    return true;
  } catch (err) {
    toastError(new Error(`Export fehlgeschlagen: ${err.message}`));
    return false;
  }
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Öffnet die Dateiauswahl, prüft die Datei und ersetzt nach Bestätigung alle Daten. */
export function importBackup(onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    let parsed;
    try {
      parsed = parseBackup(await file.text());
    } catch (err) {
      toastError(err);
      return;
    }
    confirmImport(parsed, onDone);
  });
  input.click();
}

function confirmImport({ data, exportedAt, summary }, onDone) {
  const active = data.workouts.some((w) => w.status === 'active');
  openSheet({
    title: 'Backup importieren?',
    render(body, close) {
      body.innerHTML = `
        ${exportedAt ? `<p class="muted">Backup vom ${esc(formatDateLong(exportedAt))}</p>` : ''}
        <ul class="import-summary">
          <li><strong>${summary.workouts}</strong> Trainings</li>
          <li><strong>${summary.exercises}</strong> Übungen</li>
          <li><strong>${summary.templates}</strong> Templates</li>
          <li><strong>${summary.bodyweights}</strong> Körpergewicht-Einträge</li>
          <li><strong>${summary.charts}</strong> Diagramme</li>
        </ul>
        <p class="warning-text">Alle Daten auf diesem Gerät werden ersetzt${store.getActiveWorkout() ? ', auch das laufende Training' : ''}.
          ${active ? 'Das Backup enthält ein laufendes Training.' : ''}</p>
        <div class="sheet-actions">
          <button type="button" class="btn" data-sheet-close>Abbrechen</button>
          <button type="button" class="btn btn-danger" data-import>Ersetzen</button>
        </div>
      `;
      body.querySelector('[data-import]').addEventListener('click', async (event) => {
        event.target.disabled = true;
        try {
          await store.importData(data);
          toast('Backup importiert');
          close();
          onDone?.();
        } catch (err) {
          event.target.disabled = false;
          toastError(new Error(`Import fehlgeschlagen, die bisherigen Daten sind unverändert: ${err.message}`));
        }
      });
    },
  });
}
