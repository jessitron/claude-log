// Show a conversation in human-readable form
import { parseConversationLog } from "./parser.js";
import { buildConversation } from "./build-conversation.js";
import type { Conversation, Turn, Step } from "./conversation.js";

async function main() {
  const filePath = process.argv[2];
  const outputFormat = process.argv[3] || "summary"; // "summary" or "json"

  if (!filePath) {
    console.error("Usage: npm run show -- <path-to-jsonl> [summary|json]");
    process.exit(1);
  }

  const result = await parseConversationLog(filePath);
  const conversation = buildConversation(result);

  if (outputFormat === "json") {
    console.log(JSON.stringify(conversation, null, 2));
  } else {
    showSummary(conversation);
  }

  // Also show schema observations if any
  if (!result.observations.isEmpty()) {
    console.log(`\n${"=".repeat(60)}`);
    console.log("Schema Observations:");
    console.log(result.observations.summary());
  }
}

function showSummary(conv: Conversation) {
  const m = conv.metadata;
  console.log("=".repeat(60));
  console.log(`SESSION: ${m.sessionId}`);
  console.log(`Model: ${m.model}  |  Version: ${m.version}`);
  console.log(`Working dir: ${m.cwd}  |  Branch: ${m.gitBranch}`);
  console.log(`Time: ${formatTime(m.startTime)} → ${formatTime(m.endTime)} (${formatDuration(m.durationMs)})`);
  console.log(`Tokens: ${formatNumber(m.totalTokensIn)} in, ${formatNumber(m.totalTokensOut)} out, ${formatNumber(m.totalCacheRead)} cache-read`);
  console.log(`Turns: ${conv.turns.length}`);
  console.log("=".repeat(60));

  for (const turn of conv.turns) {
    showTurn(turn);
  }
}

function showTurn(turn: Turn) {
  console.log();
  console.log(`── Turn ${turn.turnNumber} (${formatDuration(turn.durationMs)}) ${"─".repeat(40)}`);
  console.log();

  // Human message
  const humanText = turn.humanMessage.text;
  if (humanText.length > 200) {
    console.log(`  HUMAN: ${humanText.slice(0, 200)}...`);
  } else {
    console.log(`  HUMAN: ${humanText}`);
  }
  console.log();

  // Assistant steps
  const resp = turn.assistantResponse;

  for (const step of resp.steps) {
    showStep(step, 2);
  }

  // Errors
  if (resp.errors.length > 0) {
    console.log(`  ⚠ ${resp.errors.length} error(s):`);
    for (const err of resp.errors) {
      console.log(`    - ${err.message.slice(0, 100)}${err.isRetry ? " (retry)" : ""}`);
    }
  }

  // Token summary for this turn
  if (resp.tokensIn > 0 || resp.tokensOut > 0) {
    console.log(`  [${formatNumber(resp.tokensIn)} in, ${formatNumber(resp.tokensOut)} out | stop: ${resp.stopReason}]`);
  }
}

function showStep(step: Step, indent: number) {
  const pad = " ".repeat(indent);
  switch (step.kind) {
    case "thinking":
      console.log(`${pad}(thinking ${step.text.length} chars)`);
      break;
    case "text": {
      const lines = step.text.split("\n");
      const preview = lines[0].slice(0, 100);
      if (lines.length > 1 || lines[0].length > 100) {
        console.log(`${pad}💬 ${preview}... (${step.text.length} chars)`);
      } else {
        console.log(`${pad}💬 ${preview}`);
      }
      break;
    }
    case "tool_call":
      console.log(`${pad}🔧 ${step.toolName}: ${step.inputSummary}`);
      if (step.outputSummary && step.outputSummary.length > 0) {
        const outPreview = step.outputSummary.slice(0, 80).replace(/\n/g, "\\n");
        console.log(`${pad}   → ${outPreview}${step.outputSummary.length > 80 ? "..." : ""}`);
      }
      break;
    case "agent":
      console.log(`${pad}🤖 Agent: ${step.description}`);
      for (const s of step.steps) {
        showStep(s, indent + 2);
      }
      break;
  }
}

function formatTime(iso: string): string {
  if (!iso) return "?";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
