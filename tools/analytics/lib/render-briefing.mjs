/**
 * Render executive performance briefing HTML from structured JSON.
 * Template: tools/analytics/performance-briefing.template.html
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = join(__dirname, '..', 'performance-briefing.template.html');

/**
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {number|null|undefined} value
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatPctChange(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
  const factor = 10 ** decimals;
  const rounded = Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `${sign}${Math.abs(rounded).toFixed(decimals)}%`;
}

/**
 * @param {'up'|'down'|'flat'} direction
 * @param {'positive'|'negative'|'neutral'} [polarity]
 * @returns {'up'|'down'|'flat'}
 */
export function signalClass(direction, polarity = 'positive') {
  if (direction === 'flat') return 'flat';
  if (polarity === 'negative') {
    return direction === 'up' ? 'down' : direction === 'down' ? 'up' : 'flat';
  }
  return direction;
}

/**
 * @param {'green'|'red'|'yellow'|'grey'} signal
 * @returns {string}
 */
function badgeClass(signal) {
  const map = { green: 'green', red: 'red', yellow: 'yellow', grey: 'grey' };
  return map[signal] || 'grey';
}

/**
 * @param {object|null|undefined} callout
 * @returns {string}
 */
function renderCallout(callout) {
  if (!callout?.title) return '';
  const variant = callout.type === 'note' ? ' note' : '';
  const icon = callout.type === 'note' ? '&#8505;' : '&#9888;';
  return `<div class="callout${variant}">
    <span class="warn-icon">${icon}</span>
    <div>
      <div class="callout-title">${escapeHtml(callout.title)}</div>
      <div class="callout-body">${escapeHtml(callout.body)}</div>
    </div>
  </div>`;
}

/**
 * @param {object[]} kpis
 * @returns {string}
 */
function renderKpiTiles(kpis = []) {
  return kpis.map((kpi) => {
    const tileClass = signalClass(kpi.direction, kpi.polarity);
    const pillClass = signalClass(kpi.direction, kpi.polarity);
    const arrow = kpi.direction === 'up' ? '&#9650;' : kpi.direction === 'down' ? '&#9660;' : '&#9644;';
    const pillText = kpi.pillText || (kpi.pctChange === null || kpi.pctChange === undefined
      ? '&#9888; N/A'
      : `${arrow} ${formatPctChange(kpi.pctChange)}`);
    return `<div class="kpi-tile ${tileClass}">
      <div class="kpi-head">
        <div class="kpi-label">${escapeHtml(kpi.label)}</div>
      </div>
      <div class="kpi-value">${escapeHtml(kpi.formattedValue)}</div>
      <span class="pill ${pillClass}">${pillText}</span>
      <span class="prior">${escapeHtml(kpi.priorLabel || `Prior period: ${kpi.priorValue}`)}</span>
    </div>`;
  }).join('\n    ');
}

/**
 * @param {object[]} bullets
 * @returns {string}
 */
function renderNarrative(bullets = []) {
  return bullets.map((item) => {
    const driver = item.driver
      ? ` &mdash; <span class="driver">${escapeHtml(item.driver)}</span>`
      : '';
    return `<li>
        <span class="signal">${escapeHtml(item.emoji || '&#8226;')}</span>
        <span class="metric-highlight">${escapeHtml(item.metric)}:</span> ${escapeHtml(item.text)}${driver}
      </li>`;
  }).join('\n      ');
}

/**
 * @param {object[]} rows
 * @returns {string}
 */
function renderKpiTable(rows = []) {
  return rows.map((row) => `<tr>
          <td>${escapeHtml(row.metric)}</td>
          <td>${escapeHtml(row.current)}</td>
          <td>${escapeHtml(row.prior)}</td>
          <td>${escapeHtml(row.delta)}</td>
          <td>${escapeHtml(row.pctChange)}</td>
          <td><span class="badge ${badgeClass(row.signal)}">${escapeHtml(row.signalLabel)}</span></td>
        </tr>`).join('\n          ');
}

/**
 * @param {object[]} rows
 * @returns {string}
 */
function renderDriverTable(rows = []) {
  return rows.map((row) => `<tr>
          <td>${escapeHtml(row.metric)}</td>
          <td>${escapeHtml(row.topDriver)}</td>
          <td>${escapeHtml(row.currentValue)}</td>
          <td>${escapeHtml(row.priorValue)}</td>
          <td>${escapeHtml(row.contribution)}</td>
        </tr>`).join('\n          ');
}

/**
 * @param {object} data
 * @returns {string}
 */
export function renderBriefingHtml(data) {
  const template = readFileSync(TEMPLATE_PATH, 'utf8');
  const methodology = data.methodology || {};

  const replacements = {
    ORG_NAME: escapeHtml(data.orgName),
    PERIOD_TYPE: escapeHtml(data.periodType || 'Performance'),
    PERIOD_LABEL: escapeHtml(data.periodLabel),
    COMPARISON_LABEL: escapeHtml(data.comparisonLabel),
    GENERATED_DATE: escapeHtml(data.generatedDate),
    LEDE_SENTENCE: escapeHtml(data.ledeSentence),
    REPORT_SUITE: escapeHtml(data.reportSuite),
    CURRENT_START_ISO: escapeHtml(methodology.currentStartIso),
    CURRENT_END_ISO: escapeHtml(methodology.currentEndIso),
    COMPARISON_START_ISO: escapeHtml(methodology.comparisonStartIso),
    COMPARISON_END_ISO: escapeHtml(methodology.comparisonEndIso),
    WEEK_START_DOW: escapeHtml(methodology.weekStartDow || 'Monday'),
    FISCAL_YEAR_START_MONTH: escapeHtml(methodology.fiscalYearStartMonth || 'January'),
    TIMEZONE: escapeHtml(methodology.timezone || 'America/Los_Angeles'),
    CALENDAR_SOURCE: escapeHtml(methodology.calendarSource || 'default fallback'),
    METRIC_IDS_CSV: escapeHtml(methodology.metricIdsCsv || ''),
    CALLOUT_HTML: renderCallout(data.callout),
    KPI_TILES_HTML: renderKpiTiles(data.kpis),
    NARRATIVE_HTML: renderNarrative(data.narrative),
    KPI_TABLE_ROWS: renderKpiTable(data.kpiDetail),
    DRIVER_TABLE_ROWS: renderDriverTable(data.drivers),
  };

  let html = template;
  Object.entries(replacements).forEach(([key, value]) => {
    html = html.replaceAll(`{${key}}`, value);
  });
  return html;
}
