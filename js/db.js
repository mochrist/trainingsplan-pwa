// Kleiner Promise-Wrapper um IndexedDB.
//
// Wichtig (Safari): Innerhalb einer Transaktion nur IDB-Requests abwarten, keine anderen Promises.
// Sonst committet Safari die Transaktion vorzeitig. write() stellt deshalb alle Requests synchron.
import { DATA_VERSION } from './lib/migrate.js';

const DB_NAME = 'trainingsplan';

export const STORES = ['exercises', 'templates', 'workouts', 'bodyweights', 'charts', 'kv'];

const KEY_PATHS = { bodyweights: 'date', kv: 'key' };

export function keyOf(store, record) {
  return record[KEY_PATHS[store] ?? 'id'];
}

function upgrade(db, oldVersion) {
  if (oldVersion < 1) {
    const exercises = db.createObjectStore('exercises', { keyPath: 'id' });
    exercises.createIndex('nameNorm', 'nameNorm', { unique: true });
    db.createObjectStore('templates', { keyPath: 'id' });
    const workouts = db.createObjectStore('workouts', { keyPath: 'id' });
    workouts.createIndex('startedAt', 'startedAt');
    workouts.createIndex('status', 'status');
    db.createObjectStore('bodyweights', { keyPath: 'date' });
    db.createObjectStore('charts', { keyPath: 'id' });
    db.createObjectStore('kv', { keyPath: 'key' });
  }
  // Spätere Versionen: hier nur Stores und Indizes ändern, Datenumbau über lib/migrate.js.
}

export function openDatabase({ onVersionChange, onBlocked } = {}) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB wird von diesem Browser nicht unterstützt.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DATA_VERSION);
    request.onupgradeneeded = (event) => upgrade(request.result, event.oldVersion);
    request.onblocked = () => onBlocked?.();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      // Eine neuere App-Version will die DB umbauen: Verbindung freigeben
      db.onversionchange = () => {
        db.close();
        onVersionChange?.();
      };
      resolve(db);
    };
  });
}

/** Liest alle Stores in einer Transaktion: { exercises: [...], ... } */
export function readAll(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readonly');
    const result = {};
    for (const name of STORES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => {
        result[name] = request.result;
      };
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Lesen abgebrochen'));
  });
}

/**
 * Führt Schreiboperationen atomar in einer Transaktion aus.
 * ops: [{ store, type: 'put' | 'delete' | 'clear', value?, key? }]
 */
export function write(db, ops) {
  return new Promise((resolve, reject) => {
    if (!ops.length) {
      resolve();
      return;
    }
    const invalid = ops.find((op) => !['put', 'delete', 'clear'].includes(op.type));
    if (invalid) {
      reject(new Error(`Unbekannte Operation: ${invalid.type}`));
      return;
    }
    const storeNames = [...new Set(ops.map((op) => op.store))];
    const tx = db.transaction(storeNames, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.store);
      if (op.type === 'put') store.put(op.value);
      else if (op.type === 'delete') store.delete(op.key);
      else store.clear();
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Speichern abgebrochen'));
  });
}
