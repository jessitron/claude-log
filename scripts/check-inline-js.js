// Parse every <script>...</script> block in an HTML file with `new Function`
// to surface syntax errors in the inline comic JS without spinning up a browser.
// Usage: node scripts/check-inline-js.js <path-to-html>

const fs = require("fs");

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/check-inline-js.js <path-to-html>");
  process.exit(1);
}

const html = fs.readFileSync(path, "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

let failed = 0;
scripts.forEach((src, i) => {
  try {
    new Function(src);
  } catch (e) {
    failed++;
    console.error(`script #${i} syntax error: ${e.message}`);
  }
});

if (failed > 0) process.exit(1);
console.log(`OK: parsed ${scripts.length} inline scripts in ${path}`);
