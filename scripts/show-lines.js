#!/usr/bin/env node
// Show a compact summary of records in a line range of a JSONL file, so we
// can see what's between two tool_use records.

import { readFileSync } from "node:fs";

const [path, startArg, endArg] = process.argv.slice(2);
if (!path) {
  console.error("Usage: node scripts/show-lines.js <jsonl> [start] [end]");
  process.exit(1);
}
const start = parseInt(startArg ?? "1", 10);
const end = parseInt(endArg ?? String(start + 20), 10);

const lines = readFileSync(path, "utf8").trim().split("\n");
for (let i = start - 1; i < Math.min(end, lines.length); i++) {
  let r;
  try {
    r = JSON.parse(lines[i]);
  } catch {
    console.log(`line ${i + 1}: <parse error>`);
    continue;
  }
  const tag = r.type || "?";
  const msgId = r.message?.id ? ` id=${r.message.id}` : "";
  const blocks = r.message?.content;
  let blockInfo = "";
  if (Array.isArray(blocks)) {
    blockInfo = " blocks=[" + blocks.map((b) => {
      if (b.type === "tool_use") return `tool_use:${b.name}`;
      if (b.type === "text") {
        const t = (b.text || "").slice(0, 40).replace(/\n/g, " ");
        return `text:"${t}"`;
      }
      if (b.type === "thinking") return "thinking";
      if (b.type === "tool_result") return `tool_result`;
      return b.type;
    }).join(",") + "]";
  } else if (typeof blocks === "string") {
    blockInfo = ` content="${blocks.slice(0, 40).replace(/\n/g, " ")}"`;
  }
  const extra = [];
  if (r.isMeta) extra.push("isMeta");
  if (r.toolUseResult) extra.push("toolUseResult");
  if (r.subtype) extra.push(`subtype=${r.subtype}`);
  if (r.operation) extra.push(`op=${r.operation}`);
  const extraStr = extra.length ? ` [${extra.join(",")}]` : "";
  console.log(`line ${i + 1}: ${tag}${msgId}${blockInfo}${extraStr}`);
}
