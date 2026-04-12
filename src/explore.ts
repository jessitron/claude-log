// Explore conversation structure: turns, tool calls, parent/child tree
import { parseConversationLog, type ConversationRecord, type ContentBlock } from "./parser.js";

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npx ts-node src/explore.ts <path-to-jsonl>");
    process.exit(1);
  }

  const result = await parseConversationLog(filePath);

  console.log(`=== Conversation Exploration: ${filePath} ===\n`);
  console.log(`Total records: ${result.records.length}`);
  console.log();

  // Build uuid -> record map and track parent/child relationships
  const byUuid = new Map<string, ConversationRecord>();
  const children = new Map<string, string[]>(); // parentUuid -> [childUuids]
  const roots: string[] = [];

  for (const rec of result.records) {
    const uuid = rec.raw.uuid as string | undefined;
    const parentUuid = rec.raw.parentUuid as string | undefined | null;

    if (uuid) {
      byUuid.set(uuid, rec);
    }

    if (uuid && (!parentUuid || parentUuid === "")) {
      roots.push(uuid);
    } else if (uuid && parentUuid) {
      const siblings = children.get(parentUuid) || [];
      siblings.push(uuid);
      children.set(parentUuid, siblings);
    }
  }

  console.log(`Records with uuid: ${byUuid.size}`);
  console.log(`Root records (no parent): ${roots.length}`);
  console.log(`Records with parentUuid: ${[...children.values()].reduce((sum, c) => sum + c.length, 0)}`);
  console.log();

  // Show the conversation flow as a tree
  console.log("=== Conversation Flow ===\n");

  for (const rootUuid of roots) {
    printTree(rootUuid, byUuid, children, 0);
  }

  // Show unique tool names used
  console.log("\n=== Tool Calls ===\n");
  const toolCalls = new Map<string, number>();
  for (const rec of result.records) {
    if (rec.type === "assistant" && rec.raw.message) {
      const msg = rec.raw.message as { content?: ContentBlock[] };
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use") {
            const name = (block as { name: string }).name;
            toolCalls.set(name, (toolCalls.get(name) || 0) + 1);
          }
        }
      }
    }
  }
  for (const [name, count] of [...toolCalls.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }

  // Show system record subtypes
  console.log("\n=== System Record Subtypes ===\n");
  const subtypes = new Map<string, number>();
  for (const rec of result.records) {
    if (rec.type === "system") {
      const subtype = (rec.raw.subtype as string) || "(none)";
      subtypes.set(subtype, (subtypes.get(subtype) || 0) + 1);
    }
  }
  for (const [subtype, count] of [...subtypes.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${subtype}: ${count}`);
  }

  // Show isSidechain usage
  console.log("\n=== Sidechain Records ===\n");
  let sidechainCount = 0;
  for (const rec of result.records) {
    if (rec.raw.isSidechain) {
      sidechainCount++;
    }
  }
  console.log(`  Sidechain records: ${sidechainCount} of ${result.records.length}`);

  // Show user message content types (string vs array)
  console.log("\n=== User Message Content Shapes ===\n");
  let userStringContent = 0;
  let userArrayContent = 0;
  let userToolResults = 0;
  for (const rec of result.records) {
    if (rec.type === "user" && rec.raw.message) {
      const msg = rec.raw.message as { content?: unknown };
      if (typeof msg.content === "string") userStringContent++;
      else if (Array.isArray(msg.content)) userArrayContent++;
      if (rec.raw.toolUseResult !== undefined) userToolResults++;
    }
  }
  console.log(`  String content: ${userStringContent}`);
  console.log(`  Array content: ${userArrayContent}`);
  console.log(`  Tool use results: ${userToolResults}`);

  // Show the first few user messages to understand the conversation topic
  console.log("\n=== Human Messages (first text from each) ===\n");
  let humanCount = 0;
  for (const rec of result.records) {
    if (rec.type === "user" && !rec.raw.toolUseResult && !rec.raw.isMeta) {
      const msg = rec.raw.message as { content?: unknown };
      let text = "";
      if (typeof msg.content === "string") {
        text = msg.content;
      } else if (Array.isArray(msg.content)) {
        const textBlock = msg.content.find((b: { type?: string }) => b.type === "text");
        if (textBlock) text = (textBlock as { text: string }).text;
      }
      if (text) {
        humanCount++;
        const preview = text.slice(0, 120).replace(/\n/g, "\\n");
        console.log(`  [line ${rec.lineNumber}] ${preview}${text.length > 120 ? "..." : ""}`);
      }
    }
  }
  console.log(`\n  Total human messages: ${humanCount}`);

  // Show model info
  console.log("\n=== Models Used ===\n");
  const models = new Map<string, number>();
  for (const rec of result.records) {
    if (rec.type === "assistant" && rec.raw.message) {
      const msg = rec.raw.message as { model?: string };
      if (msg.model) {
        models.set(msg.model, (models.get(msg.model) || 0) + 1);
      }
    }
  }
  for (const [model, count] of [...models.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${model}: ${count}`);
  }

  // Show timestamp range
  console.log("\n=== Time Range ===\n");
  const timestamps = result.records
    .map(r => r.raw.timestamp as string)
    .filter(Boolean)
    .sort();
  if (timestamps.length > 0) {
    console.log(`  First: ${timestamps[0]}`);
    console.log(`  Last: ${timestamps[timestamps.length - 1]}`);
    const startMs = new Date(timestamps[0]).getTime();
    const endMs = new Date(timestamps[timestamps.length - 1]).getTime();
    const durationMin = ((endMs - startMs) / 1000 / 60).toFixed(1);
    console.log(`  Duration: ${durationMin} minutes`);
  }
}

