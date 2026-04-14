// Find how Agent tool_use blocks link to subagent JSONL files.
// Check: does the tool_use id or some other field contain the subagent hash?

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "assistant" || !r.message?.content) continue;
  for (const block of r.message.content) {
    if (block.type === "tool_use" && block.name === "Agent") {
      console.log(`L${i + 1} Agent tool_use:`);
      console.log(`  id: ${block.id}`);
      console.log(`  input.description: ${block.input?.description}`);
      console.log(`  input.subagent_type: ${block.input?.subagent_type}`);
      console.log(`  input.prompt: ${String(block.input?.prompt || "").slice(0, 100)}`);
      console.log();
    }
  }

  // Also check tool results for Agent to see what comes back
  if (r.type === "user" && r.toolUseResult) {
    const msg = r.message?.content;
    if (!Array.isArray(msg)) continue;
    for (const block of msg) {
      if (block.type !== "tool_result") continue;
      const content = typeof block.content === "string" ? block.content : JSON.stringify(block.content);
      if (content && content.includes("agent")) {
        console.log(`L${i + 1} Tool result that mentions "agent":`);
        console.log(`  tool_use_id: ${block.tool_use_id}`);
        console.log(`  content: ${content.slice(0, 200)}`);
        console.log();
      }
    }
  }
}

// Also grep for the subagent hash
const hash = "ae20659fd0f63295e";
console.log(`\nSearching for subagent hash "${hash}":`);
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(hash)) {
    console.log(`  Found at L${i + 1}`);
  }
}
