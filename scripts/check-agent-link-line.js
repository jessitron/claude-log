// Show the line that contains the subagent hash to understand the linking structure

const fs = require("fs");

const filePath = process.argv[2] || "example/episode-8-before.jsonl";
const hash = process.argv[3] || "ae20659fd0f63295e";
const lines = fs.readFileSync(filePath, "utf8").split("\n");

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(hash)) {
    const r = JSON.parse(lines[i]);
    console.log(`L${i + 1} type=${r.type}`);
    console.log(JSON.stringify(r, null, 2).slice(0, 1000));
  }
}
