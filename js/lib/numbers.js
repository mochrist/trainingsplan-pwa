// Zahlen im deutschen Format (ohne DOM).

const formatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const formatter1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

/** "42,5" oder "42.5" → 42.5; leer oder ungültig → null. */
export function parseDecimal(text) {
  const clean = String(text ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (!clean || !/^\d*\.?\d+$|^\d+\.$/.test(clean)) return null;
  return roundWeight(Number(clean));
}

/** Ganze Zahl ≥ 0 oder null. */
export function parseInteger(text) {
  const clean = String(text ?? '').trim();
  if (!/^\d+$/.test(clean)) return null;
  return Number(clean);
}

/** Auf 2 Nachkommastellen runden, damit keine Fließkommareste gespeichert werden. */
export function roundWeight(value) {
  return Math.round(value * 100) / 100;
}

/** Gewicht um eine Schrittweite ändern, gerechnet in Hundertsteln. Nie unter 0. */
export function stepWeight(value, step, direction) {
  const next = Math.round(value * 100) + direction * Math.round(step * 100);
  return Math.max(0, next) / 100;
}

export function formatNumber(value) {
  return value == null ? '' : formatter.format(value);
}

export function formatNumber1(value) {
  return value == null ? '' : formatter1.format(value);
}

/** Satz kompakt: "40×10", mit RPE "40×10 @8,5". */
export function formatSet(set, { withRpe = true } = {}) {
  const base = `${formatNumber(set.weight)}×${set.reps}`;
  return withRpe && set.rpe != null ? `${base} @${formatNumber(set.rpe)}` : base;
}
