/**
 * Executive performance briefing — styles DA-authored report content.
 * Expected structure: nested div rows (hero, KPI tiles, narrative, tables, methodology).
 * @param {Element} block
 */

/**
 * @param {Element} row
 * @returns {boolean}
 */
function isMethodology(row) {
  return row.textContent.trim().startsWith('Methodology:');
}

/**
 * @param {Element} row
 * @returns {boolean}
 */
function isKpiGrid(row) {
  const tiles = [...row.children].filter((child) => child.tagName === 'DIV');
  return tiles.length >= 2
    && tiles.every((tile) => tile.querySelectorAll(':scope > p').length >= 2);
}

/**
 * @param {Element} row
 * @returns {boolean}
 */
function isTableSection(row) {
  const rows = [...row.children].filter((child) => child.tagName === 'DIV');
  if (rows.length < 2 || row.querySelector('ul, h1')) return false;
  return rows.slice(1).every((entry) => entry.querySelectorAll(':scope > p').length >= 2);
}

/**
 * @param {Element} row
 * @returns {boolean}
 */
function isNarrativeSection(row) {
  return row.children.length === 2 && Boolean(row.querySelector('ul'));
}

/**
 * @param {Element} row
 * @returns {boolean}
 */
function isSectionLabel(row) {
  if (row.children.length !== 1) return false;
  const child = row.firstElementChild;
  return child?.tagName === 'DIV'
    && !child.querySelector('p, ul, h1, h2, table')
    && child.textContent.trim().length > 0;
}

/**
 * @param {Element} row
 */
function decorateHero(row) {
  row.classList.add('report-hero');
  const inner = row.firstElementChild;
  if (inner) inner.classList.add('report-hero-inner');
  const container = inner || row;
  const paragraphs = [...container.querySelectorAll(':scope > p')];
  if (paragraphs[0]) paragraphs[0].classList.add('report-eyebrow');
  if (paragraphs[1]) paragraphs[1].classList.add('report-lede');
  if (paragraphs[2]) paragraphs[2].classList.add('report-meta');
}

/**
 * @param {Element} row
 */
function decorateSectionLabel(row) {
  const text = row.textContent.trim();
  row.className = 'section-label';
  row.textContent = text;
}

/**
 * @param {Element} row
 */
function decorateKpiGrid(row) {
  row.classList.add('kpi-row');
  [...row.children].forEach((tile) => {
    if (tile.tagName !== 'DIV') return;
    tile.classList.add('kpi-tile');
    const paragraphs = [...tile.querySelectorAll(':scope > p')];
    if (paragraphs[0]) paragraphs[0].classList.add('kpi-label');
    if (paragraphs[1]) paragraphs[1].classList.add('kpi-value');
    if (paragraphs[2]) paragraphs[2].classList.add('kpi-note');
  });
}

/**
 * @param {Element} row
 */
function decorateNarrativeSection(row) {
  row.classList.add('narrative-card');
  const [titleRow, contentRow] = row.children;
  const heading = document.createElement('h2');
  heading.textContent = titleRow.textContent.trim();
  titleRow.replaceWith(heading);
  contentRow.classList.add('report-narrative-body');
  const list = contentRow.querySelector('ul');
  if (list) list.classList.add('bullet-list');
}

/**
 * @param {Element} row
 */
function decorateTableSection(row) {
  const titleRow = row.firstElementChild;
  const title = titleRow?.textContent.trim() || 'Details';

  const section = document.createElement('div');
  section.className = 'report-section';

  const header = document.createElement('div');
  header.className = 'report-section-header';
  const heading = document.createElement('h2');
  heading.textContent = title;
  header.append(heading);
  section.append(header);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  const dataRows = [...row.children].slice(1);

  if (dataRows.length) {
    const headerCells = [...dataRows[0].querySelectorAll(':scope > p')];
    if (headerCells.length) {
      const tr = document.createElement('tr');
      headerCells.forEach((cell) => {
        const th = document.createElement('th');
        th.textContent = cell.textContent.trim();
        tr.append(th);
      });
      thead.append(tr);
      dataRows.shift();
    }
  }

  dataRows.forEach((dataRow) => {
    const tr = document.createElement('tr');
    [...dataRow.querySelectorAll(':scope > p')].forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell.textContent.trim();
      tr.append(td);
    });
    tbody.append(tr);
  });

  table.append(thead, tbody);
  const wrap = document.createElement('div');
  wrap.className = 'report-table-wrap';
  wrap.append(table);
  section.append(wrap);

  return section;
}

/**
 * @param {Element} row
 */
function decorateMethodology(row) {
  row.className = 'report-methodology';
  row.textContent = row.textContent.trim();
}

/**
 * @param {Element} block
 */
export default function decorate(block) {
  document.body.classList.add('executive-report-page');

  const nested = block.querySelector(':scope > .executive-report');
  if (nested) {
    [...nested.children].forEach((child) => block.append(child));
    nested.remove();
  }

  const rows = [...block.children];
  block.textContent = '';

  const container = document.createElement('div');
  container.className = 'executive-report-container';

  let hero = null;
  let methodology = null;

  rows.forEach((row) => {
    if (row.querySelector('h1')) {
      decorateHero(row);
      hero = row;
      return;
    }
    if (isMethodology(row)) {
      decorateMethodology(row);
      methodology = row;
      return;
    }
    if (isKpiGrid(row)) {
      decorateKpiGrid(row);
      container.append(row);
      return;
    }
    if (isTableSection(row)) {
      container.append(decorateTableSection(row));
      return;
    }
    if (isNarrativeSection(row)) {
      decorateNarrativeSection(row);
      container.append(row);
      return;
    }
    if (isSectionLabel(row)) {
      decorateSectionLabel(row);
      container.append(row);
      return;
    }
    container.append(row);
  });

  if (hero) block.append(hero);
  block.append(container);
  if (methodology) block.append(methodology);
}
