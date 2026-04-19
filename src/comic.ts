// CLI: two-step comic pipeline.
//
// Step 1: JSONL → panels JSON (editable intermediate artifact)
//   npm run panels -- <path-to-jsonl> [output-dir]
//
// Step 2: panels JSON → HTML comic
//   npm run html -- <path-to-panels.json> [output-dir]
//
// Or do both at once:
//   npm run comic -- <path-to-jsonl> [output-dir]

import * as fs from "node:fs";
import * as path from "node:path";
import { parseConversationLog } from "./parser.js";
import { groupIntoPanels, type Panel } from "./panels.js";
import { generateHtml } from "./html-generator.js";

function printPanelStats(panels: Panel[]) {
  console.log(`  ${panels.length} panels`);
  const typeCounts: Record<string, number> = {};
  for (const p of panels) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }
}

async function discoverSubagents(jsonlPath: string): Promise<Map<string, Panel[]>> {
  const subagentPanels = new Map<string, Panel[]>();

  // Look for a sibling directory with the same base name containing subagent files
  const baseName = path.basename(jsonlPath, ".jsonl");
  const siblingDir = path.join(path.dirname(jsonlPath), baseName);
  const subagentsDir = path.join(siblingDir, "subagents");

  if (!fs.existsSync(subagentsDir)) return subagentPanels;

  const files = fs.readdirSync(subagentsDir).filter((f) => f.endsWith(".jsonl"));
  for (const file of files) {
    // Extract agentId from filename: agent-{agentId}.jsonl
    const match = file.match(/^agent-(.+)\.jsonl$/);
    if (!match) continue;
    const agentId = match[1];

    const filePath = path.join(subagentsDir, file);
    console.log(`  Subagent ${agentId}: ${file}`);
    const result = await parseConversationLog(filePath);
    // Recurse: subagents could have their own subagents (not yet, but future-proof)
    const panels = groupIntoPanels(result.records, undefined, path.basename(filePath, ".jsonl"));
    subagentPanels.set(agentId, panels);
    console.log(`    ${panels.length} panels`);
  }

  return subagentPanels;
}

async function jsonlToPanels(jsonlPath: string, outputDir: string): Promise<string> {
  console.log(`Parsing: ${jsonlPath}`);
  const result = await parseConversationLog(jsonlPath);
  console.log(`  ${result.records.length} records (${result.stats.totalLines} lines)`);

  const subagentPanels = await discoverSubagents(jsonlPath);
  if (subagentPanels.size > 0) {
    console.log(`  Found ${subagentPanels.size} subagent(s)`);
  }

  const baseName = path.basename(jsonlPath, ".jsonl");
  const panels = groupIntoPanels(result.records, subagentPanels, baseName);
  printPanelStats(panels);
  const title = baseName.replace(/[-_]/g, " ");

  const artifact = { title, panels };

  fs.mkdirSync(outputDir, { recursive: true });
  const panelsPath = path.join(outputDir, `${baseName}.panels.json`);
  fs.writeFileSync(panelsPath, JSON.stringify(artifact, null, 2));
  console.log(`\nWrote: ${panelsPath}`);

  return panelsPath;
}

function panelsToHtml(panelsPath: string, outputDir: string) {
  const raw = JSON.parse(fs.readFileSync(panelsPath, "utf8"));
  const panels: Panel[] = raw.panels;
  const title: string = raw.title || "Untitled";

  printPanelStats(panels);

  const html = generateHtml(panels, title);

  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = path.basename(panelsPath, ".panels.json");
  const htmlPath = path.join(outputDir, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`Wrote: ${htmlPath}`);

  const cssSource = path.join(__dirname, "..", "static", "comic.css");
  const cssDest = path.join(outputDir, "comic.css");
  fs.copyFileSync(cssSource, cssDest);
  console.log(`Wrote: ${cssDest}`);
}

const command = process.argv[2];

if (command === "panels") {
  const jsonlPath = process.argv[3];
  if (!jsonlPath) {
    console.error("Usage: npm run comic -- panels <path-to-jsonl> [output-dir]");
    process.exit(1);
  }
  const outputDir = process.argv[4] || "output";
  jsonlToPanels(jsonlPath, outputDir).catch((err) => {
    console.error(err);
    process.exit(1);
  });
} else if (command === "html") {
  const panelsPath = process.argv[3];
  if (!panelsPath) {
    console.error("Usage: npm run comic -- html <path-to-panels.json> [output-dir]");
    process.exit(1);
  }
  const outputDir = process.argv[4] || "output";
  panelsToHtml(panelsPath, outputDir);
} else {
  // Default: treat the argument as a JSONL path and do both steps
  const jsonlPath = command;
  if (!jsonlPath) {
    console.error(`Usage:
  npm run comic -- <path-to-jsonl>              # both steps
  npm run comic -- panels <path-to-jsonl>       # step 1: make editable panels JSON
  npm run comic -- html <path-to-panels.json>   # step 2: render panels to HTML`);
    process.exit(1);
  }
  const outputDir = process.argv[3] || "output";
  jsonlToPanels(jsonlPath, outputDir)
    .then((panelsPath) => panelsToHtml(panelsPath, outputDir))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
