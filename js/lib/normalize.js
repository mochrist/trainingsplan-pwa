// Namensnormalisierung und Übungssuche (ohne DOM).

/** Anzeigename: getrimmt, mehrfache Leerzeichen zusammengefasst. */
export function cleanName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ');
}

/** Vergleichsschlüssel: klein, ohne Akzente/Diakritika, ß → ss. */
export function normalizeName(name) {
  return cleanName(name)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss');
}

const WORD_BOUNDARY = /[^\p{L}\p{N}]/u;

/** 0 = Anfang des Namens, 1 = Wortanfang, 2 = irgendwo enthalten, -1 = kein Treffer. */
export function matchRank(nameNorm, queryNorm) {
  if (nameNorm.startsWith(queryNorm)) return 0;
  let index = nameNorm.indexOf(queryNorm, 1);
  if (index === -1) return -1;
  while (index !== -1) {
    if (WORD_BOUNDARY.test(nameNorm[index - 1])) return 1;
    index = nameNorm.indexOf(queryNorm, index + 1);
  }
  return 2;
}

function compareByUsage(a, b, usage) {
  const ua = usage.get(a.id) ?? { count: 0, lastAt: 0 };
  const ub = usage.get(b.id) ?? { count: 0, lastAt: 0 };
  return ub.count - ua.count || ub.lastAt - ua.lastAt || a.name.localeCompare(b.name, 'de');
}

/**
 * Sucht nicht archivierte Übungen. Ohne Suchbegriff kommen die meistgenutzten zuerst.
 * @param usage Map exerciseId → { count, lastAt }
 */
export function searchExercises(exercises, query, { usage = new Map(), limit = 6, excludeIds = new Set() } = {}) {
  const queryNorm = normalizeName(query);
  const candidates = exercises.filter((e) => !e.archived && !excludeIds.has(e.id));

  if (!queryNorm) {
    return candidates.sort((a, b) => compareByUsage(a, b, usage)).slice(0, limit);
  }

  return candidates
    .map((exercise) => ({ exercise, rank: matchRank(exercise.nameNorm, queryNorm) }))
    .filter((hit) => hit.rank !== -1)
    .sort((a, b) => a.rank - b.rank || compareByUsage(a.exercise, b.exercise, usage))
    .slice(0, limit)
    .map((hit) => hit.exercise);
}

/** Exakter Treffer nach Normalisierung, auch archivierte Übungen. */
export function findByName(exercises, name) {
  const nameNorm = normalizeName(name);
  return exercises.find((e) => e.nameNorm === nameNorm) ?? null;
}
