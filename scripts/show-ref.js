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
//   node scripts/show-ref.js episode-8-before:L42 -f attachment         # only this field
//   node scripts/show-ref.js episode-8-before:L42 -f +message.usage     # defaults + extras
//
// What "interesting" means: every JSONL record carries metadata we almost never
// care about when Jessitron points at a panel (uuid chains, sessionId, cwd,
// gitBranch, version, etc.). By default this script shows only a short list
// of high-signal fields (type/timestamp/message.role/message.content/
// toolUseResult/summary/isSidechain/isMeta). Use -f to pick your own set, or
// --full to see every key.

const fs = require("fs");
const path = require("path");

// Default field paths to show per record. Dotted paths select nested keys.
// Tuned for "Jessitron pointed at a panel; what happened here?" — keeps
// output small enough that Claude Code won't truncate it mid-tool-result.
const DEFAULT_FIELDS = [
  "type",
  "timestamp",
  "summary",
  "isSidechain",
  "isMeta",
  "message.role",
  "message.content",
  "toolUseResult",
  "attachment",
];

function parseArgs(argv) {
  const opts = {
    ref: null,
    context: 0,
    before: 0,
    after: 0,
    full: false,
    raw: false,
    fields: null,       // null = use DEFAULT_FIELDS
    maxContent: 500,    // truncate large string fields so output stays readable
    maxArray: 20,       // truncate large arrays too — addedNames etc. can be huge
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
    } else if (a === "-f" || a === "--fields") {
      const spec = argv[++i];
      if (!spec) throw new Error("--fields requires a value");
      // Leading "+" means "default fields plus these".
      if (spec.startsWith("+")) {
        const extras = spec.slice(1).split(",").map((s) => s.trim()).filter(Boolean);
        opts.fields = [...DEFAULT_FIELDS, ...extras];
      } else {
        opts.fields = spec.split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else if (a === "--max" || a === "--max-content") {
      opts.maxContent = parseInt(argv[++i], 10);
    } else if (a === "--max-array") {
      opts.maxArray = parseInt(argv[++i], 10);
    } else if (a === "--no-truncate") {
      opts.maxContent = Infinity;
      opts.maxArray = Infinity;
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
  -f, --fields LIST   comma-separated field paths to include (dotted, e.g.
                      message.content,message.usage). Prefix with "+" to add
                      to the defaults: "-f +attachment,message.usage".
                      Default: ${DEFAULT_FIELDS.join(",")}
      --full          include every key (skip field filtering)
      --raw           print the raw JSONL line(s) verbatim
      --max N         truncate strings longer than N chars (default 500)
      --max-array N   truncate arrays longer than N elements (default 20)
      --no-truncate   don't truncate strings or arrays
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

function truncateValue(value, opts) {
  if (typeof value === "string") {
    if (opts.maxContent !== Infinity && value.length > opts.maxContent) {
      return value.slice(0, opts.maxContent)
        + `… [${value.length - opts.maxContent} more chars]`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (opts.maxArray !== Infinity && value.length > opts.maxArray) {
      const kept = value.slice(0, opts.maxArray).map((v) => truncateValue(v, opts));
      kept.push(`… [${value.length - opts.maxArray} more items]`);
      return kept;
    }
    return value.map((v) => truncateValue(v, opts));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncateValue(v, opts);
    return out;
  }
  return value;
}

// Pick a subset of `obj` by dotted paths. "message.content" keeps only the
// content subtree under message; "type" keeps the whole top-level type field.
// Missing paths are silently skipped.
function pickFields(obj, paths) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const out = {};
  for (const p of paths) {
    const segs = p.split(".");
    const val = getPath(obj, segs);
    if (val === undefined) continue;
    // isSidechain/isMeta default to false; only surface them when true.
    if ((p === "isSidechain" || p === "isMeta") && val === false) continue;
    setPath(out, segs, val);
  }
  return out;
}

function getPath(obj, segs) {
  let cur = obj;
  for (const s of segs) {
    if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = cur[s];
  }
  return cur;
}

function setPath(obj, segs, val) {
  let cur = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (cur[s] == null || typeof cur[s] !== "object" || Array.isArray(cur[s])) cur[s] = {};
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = val;
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
  const fields = opts.fields || DEFAULT_FIELDS;
  const filtered = opts.full ? parsed : pickFields(parsed, fields);
  const truncated = truncateValue(filtered, opts);
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
