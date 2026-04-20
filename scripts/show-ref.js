#!/usr/bin/env node
// Resolve a panel reference (e.g. "episode-8-before:L42" or "agent-xxx:L1,2,3")
// to the JSONL file + lines, and print the interesting parts of each record.
//
// Usage:
//   node scripts/show-ref.js <ref> [options]
//
// Examples:
//   node scripts/show-ref.js episode-8-before:L42
//   node scripts/show-ref.js agent-ae20659fd0f63295e:L1,2,3
//   node scripts/show-ref.js episode-8-before:L42 -c 2       # 2 lines before+after each
//   node scripts/show-ref.js episode-8-before:L42 --before 1 --after 3
//   node scripts/show-ref.js episode-8-before:L40-45         # range notation
//   node scripts/show-ref.js episode-8-before:L42 --full     # no filtering
//   node scripts/show-ref.js episode-8-before:L42 --raw      # print the raw JSONL line
//
// What "interesting" means: every JSONL record carries metadata we almost never
// care about when Jessitron points at a panel (uuid chains, sessionId, cwd,
// gitBranch, version, etc.). This script strips those by default and shows
// type/message/attachment/toolUseResult/timestamp — the stuff that actually
// tells you what happened. Use --full to see every key.

const fs = require("fs");
const path = require("path");

const NOISE_KEYS = new Set([
  "uuid",
  "parentUuid",
  "sessionId",
  "cwd",
  "gitBranch",
  "version",
  "userType",
  "entrypoint",
  "promptId",
  "requestId",
  "messageId",          // on file-history-snapshot — same id appears nested
  "permissionMode",     // usually not interesting when pointed at a panel
]);

function parseArgs(argv) {
  const opts = {
    ref: null,
    context: 0,
    before: 0,
    after: 0,
    full: false,
    raw: false,
    maxContent: 2000,   // truncate large string fields so output stays readable
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-c" || a === "--context") {
      opts.context = parseInt(argv[++i], 10);
    } else if (a === "--before") {
      opts.before = parseInt(argv[++i], 10);
    } else if (a === "--after") {
      opts.after = parseInt(argv[++i], 10);
    } else if (a === "--full") {
      opts.full = true;
    } else if (a === "--raw") {
      opts.raw = true;
    } else if (a === "--max" || a === "--max-content") {
      opts.maxContent = parseInt(argv[++i], 10);
    } else if (a === "--no-truncate") {
      opts.maxContent = Infinity;
    } else if (a === "-h" || a === "--help") {
      printHelp();
      process.exit(0);
    } else if (!opts.ref) {
      opts.ref = a;
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  if (!opts.ref) {
    printHelp();
    process.exit(2);
  }
  // context is shorthand for symmetric before+after
  if (opts.context > 0) {
    opts.before = Math.max(opts.before, opts.context);
    opts.after = Math.max(opts.after, opts.context);
  }
  return opts;
}

function printHelp() {
  console.error(`Usage: node scripts/show-ref.js <ref> [options]

  <ref>               basename:L<n> or basename:L<n,n,n> or basename:L<start-end>
                      e.g. episode-8-before:L42  or  agent-abc123:L1,2,3

Options:
  -c, --context N     show N extra lines before and after the ref
      --before N      show N extra lines before only
      --after N       show N extra lines after only
      --full          include every key (skip the noise filter)
      --raw           print the raw JSONL line(s) verbatim
      --max N         truncate string fields longer than N chars (default 2000)
      --no-truncate   don't truncate string fields
  -h, --help          show this help
`);
}

// "episode-8-before:L42" -> { base: "episode-8-before", lines: [42] }
// "episode-8-before:L40-45" -> lines [40,41,42,43,44,45]
// "episode-8-before:L40,42,44" -> lines [40,42,44]
function parseRef(ref) {
  const m = ref.match(/^(.+?):L(.+)$/);
  if (!m) throw new Error(`Not a ref: ${ref} (expected basename:L<lines>)`);
  const base = m[1];
  const spec = m[2];
  const lines = new Set();
  for (const piece of spec.split(",")) {
    const range = piece.match(/^(\d+)-(\d+)$/);
    if (range) {
      const a = parseInt(range[1], 10);
      const b = parseInt(range[2], 10);
      for (let n = Math.min(a, b); n <= Math.max(a, b); n++) lines.add(n);
    } else {
      const n = parseInt(piece, 10);
      if (!Number.isFinite(n)) throw new Error(`Bad line in ref: ${piece}`);
      lines.add(n);
    }
  }
  return { base, lines: [...lines].sort((x, y) => x - y) };
}

// The panel sourceFile is a JSONL basename — could be a top-level example, a
// subagent, or a nested subagent. Walk example/ to find it.
function findJsonl(base) {
  const root = path.join(__dirname, "..", "example");
  const target = base + ".jsonl";
  const matches = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && entry.name === target) {
        matches.push(full);
      }
    }
  }
  if (matches.length === 0) throw new Error(`No JSONL found for basename: ${base}`);
  if (matches.length > 1) {
    console.error(`Warning: multiple files match ${base}.jsonl:`);
    for (const m of matches) console.error(`  ${m}`);
    console.error(`Using first.`);
  }
  return matches[0];
}

