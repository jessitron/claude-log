#!/usr/bin/env node
// Find where CLAUDE.md content appears in a JSONL transcript and show context around each hit.
// Searches the ENTIRE serialized record (not just message.content) so we catch system prompts,
// attachments, and <system-reminder> injections.

const fs = require('fs');
const path = process.argv[2];
const needle = process.argv[3] || 'CLAUDE.md';
if (!path) {
  console.error('Usage: find-claudemd.js <jsonl> [needle]');
  process.exit(1);
}

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);

lines.forEach((line, i) => {
  const lineNum = i + 1;
  const d = JSON.parse(line);
  const serialized = JSON.stringify(d);
  if (!serialized.includes(needle)) return;

  const msg = d.message || {};
  const role = msg.role;
  const type = d.type;

  // Find all occurrences in the serialized form
  let idx = 0;
  const hits = [];
  while ((idx = serialized.indexOf(needle, idx)) !== -1) {
    hits.push(idx);
    idx += needle.length;
  }

  console.log(`\n=== line ${lineNum} type=${type} role=${role} hits=${hits.length} ===`);
  hits.slice(0, 3).forEach((h) => {
    const window = serialized.slice(Math.max(0, h - 250), h + 400);
    console.log('---');
    console.log(window);
  });
});
