// Writes output/index.html with links to every comic HTML file.
// Used by ./run and by the Pages build. The dev server has its own
// in-memory index (see scripts/dev-server.js) so live reload can pick up
// new comics without re-running this.

const fs = require("node:fs");
const path = require("node:path");

const outputDir = path.resolve(__dirname, "..", "output");

const comics = fs
  .readdirSync(outputDir)
  .filter((f) => f.endsWith(".html") && f !== "index.html")
  .sort();

const items = comics
  .map((f) => `    <li><a href="./${f}">${f.replace(/\.html$/, "")}</a></li>`)
  .join("\n");

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Comics</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 2rem; }
    h1 { color: #e94560; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.5rem 0; }
    a { color: #7ec8e3; font-size: 1.1rem; text-decoration: none; }
    a:hover { color: #b8e0f0; text-decoration: underline; }
  </style>
</head>
<body>
  <h1>Comics</h1>
  <ul>
${items}
  </ul>
</body>
</html>
`;

fs.writeFileSync(path.join(outputDir, "index.html"), html);
console.log(`Wrote ${path.join(outputDir, "index.html")} (${comics.length} comics)`);
