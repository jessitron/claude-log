import { parseConversationLog } from "./parser.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx ts-node src/main.ts <path-to-jsonl>");
    process.exit(1);
  }

  console.log(`Parsing: ${filePath}\n`);

  const result = await parseConversationLog(filePath);

  // Stats
  console.log("=== Parse Stats ===");
  console.log(`Total lines: ${result.stats.totalLines}`);
  console.log(`Parse errors: ${result.stats.parseErrors}`);
  console.log(`Records by type:`);
  for (const [type, count] of Object.entries(result.stats.byType).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${type}: ${count}`);
  }

  // Observations
  console.log(`\n=== Schema Observations ===`);
  console.log(result.observations.summary());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
