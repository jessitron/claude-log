// Find ALL records containing task-notification, regardless of type/flags

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (!lines[i].trim()) continue;
  if (!lines[i].includes("task-notification")) continue;
  const r = JSON.parse(lines[i]);
  console.log(`L${i + 1}: type=${r.type} isMeta=${r.isMeta} toolUseResult=${!!r.toolUseResult}`);

  // Show content regardless of where it is
  const raw = JSON.stringify(r).slice(0, 300);
  if (r.type === "user") {
    const msg = r.message;
    const content = typeof msg?.content === "string" ? msg.content :
      Array.isArray(msg?.content) ? msg.content.map(b => b.text || JSON.stringify(b).slice(0, 80)).join("|") : "???";
    console.log("  content: " + content.slice(0, 200));
  } else {
    console.log("  raw: " + raw);
  }
  console.log();
}
