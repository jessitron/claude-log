#!/usr/bin/env node
// Dump attachment records from a JSONL transcript.

const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('Usage: show-attachment.js <jsonl>'); process.exit(1); }

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
lines.forEach((line, i) => {
  const d = JSON.parse(line);
  if (d.type !== 'attachment') return;
  console.log(`\n=== line ${i + 1} attachment ===`);
  const att = d.attachment || {};
  console.log('attachment keys:', Object.keys(att).join(', '));
  console.log('attachment.type:', att.type);
  // Show first 4000 chars of serialized attachment
  console.log(JSON.stringify(att, null, 2).slice(0, 4000));
});
