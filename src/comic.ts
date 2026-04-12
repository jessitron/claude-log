// CLI: generate a webtoon comic from a Claude Code conversation log.
// Usage: npm run comic -- <path-to-jsonl> [output.html]

import * as fs from "node:fs";
import * as path from "node:path";
import { parseConversationLog } from "./parser.js";
import { groupIntoPanels } from "./panels.js";
import { generateHtml } from "./html-generator.js";

async function main() {
  const jsonlPath = process.argv[2];
  if (!jsonlPath) {
    console.error("Usage: npm run comic -- <path-to-jsonl> [output-dir]");
    process.exit(1);
  }

  const outputDir = process.argv[3] || "output";

  // Parse
  console.log(`Parsing: ${jsonlPath}`);
  const result = await parseConversationLog(jsonlPath);
  console.log(`  ${result.records.length} records (${result.stats.totalLines} lines)`);

  // Group into panels
  const panels = groupIntoPanels(result.records);
  console.log(`  ${panels.length} panels`);
  const typeCounts: Record<string, number> = {};
  for (const p of panels) {
    typeCounts[p.type] = (typeCounts[p.type] || 0) + 1;
  }
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${type}: ${count}`);
  }

  // Generate HTML
  const baseName = path.basename(jsonlPath, ".jsonl");
  const title = baseName.replace(/[-_]/g, " ");
  const html = generateHtml(panels, title);

  // Write output
  fs.mkdirSync(outputDir, { recursive: true });
  const htmlPath = path.join(outputDir, `${baseName}.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`\nWrote: ${htmlPath}`);

  // Copy CSS alongside the HTML
  const cssSource = path.join(__dirname, "..", "static", "comic.css");
  const cssDest = path.join(outputDir, "comic.css");
  fs.copyFileSync(cssSource, cssDest);
  console.log(`Wrote: ${cssDest}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
