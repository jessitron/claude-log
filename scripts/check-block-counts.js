// Check whether assistant records have multiple content blocks in one record,
// or one block per record. This tells us whether our look-ahead for
// "short text before tool_use" needs to work within a record or across records.

const fs = require("fs");

const filePath = process.argv[2] || "example/agents-observe-bug.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "assistant" || !r.message?.content) continue;

  const content = r.message.content;
  if (content.length > 1) {
    const types = content.map((b) => b.type).join(", ");
    console.log(`L${i + 1} has ${content.length} blocks: ${types}`);
  }
}
