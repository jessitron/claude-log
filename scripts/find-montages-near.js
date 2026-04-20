#!/usr/bin/env node
// Show which montage panels cover a given line range, to debug why the
// conversation got split.

import { readFileSync } from "node:fs";

const [path, startArg, endArg] = process.argv.slice(2);
const start = parseInt(startArg ?? "1", 10);
const end = parseInt(endArg ?? String(start + 30), 10);

const data = JSON.parse(readFileSync(path, "utf8"));
const panels = Array.isArray(data) ? data : data.panels;

for (let i = 0; i < panels.length; i++) {
  const p = panels[i];
  const lns = p.lineNumbers || [];
  if (lns.some((l) => l >= start && l <= end)) {
    const bInfo =
      p.type === "action-montage" && p.batches
        ? ` batches=${p.batches.length}, tools=[${p.batches
            .map((b) => b.tools.map((t) => t.name).join("+"))
            .join(" | ")}]`
        : "";
    console.log(
      `#${i} [${p.type}] lines=${lns.join(",")}${bInfo}`
    );
  }
}
