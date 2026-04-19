#!/usr/bin/env node
// Show the first few records of a JSONL transcript, summarized.

const fs = require('fs');
const path = process.argv[2];
const n = parseInt(process.argv[3] || '5', 10);
if (!path) { console.error('Usage: show-first-turn.js <jsonl> [n]'); process.exit(1); }

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean).slice(0, n);

lines.forEach((line, i) => {
  const d = JSON.parse(line);
  const msg = d.message || {};
  console.log(`\n=== line ${i + 1} ===`);
  console.log('type:', d.type);
  console.log('role:', msg.role);
  console.log('topLevelKeys:', Object.keys(d).join(', '));
  const content = msg.content;
  if (typeof content === 'string') {
    console.log('content (string, first 2000 chars):');
    console.log(content.slice(0, 2000));
  } else if (Array.isArray(content)) {
    console.log('content (array blocks):');
    content.forEach((b, j) => {
      const s = JSON.stringify(b).slice(0, 1500);
      console.log(`  [${j}] ${s}`);
    });
  } else {
    console.log('content:', content === undefined ? '(no message.content)' : JSON.stringify(content).slice(0, 500));
  }
});
