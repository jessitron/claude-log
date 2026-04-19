// List panels from a panels.json file with index and type
const fs = require('fs');
const path = process.argv[2] || 'output/episode-8-before.panels.json';
const data = JSON.parse(fs.readFileSync(path, 'utf8'));
data.panels.forEach((p, i) => {
  const preview = (p.lines || []).join(' ').slice(0, 80);
  console.log(`${i} ${p.type}: ${preview}`);
});
