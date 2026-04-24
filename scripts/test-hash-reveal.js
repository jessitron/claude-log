// Load a generated comic in jsdom with a specific URL hash, run its scripts,
// and print which panels ended up visible. Smoke-tests the hash fast-forward
// logic without needing a real browser.
//
// Usage: node scripts/test-hash-reveal.js <path-to-html> [hash-ref]

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const htmlPath = process.argv[2];
const hashRef = process.argv[3] || "";
if (!htmlPath) {
  console.error("Usage: node scripts/test-hash-reveal.js <path-to-html> [hash-ref]");
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, "utf8");

const url = "file://" + path.resolve(htmlPath) + (hashRef ? "#" + hashRef : "");

const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.error("jsdomError:", e.message, e.stack || ""));
for (const level of ["log", "info", "warn", "error"]) {
  vc.on(level, (...args) => console[level]("[page]", ...args));
}

const dom = new JSDOM(html, {
  url,
  runScripts: "dangerously",
  pretendToBeVisual: true,
  virtualConsole: vc,
});

// Let microtasks + RAFs drain.
setTimeout(() => {
  const doc = dom.window.document;
  const panels = Array.from(
    doc.querySelectorAll(".comic-strip > .panel, .comic-strip > .robot-sequence > .sequence-panels > .panel"),
  );
  console.log(`hash: ${dom.window.location.hash || "(empty)"}`);
  console.log(`panels total: ${panels.length}`);
  panels.forEach((p, i) => {
    const hidden = p.classList.contains("panel-hidden");
    const atOrigin = p.classList.contains("notification-at-origin");
    const file = p.getAttribute("data-source-file") || "";
    const lines = p.getAttribute("data-source-lines") || "";
    const ref = (file ? file + ":L" : "L") + lines;
    const flag = hidden ? "HIDDEN" : atOrigin ? "AT-ORIGIN" : "VISIBLE";
    if (i < 6 || !hidden) console.log(`  [${i}] ${flag} ${ref}`);
  });
  dom.window.close();
}, 200);
