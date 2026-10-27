import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP_DIRS = ['js', 'css', 'icons'];
const ROOT_FILES = ['index.html', 'manifest.webmanifest'];

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function readPrecache() {
  const source = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const block = source.match(/const PRECACHE = \[([\s\S]*?)\];/);
  assert.ok(block, 'PRECACHE-Liste in sw.js nicht gefunden');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));
}

test('jede App-Datei steht in der Precache-Liste', () => {
  const precache = new Set(readPrecache());
  const appFiles = [
    ...ROOT_FILES,
    ...APP_DIRS.flatMap((dir) => listFiles(join(ROOT, dir))).map((path) => relative(ROOT, path).split(sep).join('/')),
  ];
  const missing = appFiles.filter((file) => !precache.has(file));
  assert.deepEqual(missing, [], `Fehlt in sw.js PRECACHE: ${missing.join(', ')}`);
});

test('jeder Precache-Eintrag existiert', () => {
  const missing = readPrecache().filter((file) => file !== '' && !existsSync(join(ROOT, file)));
  assert.deepEqual(missing, [], `Datei existiert nicht: ${missing.join(', ')}`);
});
