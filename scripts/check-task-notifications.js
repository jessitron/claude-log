// Find task-notification messages to understand their structure

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  const r = JSON.parse(lines[i]);
  if (r.type !== "user") continue;
  const msg = r.message;
  if (!msg) continue;
  const content = typeof msg.content === "string" ? msg.content :
    Array.isArray(msg.content) ? msg.content.filter(b => b.type === "text").map(b => b.text).join("") : "";
  if (content.includes("<task-notification>")) {
    console.log(`L${i + 1}: isMeta=${r.isMeta} toolUseResult=${!!r.toolUseResult}`);
    console.log(content.slice(0, 400));
    console.log();
  }
}
