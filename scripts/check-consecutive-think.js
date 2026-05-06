#!/usr/bin/env node
// Look for adjacent claude-think panels in output/*.panels.json — these are
// the visible symptom of the hidden+visible thinking merge bug.
const fs = require("fs");
const path = require("path");

const dir = "output";
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".panels.json"))) {
  const panels = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")).panels;
  let prev = null;
  let pairs = 0;
  const examples = [];
  for (const p of panels) {
    if (p.type === "claude-think" && prev && prev.type === "claude-think") {
      pairs++;
      if (examples.length < 3) {
        examples.push({
          atLines: [prev.lineNumbers[0], p.lineNumbers[0]],
          prev: JSON.stringify(prev.lines).slice(0, 120),
          next: JSON.stringify(p.lines).slice(0, 120),
        });
      }
    }
    prev = p;
  }
  if (pairs > 0) {
    console.log(`${f}: ${pairs} consecutive think pair(s)`);
    for (const e of examples) {
      console.log(`  lines ${e.atLines.join("→")}`);
      console.log(`    prev: ${e.prev}`);
      console.log(`    next: ${e.next}`);
    }
  } else {
    console.log(`${f}: clean (no consecutive think panels)`);
  }
}
