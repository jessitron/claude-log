#!/usr/bin/env node
// Does a single assistant message (same message.id) contain multiple tool_use
// blocks when Claude calls tools in parallel? Or does each tool get its own
// message.id? This tells us how to distinguish parallel vs sequential batches.

import { readFileSync } from "node:fs";

const path = process.argv[2] || "example/episode-8-after.jsonl";
const lines = readFileSync(path, "utf8").trim().split("\n");

const byMessageId = new Map(); // id -> [{blockTypes, lineNumber}]
for (let i = 0; i < lines.length; i++) {
  const r = JSON.parse(lines[i]);
  if (r.type !== "assistant") continue;
  const id = r.message?.id;
  if (!id) continue;
  const blocks = r.message?.content || [];
  const blockTypes = blocks.map((b) => b.type);
  if (!byMessageId.has(id)) byMessageId.set(id, []);
  byMessageId.get(id).push({ blockTypes, lineNumber: i + 1 });
}

let totalMessages = 0;
let messagesWithMultipleToolUseRecords = 0;
let messagesWithMultipleToolUseBlocksInOneRecord = 0;

for (const [id, records] of byMessageId) {
  totalMessages++;
  const toolUseRecords = records.filter((r) =>
    r.blockTypes.includes("tool_use")
  ).length;
  if (toolUseRecords > 1) messagesWithMultipleToolUseRecords++;
  const anyRecordWithMultipleToolUses = records.some(
    (r) => r.blockTypes.filter((t) => t === "tool_use").length > 1
  );
  if (anyRecordWithMultipleToolUses) messagesWithMultipleToolUseBlocksInOneRecord++;
}

console.log(`File: ${path}`);
console.log(`Unique message.ids with tool_use content: ${totalMessages}`);
console.log(`Messages spanning multiple tool_use records: ${messagesWithMultipleToolUseRecords}`);
console.log(`Messages where a record has >1 tool_use blocks: ${messagesWithMultipleToolUseBlocksInOneRecord}`);

// Print the first example of a multi-record parallel call
for (const [id, records] of byMessageId) {
  const toolUseRecords = records.filter((r) => r.blockTypes.includes("tool_use"));
  if (toolUseRecords.length > 1) {
    console.log(`\nExample parallel call (message.id=${id}):`);
    for (const r of records) {
      console.log(`  line ${r.lineNumber}: [${r.blockTypes.join(",")}]`);
    }
    break;
  }
}
