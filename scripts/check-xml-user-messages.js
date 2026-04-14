// Find all user messages that contain XML tags — these are likely system messages, not human speech

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "user") continue;
  if (r.isMeta || r.toolUseResult) continue; // already skipped
  const msg = r.message;
  if (!msg) continue;
  const content = typeof msg.content === "string" ? msg.content :
    Array.isArray(msg.content) ? msg.content.filter(b => b.type === "text").map(b => b.text).join("") : "";
  if (content.match(/<[a-z]+-[a-z]+>/)) {
    console.log(`L${i + 1}:`);
    console.log(content.slice(0, 300));
    console.log();
  }
}
