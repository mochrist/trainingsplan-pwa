import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanName, normalizeName, matchRank, searchExercises, findByName } from '../js/lib/normalize.js';

const ex = (id, name, archived = false) => ({ id, name, nameNorm: normalizeName(name), archived });

test('cleanName trimmt und fasst Leerzeichen zusammen', () => {
  assert.equal(cleanName('  High   Row  '), 'High Row');
  assert.equal(cleanName(null), '');
});

test('normalizeName: klein, ohne Diakritika, ß → ss', () => {
  assert.equal(normalizeName('  High   ROW '), 'high row');
  assert.equal(normalizeName('Bankdrücken'), 'bankdrucken');
  assert.equal(normalizeName('Crème Brûlée'), 'creme brulee');
  assert.equal(normalizeName('Fußpresse'), 'fusspresse');
});

test('Dubletten durch Schreibweise sind gleich normalisiert', () => {
  assert.equal(normalizeName('High Row'), normalizeName(' high  row'));
});

test('matchRank: Anfang, Wortanfang, enthalten', () => {
  assert.equal(matchRank('high row', 'hi'), 0);
  assert.equal(matchRank('high row', 'row'), 1);
  assert.equal(matchRank('rudern am kabel (sitzend)', 'sitz'), 1);
  assert.equal(matchRank('high row', 'igh'), 2);
  assert.equal(matchRank('high row', 'xyz'), -1);
  // Erst Teilstring mitten im Wort, später Wortanfang
  assert.equal(matchRank('narrow row', 'row'), 1);
});

test('"hi" und "row" finden High Row', () => {
  const list = [ex('1', 'Latzug'), ex('2', 'High Row'), ex('3', 'Face Pulls')];
  assert.deepEqual(searchExercises(list, 'hi').map((e) => e.name), ['High Row']);
  assert.deepEqual(searchExercises(list, 'row').map((e) => e.name), ['High Row']);
});

test('Ranking: Anfang vor Wortanfang vor enthalten, dann Nutzung', () => {
  const list = [ex('a', 'Seated Row'), ex('b', 'Rowing Machine'), ex('c', 'Narrow Grip'), ex('d', 'Row Upright')];
  const usage = new Map([
    ['d', { count: 5, lastAt: 100 }],
    ['b', { count: 1, lastAt: 200 }],
  ]);
  assert.deepEqual(
    searchExercises(list, 'row', { usage }).map((e) => e.id),
    ['d', 'b', 'a', 'c'],
  );
});

test('Gleichstand bei Nutzung: aktuellere zuerst', () => {
  const list = [ex('a', 'Curls A'), ex('b', 'Curls B')];
  const usage = new Map([
    ['a', { count: 2, lastAt: 100 }],
    ['b', { count: 2, lastAt: 300 }],
  ]);
  assert.deepEqual(searchExercises(list, 'curls', { usage }).map((e) => e.id), ['b', 'a']);
});

test('archivierte und ausgeschlossene Übungen werden nicht vorgeschlagen, Limit greift', () => {
  const list = [ex('1', 'Row 1', true), ex('2', 'Row 2'), ex('3', 'Row 3'), ...Array.from({ length: 10 }, (_, i) => ex(`x${i}`, `Row x${i}`))];
  const hits = searchExercises(list, 'row', { excludeIds: new Set(['2']) });
  assert.equal(hits.length, 6);
  assert.ok(!hits.some((e) => e.id === '1' || e.id === '2'));
});

test('leere Suche liefert meistgenutzte Übungen', () => {
  const list = [ex('a', 'A'), ex('b', 'B')];
  const usage = new Map([['b', { count: 3, lastAt: 1 }]]);
  assert.deepEqual(searchExercises(list, '  ', { usage }).map((e) => e.id), ['b', 'a']);
});

test('findByName findet auch archivierte Übungen', () => {
  const list = [ex('1', 'High Row', true)];
  assert.equal(findByName(list, 'high  row')?.id, '1');
  assert.equal(findByName(list, 'Low Row'), null);
});
