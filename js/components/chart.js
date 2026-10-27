// SVG-Diagramm (Linie oder Balken) mit Datumsachse, gerundeten Achsenwerten und Tap-Info.
import { niceTicks, seriesSummary } from '../lib/stats.js';
import { formatNumber } from '../lib/numbers.js';
import { formatDateLong } from '../lib/time.js';
import { esc } from '../lib/html.js';

const W = 320;
const H = 180;
const PAD = { top: 10, right: 10, bottom: 22, left: 38 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const X_LABELS = 3;

const pad2 = (n) => String(n).padStart(2, '0');
const shortDate = (ts) => {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.`;
};

function formatValue(value, unit) {
  return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value);
}

function formatChange(change, unit) {
  if (change == null) return '';
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±';
  return `${sign}${formatValue(Math.abs(change), unit)}`;
}

/**
 * @param points [{ x, y }] chronologisch
 * @param type 'line' | 'bar'
 */
export function renderChart(container, points, { type = 'line', unit = '' } = {}) {
  if (!points.length) {
    container.innerHTML = '<p class="chart-empty">Noch keine Daten</p>';
    return;
  }

  const ys = points.map((p) => p.y);
  // Balken starten bei 0, Linien nutzen den Datenbereich
  const axis = niceTicks(type === 'bar' ? Math.min(0, ...ys) : Math.min(...ys), Math.max(...ys));
  const minX = points[0].x;
  const maxX = points.at(-1).x;
  const spanX = maxX - minX;

  const barWidth = type === 'bar' ? Math.max(3, Math.min(14, (PLOT_W / points.length) * 0.6)) : 0;
  const innerW = PLOT_W - barWidth;
  const sx = (x) => PAD.left + barWidth / 2 + (spanX === 0 ? innerW / 2 : ((x - minX) / spanX) * innerW);
  const sy = (y) => PAD.top + PLOT_H - ((y - axis.min) / (axis.max - axis.min)) * PLOT_H;

  const grid = axis.ticks
    .map(
      (t) => `
        <line class="chart-grid" x1="${PAD.left}" x2="${W - PAD.right}" y1="${sy(t)}" y2="${sy(t)}"/>
        <text class="chart-label" x="${PAD.left - 6}" y="${sy(t) + 4}" text-anchor="end">${formatNumber(t)}</text>`,
    )
    .join('');

  // Datumsbeschriftung: erster, mittlerer und letzter Punkt (ohne Dopplungen)
  const labelIndexes = points.length === 1 ? [0] : [...new Set(Array.from({ length: X_LABELS }, (_, i) => Math.round((i * (points.length - 1)) / (X_LABELS - 1))))];
  const xLabels = labelIndexes
    .map((i) => {
      const x = sx(points[i].x);
      const anchor = labelIndexes.length === 1 ? 'middle' : i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      return `<text class="chart-label" x="${x}" y="${H - 6}" text-anchor="${anchor}">${shortDate(points[i].x)}</text>`;
    })
    .join('');

  let marks;
  if (type === 'bar') {
    const base = sy(Math.max(0, axis.min));
    marks = points
      .map((p, i) => {
        const y = sy(p.y);
        return `<rect class="chart-bar" data-i="${i}" x="${sx(p.x) - barWidth / 2}" y="${Math.min(y, base)}" width="${barWidth}" height="${Math.max(1, Math.abs(base - y))}" rx="2"/>`;
      })
      .join('');
  } else {
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join('');
    marks = `
      ${points.length > 1 ? `<path class="chart-line" d="${path}"/>` : ''}
      ${points.map((p, i) => `<circle class="chart-point" data-i="${i}" cx="${sx(p.x)}" cy="${sy(p.y)}" r="${points.length > 40 ? 2 : 3.5}"/>`).join('')}`;
  }

  const summary = seriesSummary(points);
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Diagramm mit ${points.length} Datenpunkten">
      ${grid}
      ${xLabels}
      ${marks}
      <line class="chart-cursor" y1="${PAD.top}" y2="${PAD.top + PLOT_H}" visibility="hidden"/>
    </svg>
    <p class="chart-info" aria-live="polite">Tippe auf einen Punkt für Details</p>
    <p class="chart-summary">
      <span>Letzter Wert: <strong>${esc(formatValue(summary.last, unit))}</strong></span>
      ${summary.change != null ? `<span>Änderung: <strong>${esc(formatChange(summary.change, unit))}</strong></span>` : ''}
    </p>
  `;

  const svg = container.querySelector('svg');
  const info = container.querySelector('.chart-info');
  const cursor = container.querySelector('.chart-cursor');

  svg.addEventListener('click', (event) => {
    const rect = svg.getBoundingClientRect();
    const vx = ((event.clientX - rect.left) / rect.width) * W;
    // Nächster Punkt entlang der x-Achse
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(sx(points[i].x) - vx) < Math.abs(sx(points[nearest].x) - vx)) nearest = i;
    }
    const p = points[nearest];
    cursor.setAttribute('x1', sx(p.x));
    cursor.setAttribute('x2', sx(p.x));
    cursor.setAttribute('visibility', 'visible');
    for (const el of svg.querySelectorAll('[data-i]')) el.classList.toggle('is-active', Number(el.dataset.i) === nearest);
    info.textContent = `${formatValue(p.y, unit)} · ${formatDateLong(p.x)}`;
  });
}