function printTree(
  uuid: string,
  byUuid: Map<string, ConversationRecord>,
  children: Map<string, string[]>,
  depth: number
) {
  const rec = byUuid.get(uuid);
  if (!rec) return;

  const indent = "  ".repeat(depth);
  const label = describeRecord(rec);
  console.log(`${indent}${label}`);

  const kids = children.get(uuid) || [];
  for (const childUuid of kids) {
    printTree(childUuid, byUuid, children, depth + 1);
  }
}

function describeRecord(rec: ConversationRecord): string {
  const sidechain = rec.raw.isSidechain ? " [sidechain]" : "";
  const line = `L${rec.lineNumber}`;

  switch (rec.type) {
    case "user": {
      if (rec.raw.toolUseResult) {
        return `${line} USER-TOOL-RESULT${sidechain}`;
      }
      const msg = rec.raw.message as { content?: unknown } | undefined;
      if (!msg) return `${line} USER (no message)${sidechain}`;
      let preview = "";
      if (typeof msg.content === "string") {
        preview = msg.content.slice(0, 80).replace(/\n/g, "\\n");
      } else if (Array.isArray(msg.content)) {
        const textBlock = msg.content.find((b: { type?: string }) => b.type === "text");
        if (textBlock) preview = (textBlock as { text: string }).text.slice(0, 80).replace(/\n/g, "\\n");
        else preview = `[${msg.content.length} blocks]`;
      }
      return `${line} USER: ${preview}${sidechain}`;
    }
    case "assistant": {
      const msg = rec.raw.message as { content?: ContentBlock[]; stop_reason?: string } | undefined;
      if (!msg || !Array.isArray(msg.content)) return `${line} ASSISTANT (no content)${sidechain}`;

      const parts: string[] = [];
      for (const block of msg.content) {
        if (block.type === "text") {
          const text = (block as { text: string }).text;
          parts.push(`text(${text.length}ch)`);
        } else if (block.type === "tool_use") {
          parts.push(`tool:${(block as { name: string }).name}`);
        } else if (block.type === "thinking") {
          const thinking = (block as { thinking: string }).thinking;
          parts.push(`thinking(${thinking.length}ch)`);
        } else {
          parts.push(block.type);
        }
      }
      const stop = msg.stop_reason ? ` [${msg.stop_reason}]` : "";
      return `${line} ASSISTANT: ${parts.join(" + ")}${stop}${sidechain}`;
    }
    case "system": {
      const subtype = rec.raw.subtype as string || "";
      const content = rec.raw.content as string || "";
      const preview = content.slice(0, 60).replace(/\n/g, "\\n");
      return `${line} SYSTEM(${subtype}): ${preview}${sidechain}`;
    }
    default:
      return `${line} ${rec.type.toUpperCase()}${sidechain}`;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
