// See what's in tool_use input fields, so we know what to show in expandable details.

const fs = require("fs");

const filePath = process.argv[2] || "example/agents-observe-bug.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "assistant" || !r.message?.content) continue;
  for (const block of r.message.content) {
    if (block.type !== "tool_use") continue;
    const input = block.input || {};
    const keys = Object.keys(input);
    const summary = keys.map((k) => {
      const v = input[k];
      const str = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}=${str?.slice(0, 80)}`;
    }).join(", ");
    console.log(`L${i + 1} ${block.name}: ${summary}`);
  }
}
