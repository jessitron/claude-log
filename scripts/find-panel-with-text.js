// Find panels in the intermediate JSON that still contain a given string

const fs = require("fs");

const panelsPath = process.argv[2] || "output/episode-8-before.panels.json";
const searchText = process.argv[3] || "task-notification";

const data = JSON.parse(fs.readFileSync(panelsPath, "utf8"));

data.panels.forEach((panel, i) => {
  for (const line of panel.lines) {
    if (line.includes(searchText)) {
      console.log(`Panel ${i}: type=${panel.type}`);
      console.log(`  ${line.slice(0, 200)}`);
      console.log();
    }
  }
});
