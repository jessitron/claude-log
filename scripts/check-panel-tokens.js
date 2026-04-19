#!/usr/bin/env node
// Given a panels.json file and a source line number, print the panel
// that covers that line. Useful for sanity-checking that totalInputTokens
// is being populated on the expected panels.

const fs = require('fs');
const [, , panelsPath, lineStr] = process.argv;
if (!panelsPath || !lineStr) {
  console.error('usage: check-panel-tokens.js <panels.json> <lineNumber>');
  process.exit(1);
}
const target = Number(lineStr);
const doc = JSON.parse(fs.readFileSync(panelsPath, 'utf8'));
const panels = Array.isArray(doc) ? doc : doc.panels;
const match = panels.find(p => p.lineNumbers.includes(target));
if (!match) {
  console.log(`no panel covers line ${target}`);
  process.exit(0);
}
console.log(JSON.stringify(match, null, 2));
