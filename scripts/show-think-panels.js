#!/usr/bin/env node
// Show the first N claude-think panels with their lines, tokens, and source
// records — useful for verifying thinking+text merge behavior.

import { readFileSync } from "node:fs";

const [path, limitArg] = process.argv.slice(2);
const limit = parseInt(limitArg ?? "10", 10);

const data = JSON.parse(readFileSync(path, "utf8"));
const panels = Array.isArray(data) ? data : data.panels;

const think = panels.filter((p) => p.type === "claude-think" || p.type === "claude-speech");
console.log(`Found ${think.length} claude-think/speech panels. Showing first ${limit}:\n`);

for (let i = 0; i < Math.min(limit, think.length); i++) {
  const p = think[i];
  const tokens =
    p.totalInputTokens !== undefined || p.outputTokens !== undefined
      ? `[${p.totalInputTokens ?? "?"} in / ${p.outputTokens ?? "?"} out]`
      : "(no tokens)";
  console.log(`#${i} ${p.type} lines=${p.lineNumbers.join(",")} ${tokens}`);
  for (const line of p.lines) {
    const preview = line.length > 100 ? line.slice(0, 100) + "…" : line;
    console.log(`    "${preview}"`);
  }
  console.log();
}
