#!/usr/bin/env node
// Inspect action-montage panels across one or more panels.json files to
// verify batch grouping:
//   - number of batches per montage
//   - parallel sizes
//   - token numbers per batch (should grow across sequential batches)
//
// Usage:
//   node scripts/check-montage-batches.js                   # scans output/*.panels.json
//   node scripts/check-montage-batches.js <file1> [file2]   # specific files
//   node scripts/check-montage-batches.js --verbose <file>  # per-montage breakdown

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const paths = args.filter((a) => a !== "--verbose");

let files;
if (paths.length > 0) {
  files = paths;
} else {
  files = readdirSync("output")
    .filter((f) => f.endsWith(".panels.json"))
    .map((f) => join("output", f));
}

function summarize(path) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const panels = Array.isArray(data) ? data : data.panels;
  const montages = panels.filter((p) => p.type === "action-montage");

  let multiBatch = 0;
  let anyParallel = 0;
  let maxBatches = 0;
  for (const m of montages) {
    const batches = m.batches || [];
    if (batches.length > 1) multiBatch++;
    if (batches.some((b) => b.tools.length > 1)) anyParallel++;
    if (batches.length > maxBatches) maxBatches = batches.length;
  }

  return { montages, multiBatch, anyParallel, maxBatches };
}

function printVerbose(path, montages) {
  for (let i = 0; i < montages.length; i++) {
    const m = montages[i];
    const batches = m.batches || [];
    if (batches.length <= 1 && !batches.some((b) => b.tools.length > 1)) continue;
    const toolCount = batches.reduce((s, b) => s + b.tools.length, 0);
    console.log(`  Montage #${i} (${toolCount} tools, ${batches.length} batches):`);
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const names = batch.tools.map((t) => t.name).join(", ");
      const tokens =
        batch.totalInputTokens !== undefined || batch.outputTokens !== undefined
          ? ` [${batch.totalInputTokens ?? "?"} in / ${batch.outputTokens ?? "?"} out]`
          : "";
      const parallel = batch.tools.length > 1 ? ` (parallel ×${batch.tools.length})` : "";
      console.log(`    batch ${b + 1}: ${names}${parallel}${tokens}`);
    }
  }
}

console.log(`${"File".padEnd(52)} ${"montages".padStart(8)} ${"multi-batch".padStart(11)} ${"parallel".padStart(8)} ${"max batches".padStart(11)}`);
console.log("-".repeat(95));
for (const path of files) {
  const { montages, multiBatch, anyParallel, maxBatches } = summarize(path);
  const name = path.replace(/^output\//, "").replace(/\.panels\.json$/, "");
  console.log(
    `${name.padEnd(52)} ${String(montages.length).padStart(8)} ${String(multiBatch).padStart(11)} ${String(anyParallel).padStart(8)} ${String(maxBatches).padStart(11)}`
  );
  if (verbose) printVerbose(path, montages);
}
