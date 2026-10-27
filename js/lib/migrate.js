// Gemeinsame Versionierung für IndexedDB und Backup-Dateien.
// Bei Änderungen am Datenmodell: DATA_VERSION erhöhen und STEPS[alteVersion] ergänzen (mit Test).

export const DATA_VERSION = 2;

/**
 * STEPS[n] wandelt Daten von Version n in Version n + 1 um.
 * data hat die Form { exercises, templates, workouts, bodyweights, charts, settings }.
 */
const STEPS = {
  // v2: Körpergewicht bekommt die Messart (state), bisherige Einträge gelten als „Normal“
  1: (data) => ({ ...data, bodyweights: (data.bodyweights ?? []).map(migrateBodyweightV1) }),
};

/** Einzelner Datensatz v1 → v2. Wird auch beim IndexedDB-Upgrade verwendet. */
export function migrateBodyweightV1(entry) {
  return { ...entry, state: entry.state ?? 'neutral' };
}

export function migrate(data, fromVersion) {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error(`Ungültige Datenversion: ${fromVersion}`);
  }
  if (fromVersion > DATA_VERSION) {
    throw new Error(`Die Daten stammen aus einer neueren App-Version (${fromVersion}). Bitte zuerst die App aktualisieren.`);
  }
  let result = data;
  for (let version = fromVersion; version < DATA_VERSION; version++) {
    result = STEPS[version](result);
  }
  return result;
}
