#!/usr/bin/env node
// Find the first record in a JSONL file that contains a `usage` field
// and print its usage block, plus a summary of which record types carry usage.

const fs = require('fs');
const path = process.argv[2];
if (!path) {
  console.error('usage: find-usage.js <path-to-jsonl>');
  process.exit(1);
}

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);
const typesWithUsage = new Map();
let firstExample = null;

for (const line of lines) {
  let rec;
  try { rec = JSON.parse(line); } catch { continue; }
  const usage = rec?.message?.usage;
  if (usage) {
    const key = rec.type + (rec.message?.role ? `/${rec.message.role}` : '');
    typesWithUsage.set(key, (typesWithUsage.get(key) || 0) + 1);
    if (!firstExample) firstExample = { type: key, usage, uuid: rec.uuid };
  }
}

console.log(`total records: ${lines.length}`);
console.log('record types carrying usage:');
for (const [k, v] of typesWithUsage) console.log(`  ${k}: ${v}`);
console.log('\nfirst example usage block:');
console.log(JSON.stringify(firstExample, null, 2));
