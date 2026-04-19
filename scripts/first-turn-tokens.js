#!/usr/bin/env node
// Show token usage for assistant messages in order, so we can see the first-call input size
// (which reflects the system prompt + CLAUDE.md + tools + first user message).

const fs = require('fs');
const path = process.argv[2];
const limit = parseInt(process.argv[3] || '5', 10);
if (!path) { console.error('Usage: first-turn-tokens.js <jsonl> [limit]'); process.exit(1); }

const lines = fs.readFileSync(path, 'utf8').split('\n').filter(Boolean);

let seen = 0;
for (let i = 0; i < lines.length && seen < limit; i++) {
  const d = JSON.parse(lines[i]);
  const msg = d.message;
  if (d.type !== 'assistant' || !msg || !msg.usage) continue;

  const u = msg.usage;
  const total =
    (u.input_tokens || 0) +
    (u.cache_creation_input_tokens || 0) +
    (u.cache_read_input_tokens || 0);

  console.log(`\n=== line ${i + 1} assistant msg ${msg.id} ===`);
  console.log('  input_tokens             :', u.input_tokens);
  console.log('  cache_creation_input     :', u.cache_creation_input_tokens);
  console.log('  cache_read_input         :', u.cache_read_input_tokens);
  console.log('  output_tokens            :', u.output_tokens);
  console.log('  TOTAL INPUT (all sources):', total);

  // What did the assistant say? (first text block)
  const firstText = (msg.content || []).find((b) => b.type === 'text');
  if (firstText) console.log('  text preview:', firstText.text.slice(0, 120).replace(/\n/g, ' '));
  const firstTool = (msg.content || []).find((b) => b.type === 'tool_use');
  if (firstTool) console.log('  tool_use:', firstTool.name, JSON.stringify(firstTool.input).slice(0, 120));

  seen++;
}
