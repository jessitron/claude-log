#!/usr/bin/env node
// Survey attachment record types across every example/*.jsonl.
// For each file, prints a count of distinct (attachment.type, key discriminator)
// combinations so we can see which flavors of attachment exist in the wild.

const fs = require("fs");
const path = require("path");

const exampleDir = path.join(__dirname, "..", "example");
const files = fs.readdirSync(exampleDir).filter((f) => f.endsWith(".jsonl"));

// Aggregate across all files as well
const globalCounts = new Map();

for (const file of files) {
  const full = path.join(exampleDir, file);
  const lines = fs.readFileSync(full, "utf8").split("\n");
  const counts = new Map();
  const firstLine = new Map(); // label -> first line where it appeared

  lines.forEach((raw, idx) => {
    if (!raw.trim()) return;
    let rec;
    try {
      rec = JSON.parse(raw);
    } catch {
      return;
    }
    if (rec.type !== "attachment") return;
    const att = rec.attachment || {};
    const parts = [`type=${att.type ?? "?"}`];
    if (att.commandMode) parts.push(`commandMode=${att.commandMode}`);
    if (att.hookName) parts.push(`hookName=${att.hookName}`);
    if (att.hookEvent) parts.push(`hookEvent=${att.hookEvent}`);
    const label = parts.join(" ");
    counts.set(label, (counts.get(label) || 0) + 1);
    globalCounts.set(label, (globalCounts.get(label) || 0) + 1);
    if (!firstLine.has(label)) firstLine.set(label, idx + 1);
  });

  if (counts.size === 0) continue;
  console.log(`=== ${file} ===`);
  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [label, n] of rows) {
    console.log(`  ${String(n).padStart(4)}  ${label}  (first: L${firstLine.get(label)})`);
  }
}

console.log("\n=== TOTAL across all example files ===");
const rows = Array.from(globalCounts.entries()).sort((a, b) => b[1] - a[1]);
for (const [label, n] of rows) {
  console.log(`  ${String(n).padStart(5)}  ${label}`);
}
