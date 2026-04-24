#!/usr/bin/env node
// Dump message.usage for a line range of a JSONL file.

import { readFileSync } from "node:fs";

const [path, startArg, endArg] = process.argv.slice(2);
const start = parseInt(startArg ?? "1", 10);
const end = parseInt(endArg ?? String(start + 20), 10);

const lines = readFileSync(path, "utf8").trim().split("\n");
for (let i = start - 1; i < Math.min(end, lines.length); i++) {
  const r = JSON.parse(lines[i]);
  if (r.type !== "assistant") {
    console.log(`line ${i + 1}: ${r.type}`);
    continue;
  }
  const blocks = r.message?.content || [];
  const types = blocks.map((b) => b.type).join(",");
  const usage = r.message?.usage;
  const msgId = r.message?.id;
  if (!usage) {
    console.log(`line ${i + 1}: assistant id=${msgId} blocks=[${types}] (no usage)`);
  } else {
    const compact = {
      input: usage.input_tokens,
      cache_creation: usage.cache_creation_input_tokens,
      cache_read: usage.cache_read_input_tokens,
      output: usage.output_tokens,
    };
    console.log(
      `line ${i + 1}: assistant id=${msgId} blocks=[${types}] usage=${JSON.stringify(compact)}`
    );
  }
}
