// Inspect queue-operation records to see what they contain.
// These might be messages the human typed while Claude was working.

const fs = require("fs");

const filePath = process.argv[2] || "example/agents-observe-bug.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "queue-operation") continue;
  console.log(`L${i + 1}:`);
  console.log(`  operation: ${r.operation}`);
  console.log(`  content: ${JSON.stringify(r.content)?.slice(0, 200)}`);
  console.log();
}
