#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const directory = new URL('../../of1/config/', import.meta.url);
const knowledgeUrl = new URL('knowledge.json', directory);
const pagesUrl = new URL('knowledge-pages.json', directory);
const entities = JSON.parse(await fs.readFile(knowledgeUrl, 'utf8'));
const pages = JSON.parse(await fs.readFile(pagesUrl, 'utf8'));
const marker = 'Source-backed adventure planning';
const topics = [
  ['gear', 'Gear checklist'],
  ['route', 'Route briefing'],
  ['access', 'Permits & access'],
];
const entries = entities.filter((entry) => entry.id.startsWith('planning-'));
assert.equal(entries.length, 5, 'Expected the five curated planning adventures');
entries.forEach((entry) => {
  const page = pages.find((capture) => capture.url === entry.url);
  assert(page, `Missing original source capture for ${entry.id}`);
  assert(entry.planning.sources.some((source) => source.url === entry.url));
  entry.facts = topics.flatMap(([key, label]) => {
    assert(entry.planning[key].length, `Missing ${label} for ${entry.id}`);
    return entry.planning[key].map((text) => `${entry.title}. ${label}: ${text}`);
  });
  entry.facts.push(`${entry.title}. Source limitations: ${entry.planning.caveat}`);
  entry.planning.sources.forEach((source) => {
    entry.facts.push(`${entry.title}. ${source.label}: ${source.url}`);
  });
  const start = page.blocks.findIndex((block) => block.tag === 'h2' && block.text === marker);
  if (start !== -1) {
    const nextHeading = page.blocks.findIndex((block, index) => index > start && block.tag === 'h2');
    page.blocks.splice(start, (nextHeading === -1 ? page.blocks.length : nextHeading) - start);
  }
  page.blocks.push(
    { tag: 'h2', text: marker },
    { tag: 'p', text: `${entry.title}. Editorial planning summary, not current booking or safety advice.` },
  );
  topics.forEach(([key, label]) => {
    page.blocks.push({ tag: 'h3', text: label });
    entry.planning[key].forEach((text) => {
      page.blocks.push({ tag: 'li', text: `${entry.title}. ${label}: ${text}` });
    });
  });
  page.blocks.push({ tag: 'p', text: `${entry.title}. Source limitations: ${entry.planning.caveat}` });
  entry.planning.sources.forEach((source) => {
    page.blocks.push({ tag: 'a', href: source.url, text: `${entry.title}. ${source.label}` });
  });
});
await fs.writeFile(knowledgeUrl, `${JSON.stringify(entities, null, 2)}\n`);
await fs.writeFile(pagesUrl, `${JSON.stringify(pages, null, 2)}\n`);
process.stdout.write(`Enriched ${entries.length} planning entities and existing source captures; no pages or images added.\n`);
