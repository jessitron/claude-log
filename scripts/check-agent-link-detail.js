// Show the full L13 record to find where the subagent hash lives

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

// L13 = index 12
const r = JSON.parse(lines[12]);
// Print all top-level keys
console.log("Top-level keys:", Object.keys(r));
// Print everything except the message content (which is long)
for (const [k, v] of Object.entries(r)) {
  if (k === "message") continue;
  console.log(`${k}: ${JSON.stringify(v)}`);
}
