// Schreibt die PRECACHE-Liste in sw.js neu (alle Dateien unter js/, css/, icons/).
// Aufruf: node tools/update-precache.mjs  (APP_VERSION bleibt unverändert, bitte selbst erhöhen)
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

const files = ['js', 'css', 'icons']
  .flatMap((dir) => listFiles(join(ROOT, dir)))
  .map((path) => relative(ROOT, path).split(sep).join('/'))
  .sort();

const entries = ['./', './index.html', './manifest.webmanifest', ...files.map((f) => `./${f}`)];
const list = `const PRECACHE = [\n${entries.map((e) => `  '${e}',`).join('\n')}\n];`;

const swPath = join(ROOT, 'sw.js');
const source = readFileSync(swPath, 'utf8');
writeFileSync(swPath, source.replace(/const PRECACHE = \[[\s\S]*?\];/, list));
console.log(`${entries.length} Einträge in PRECACHE`);