function readLines(filePath, wanted) {
  // Stream line-by-line so we don't load huge JSONL files entirely.
  // We know the max wanted line, so we can stop early.
  const maxWanted = Math.max(...wanted);
  const out = new Map();
  const content = fs.readFileSync(filePath, "utf8");
  let lineNum = 0;
  let start = 0;
  for (let i = 0; i <= content.length; i++) {
    if (i === content.length || content[i] === "\n") {
      lineNum++;
      if (wanted.includes(lineNum)) {
        out.set(lineNum, content.slice(start, i));
      }
      start = i + 1;
      if (lineNum >= maxWanted) break;
    }
  }
  return out;
}

function truncateStrings(value, max) {
  if (max === Infinity) return value;
  if (typeof value === "string") {
    if (value.length > max) {
      return value.slice(0, max) + `… [${value.length - max} more chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => truncateStrings(v, max));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncateStrings(v, max);
    return out;
  }
  return value;
}

function filterNoise(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NOISE_KEYS.has(k)) continue;
    // isSidechain:false is default; only show if true
    if (k === "isSidechain" && v === false) continue;
    out[k] = v;
  }
  return out;
}

function formatRecord(lineNum, rawLine, opts, isContext) {
  const ctx = isContext ? " (context)" : "";
  if (opts.raw) {
    return `--- L${lineNum}${ctx} ---\n${rawLine}\n`;
  }
  let parsed;
  try {
    parsed = JSON.parse(rawLine);
  } catch (err) {
    return `--- L${lineNum}${ctx} (unparseable) ---\n${rawLine}\n`;
  }
  const filtered = opts.full ? parsed : filterNoise(parsed);
  const truncated = truncateStrings(filtered, opts.maxContent);
  const header = `--- L${lineNum}`
    + (parsed.type ? ` type=${parsed.type}` : "")
    + (parsed.isSidechain ? " sidechain" : "")
    + (parsed.timestamp ? ` @ ${parsed.timestamp}` : "")
    + `${ctx} ---`;
  return `${header}\n${JSON.stringify(truncated, null, 2)}\n`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { base, lines } = parseRef(opts.ref);
  const filePath = findJsonl(base);

  // Expand with before/after context around the min/max of the core lines.
  const min = Math.min(...lines);
  const max = Math.max(...lines);
  const expanded = new Set(lines);
  for (let n = Math.max(1, min - opts.before); n < min; n++) expanded.add(n);
  for (let n = max + 1; n <= max + opts.after; n++) expanded.add(n);
  const wanted = [...expanded].sort((a, b) => a - b);
  const coreSet = new Set(lines);

  const records = readLines(filePath, wanted);

  console.log(`File: ${path.relative(path.join(__dirname, ".."), filePath)}`);
  console.log(`Ref lines: ${lines.join(",")}  (context: -${opts.before}/+${opts.after})`);
  console.log();

  for (const n of wanted) {
    if (!records.has(n)) {
      console.log(`--- L${n} (not found — file ends before this line) ---\n`);
      continue;
    }
    console.log(formatRecord(n, records.get(n), opts, !coreSet.has(n)));
  }
}

main();
