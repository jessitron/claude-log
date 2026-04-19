// Live-reload dev server for iterating on comic CSS.
//
// Serves output/ as the site root, with static/ overlaid on top so that
// static/comic.css is served directly (no need to re-run ./run between edits).
// CSS changes are injected without a full page reload; HTML changes trigger a reload.

const browserSync = require("browser-sync").create();
const path = require("node:path");
const fs = require("node:fs");

const root = path.resolve(__dirname, "..");
const staticDir = path.join(root, "static");
const outputDir = path.join(root, "output");

function listComics() {
  if (!fs.existsSync(outputDir)) return [];
  return fs
    .readdirSync(outputDir)
    .filter((f) => f.endsWith(".html"))
    .sort();
}

if (listComics().length === 0) {
  console.error("No HTML in output/. Run ./run first to generate the example comics.");
  process.exit(1);
}

function indexHtml() {
  const items = listComics()
    .map((f) => `    <li><a href="/${f}">${f.replace(/\.html$/, "")}</a></li>`)
    .join("\n");
  return `<!doctype html>
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
}

const port = Number(process.env.PORT || 3000);

browserSync.init({
  server: {
    // First match wins — static/ shadows output/, so edits to static/comic.css
    // are served live without re-running ./run.
    baseDir: [staticDir, outputDir],
    middleware: [
      (req, res, next) => {
        const url = req.url.split("?")[0];
        if (url === "/" || url === "/index.html") {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(indexHtml());
          return;
        }
        next();
      },
    ],
  },
  files: [
    path.join(staticDir, "comic.css"),
    path.join(outputDir, "*.html"),
  ],
  port,
  open: false,
  notify: false,
  ui: false,
});

console.log(`Serving ${staticDir} (priority) and ${outputDir}`);
console.log(`Editing static/comic.css → instant injection. Editing output/*.html → reload.`);
