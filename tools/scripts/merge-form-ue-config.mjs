#!/usr/bin/env node
/**
 * Merge AEM Forms Universal Editor configs from aem-boilerplate-forms
 * into this project's component-definition.json, component-models.json,
 * and component-filters.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BP_URL = 'https://raw.githubusercontent.com/adobe-rnd/aem-boilerplate-forms/main';

async function fetchJson(path) {
  const res = await fetch(`${BP_URL}/${path}`);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

const [bpDefinition, bpModels, bpFilters] = await Promise.all([
  fetchJson('component-definition.json'),
  fetchJson('component-models.json'),
  fetchJson('component-filters.json'),
]);

const formFilter = bpFilters.find((f) => f.id === 'form');
if (!formFilter) throw new Error('Form filter not found in boilerplate-forms');

const formIds = new Set(formFilter.components);
const bpBlocks = bpDefinition.groups.find((g) => g.id === 'blocks');
const formDefinitions = bpBlocks.components.filter((c) => formIds.has(c.id));

const formModels = bpModels.filter((m) => formIds.has(m.id) || m.id === 'form');

const definition = JSON.parse(readFileSync(join(ROOT, 'component-definition.json'), 'utf8'));
const models = JSON.parse(readFileSync(join(ROOT, 'component-models.json'), 'utf8'));
const filters = JSON.parse(readFileSync(join(ROOT, 'component-filters.json'), 'utf8'));

const blocksGroup = definition.groups.find((g) => g.id === 'blocks');
if (!blocksGroup) throw new Error('Blocks group missing in component-definition.json');

// Replace form block definition with AEM Forms xwalk definition.
const formDef = bpBlocks.components.find((c) => c.id === 'form');
const formIdx = blocksGroup.components.findIndex((c) => c.id === 'form');
if (formIdx >= 0 && formDef) {
  blocksGroup.components[formIdx] = formDef;
}

// Add form field component definitions (skip form + embed-adaptive-form duplicates).
const existingIds = new Set(blocksGroup.components.map((c) => c.id));
formDefinitions
  .filter((c) => c.id !== 'form' && c.id !== 'embed-adaptive-form' && !existingIds.has(c.id))
  .forEach((c) => blocksGroup.components.push(c));

// Replace form model; append field models.
const bpFormModel = formModels.find((m) => m.id === 'form');
const modelIdx = models.findIndex((m) => m.id === 'form');
if (modelIdx >= 0 && bpFormModel) {
  models[modelIdx] = bpFormModel;
}
const existingModelIds = new Set(models.map((m) => m.id));
formModels
  .filter((m) => m.id !== 'form' && !existingModelIds.has(m.id))
  .forEach((m) => models.push(m));

// Add form container filter for field palette.
if (!filters.some((f) => f.id === 'form')) {
  filters.push(formFilter);
}

writeFileSync(join(ROOT, 'component-definition.json'), `${JSON.stringify(definition, null, 2)}\n`);
writeFileSync(join(ROOT, 'component-models.json'), `${JSON.stringify(models, null, 2)}\n`);
writeFileSync(join(ROOT, 'component-filters.json'), `${JSON.stringify(filters, null, 2)}\n`);

console.log(`Merged ${formDefinitions.length} form definitions`);
console.log(`Merged ${formModels.length} form models`);
console.log('Added form filter with', formFilter.components.length, 'components');
