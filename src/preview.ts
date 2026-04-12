import { parseConversationLog, type ConversationRecord, type ContentBlock } from "./parser.js";

function truncate(text: string, maxLen: number): string {
  const oneLine = text.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 3) + "...";
}

function getUserText(record: ConversationRecord): string {
  const msg = record.raw.message as { content?: unknown };
  if (!msg?.content) return "(no content)";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    const texts = msg.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text);
    return texts.join(" ") || "(non-text content)";
  }
  return "(unknown content shape)";
}

function describeContentBlocks(record: ConversationRecord): string[] {
  const msg = record.raw.message as { content?: ContentBlock[]; model?: string };
  const lines: string[] = [];
  if (msg?.model) {
    lines.push(`  model: ${msg.model}`);
  }
  if (!msg?.content || !Array.isArray(msg.content)) {
    lines.push("  (no content blocks)");
    return lines;
  }
  for (const block of msg.content) {
    switch (block.type) {
      case "thinking":
        lines.push(`  💭 thinking (${(block as any).thinking?.length || 0} chars)`);
        break;
      case "text":
        lines.push(`  💬 text: ${truncate((block as any).text || "", 100)}`);
        break;
      case "tool_use":
        lines.push(`  🔧 tool_use: ${(block as any).name}`);
        break;
      case "tool_result":
        lines.push(`  📋 tool_result`);
        break;
      default:
        lines.push(`  ❓ ${block.type}`);
    }
  }
  return lines;
}

function describeSystem(record: ConversationRecord): string {
  const parts: string[] = [];
  if (record.raw.subtype) parts.push(`subtype=${record.raw.subtype}`);
  if (record.raw.level) parts.push(`level=${record.raw.level}`);
  if (record.raw.content) parts.push(truncate(String(record.raw.content), 80));
  return parts.join(" | ") || "(empty system record)";
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run preview -- <path-to-jsonl>");
    process.exit(1);
  }

  console.log(`Preview: ${filePath}\n`);

  const result = await parseConversationLog(filePath);

  // Show record-by-record summary
  for (const record of result.records) {
    const line = `L${record.lineNumber}`;
    switch (record.type) {
      case "user": {
        const text = getUserText(record);
        const isMeta = record.raw.isMeta ? " [meta]" : "";
        const isToolResult = record.raw.toolUseResult ? " [tool-result]" : "";
        console.log(`${line} 👤 USER${isMeta}${isToolResult}: ${truncate(text, 120)}`);
        break;
      }
      case "assistant": {
        console.log(`${line} 🤖 ASSISTANT:`);
        for (const desc of describeContentBlocks(record)) {
          console.log(desc);
        }
        break;
      }
      case "system": {
        console.log(`${line} ⚙️  SYSTEM: ${describeSystem(record)}`);
        break;
      }
      case "progress": {
        // these are noisy, just count them
        console.log(`${line} ⏳ PROGRESS: toolUseID=${record.raw.toolUseID || "?"}`);
        break;
      }
      default: {
        console.log(`${line} ❓ ${record.type}`);
        break;
      }
    }
  }

  // Summary at the end
  console.log(`\n=== Summary ===`);
  console.log(`Total records: ${result.records.length}`);
  for (const [type, count] of Object.entries(result.stats.byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
