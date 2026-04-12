// How do tool_use blocks connect to their results?
// Check the id on tool_use and how results reference them.

const fs = require("fs");

const filePath = process.argv[2] || "example/ff80b049-3eff-495f-b4f0-c4071d615994.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

let toolUseCount = 0;
let toolResultCount = 0;

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);

  if (r.type === "assistant" && r.message?.content) {
    for (const block of r.message.content) {
      if (block.type === "tool_use") {
        toolUseCount++;
        if (toolUseCount <= 3) {
          console.log(`L${i + 1} TOOL_USE id=${block.id} name=${block.name}`);
        }
      }
    }
  }

  if (r.type === "user" && r.toolUseResult) {
    toolResultCount++;
    if (toolResultCount <= 3) {
      const msg = r.message?.content;
      console.log(`L${i + 1} TOOL_RESULT (via toolUseResult)`);
      console.log(`  sourceToolAssistantUUID=${r.sourceToolAssistantUUID}`);
      if (Array.isArray(msg)) {
        for (const block of msg) {
          if (block.type === "tool_result") {
            console.log(`  tool_use_id=${block.tool_use_id}`);
            const content = block.content;
            if (typeof content === "string") {
              console.log(`  content (string): ${content.slice(0, 150)}`);
            } else if (Array.isArray(content)) {
              for (const c of content) {
                console.log(`  content block type=${c.type}, text=${String(c.text || "").slice(0, 150)}`);
              }
            }
          }
        }
      } else if (typeof msg === "string") {
        console.log(`  message (string): ${msg.slice(0, 150)}`);
      }
      console.log();
    }
  }
}

console.log(`\nTotal tool_use: ${toolUseCount}`);
console.log(`Total tool_result: ${toolResultCount}`);
