// Check the exact content structure of records that contain task-notification

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  if (!lines[i].includes("task-notification")) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "user") continue;

  console.log(`L${i + 1}: isMeta=${r.isMeta} toolUseResult=${!!r.toolUseResult}`);
  const msg = r.message;
  if (typeof msg.content === "string") {
    console.log("  content is STRING");
    console.log("  " + msg.content.slice(0, 100));
  } else if (Array.isArray(msg.content)) {
    console.log("  content is ARRAY with " + msg.content.length + " blocks");
    for (const block of msg.content) {
      console.log("  block type=" + block.type + " text=" + String(block.text || "").slice(0, 100));
    }
  }
  console.log();
}
