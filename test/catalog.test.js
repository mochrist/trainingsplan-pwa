import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATALOG, MUSCLES, classifyExercise, findCatalogEntry, sortMuscles } from '../js/lib/catalog.js';
import { normalizeName } from '../js/lib/normalize.js';

test('Katalog: eindeutige Namen, gültige Muskelgruppen, jede Gruppe vertreten', () => {
  const names = CATALOG.map((e) => normalizeName(e.name));
  assert.equal(new Set(names).size, names.length);
  for (const entry of CATALOG) {
    assert.ok(entry.muscles.length > 0 && entry.muscles.every((m) => m in MUSCLES), entry.name);
    assert.equal(new Set(entry.muscles).size, entry.muscles.length, entry.name);
    assert.equal(typeof entry.compound, 'boolean');
  }
  for (const muscle of Object.keys(MUSCLES)) {
    assert.ok(CATALOG.some((e) => e.muscles[0] === muscle), `keine Übung für ${muscle}`);
  }
  // Für „Arme“ muss genug Auswahl da sein
  assert.ok(CATALOG.filter((e) => e.muscles[0] === 'biceps').length >= 4);
  assert.ok(CATALOG.filter((e) => e.muscles[0] === 'triceps').length >= 4);
});

test('Katalogtreffer unabhängig von Groß-/Kleinschreibung und Umlauten', () => {
  assert.equal(findCatalogEntry('  schulterdrucken (kurzhantel) ').name, 'Schulterdrücken (Kurzhantel)');
  assert.deepEqual(classifyExercise('LATZUG'), { muscles: ['back', 'biceps'], compound: true });
});

test('Schätzung eigener Übungen über Stichwörter', () => {
  const guess = (name) => {
    const { muscles, compound } = classifyExercise(name);
    return [muscles[0] ?? null, compound];
  };
  assert.deepEqual(guess('Trizepsdrücken am Turm'), ['triceps', false]);
  assert.deepEqual(guess('Bankdrücken Smith Machine'), ['chest', true]);
  assert.deepEqual(guess('Hammer Curls Kabel'), ['biceps', false]);
  assert.deepEqual(guess('Beincurl stehend'), ['hamstrings', false]);
  assert.deepEqual(guess('Wadenheben an der Beinpresse'), ['calves', false]);
  assert.deepEqual(guess('Glute Kickback Maschine'), ['glutes', false]);
  assert.deepEqual(guess('Reverse Fly Kabel'), ['shoulders', false]);
  assert.deepEqual(guess('Back Squat'), ['quads', true]);
  assert.deepEqual(guess('Lat Pulldown'), ['back', true]);
  assert.deepEqual(guess('Dips Gerät'), ['triceps', true]);
  assert.deepEqual(guess('Hängendes Beinheben'), ['abs', false]);
  assert.deepEqual(guess('Mein Zirkel'), [null, false]);
  assert.deepEqual(guess('Seated Row Maschine'), ['back', true]);
  assert.deepEqual(guess('Brust Maschine'), ['chest', false]);
});

test('Starterübungen stehen alle im Katalog', () => {
  const source = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  const block = source.match(/const STARTER_EXERCISES = \[([\s\S]*?)\];/)[1];
  const starters = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(starters.length > 0);
  for (const name of starters) assert.ok(findCatalogEntry(name), name);
});

test('sortMuscles: Anzeigereihenfolge, ohne Unbekannte und Doppelte', () => {
  assert.deepEqual(sortMuscles(['triceps', 'chest', 'xyz', 'chest']), ['chest', 'triceps']);
});
