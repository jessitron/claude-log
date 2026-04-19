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

const htmls = fs.existsSync(outputDir)
  ? fs.readdirSync(outputDir).filter((f) => f.endsWith(".html"))
  : [];
if (htmls.length === 0) {
  console.error("No HTML in output/. Run ./run first to generate the example comics.");
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);

browserSync.init({
  server: {
    // First match wins — static/ shadows output/, so edits to static/comic.css
    // are served live without re-running ./run.
    baseDir: [staticDir, outputDir],
    directory: true,
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
