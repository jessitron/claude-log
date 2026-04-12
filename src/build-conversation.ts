// Transform ParseResult into our standardized Conversation format

import type { ParseResult, ConversationRecord, ContentBlock } from "./parser.js";
import type {
  Conversation,
  ConversationMetadata,
  Turn,
  Step,
  HumanMessage,
  AssistantResponse,
  ErrorEvent,
} from "./conversation.js";

export function buildConversation(result: ParseResult): Conversation {
  const metadata = extractMetadata(result);
  const turns = extractTurns(result);

  return { metadata, turns };
}

function extractMetadata(result: ParseResult): ConversationMetadata {
  const records = result.records;

  // Get session-level info from first record with these fields
  let sessionId = "";
  let version = "";
  let cwd = "";
  let gitBranch = "";
  let model = "";

  for (const rec of records) {
    if (!sessionId && rec.raw.sessionId) sessionId = rec.raw.sessionId as string;
    if (!version && rec.raw.version) version = rec.raw.version as string;
    if (!cwd && rec.raw.cwd) cwd = rec.raw.cwd as string;
    if (!gitBranch && rec.raw.gitBranch) gitBranch = rec.raw.gitBranch as string;
    if (!model && rec.type === "assistant") {
      const msg = rec.raw.message as { model?: string } | undefined;
      if (msg?.model && msg.model !== "<synthetic>") model = msg.model;
    }
  }

  // Timestamps
  const timestamps = records
    .map((r) => r.raw.timestamp as string)
    .filter(Boolean)
    .sort();
  const startTime = timestamps[0] || "";
  const endTime = timestamps[timestamps.length - 1] || "";
  const durationMs = startTime && endTime
    ? new Date(endTime).getTime() - new Date(startTime).getTime()
    : 0;

  // Token totals
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCacheRead = 0;
  let totalCacheCreation = 0;

  for (const rec of records) {
    if (rec.type === "assistant") {
      const usage = (rec.raw.message as { usage?: Record<string, number> })?.usage;
      if (usage) {
        totalTokensIn += usage.input_tokens || 0;
        totalTokensOut += usage.output_tokens || 0;
        totalCacheRead += usage.cache_read_input_tokens || 0;
        totalCacheCreation += usage.cache_creation_input_tokens || 0;
      }
    }
  }

  return {
    sessionId,
    startTime,
    endTime,
    durationMs,
    model,
    version,
    cwd,
    gitBranch,
    totalTokensIn,
    totalTokensOut,
    totalCacheRead,
    totalCacheCreation,
  };
}

/**
 * Split records into turns. A turn starts with a non-tool-result user message
 * and includes everything until the next non-tool-result user message.
 */
function extractTurns(result: ParseResult): Turn[] {
  const records = result.records;
  const turns: Turn[] = [];

  // Find turn boundaries: each non-tool-result, non-meta user message starts a turn
  const turnStarts: number[] = [];
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (rec.type === "user" && !rec.raw.toolUseResult && !rec.raw.isMeta) {
      turnStarts.push(i);
    }
  }

  for (let t = 0; t < turnStarts.length; t++) {
    const startIdx = turnStarts[t];
    const endIdx = t + 1 < turnStarts.length ? turnStarts[t + 1] : records.length;
    const turnRecords = records.slice(startIdx, endIdx);

    if (turnRecords.length === 0) continue;

    const humanRec = turnRecords[0];
    const humanMessage = extractHumanMessage(humanRec);

    const assistantRecords = turnRecords.slice(1);
    const assistantResponse = extractAssistantResponse(assistantRecords);

    const timestamps = turnRecords
      .map((r) => r.raw.timestamp as string)
      .filter(Boolean)
      .sort();
    const startTime = timestamps[0] || "";
    const endTime = timestamps[timestamps.length - 1] || "";
    const durationMs = startTime && endTime
      ? new Date(endTime).getTime() - new Date(startTime).getTime()
      : 0;

    turns.push({
      turnNumber: t + 1,
      humanMessage,
      assistantResponse,
      startTime,
      endTime,
      durationMs,
      lineRange: [turnRecords[0].lineNumber, turnRecords[turnRecords.length - 1].lineNumber],
    });
  }

  return turns;
}

function extractHumanMessage(rec: ConversationRecord): HumanMessage {
  const msg = rec.raw.message as { content?: unknown } | undefined;
  let text = "";
  if (msg) {
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textBlock = msg.content.find((b: { type?: string }) => b.type === "text");
      if (textBlock) text = (textBlock as { text: string }).text;
    }
  }

  return {
    text,
    isToolResult: !!rec.raw.toolUseResult,
    isMeta: !!rec.raw.isMeta,
    lineNumber: rec.lineNumber,
  };
}

function extractAssistantResponse(records: ConversationRecord[]): AssistantResponse {
  const steps: Step[] = [];
  const errors: ErrorEvent[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  let cacheRead = 0;
  let cacheCreation = 0;
  let lastStopReason = "end_turn";

  // Track pending tool calls waiting for results
  const pendingToolCalls = new Map<string, { toolName: string; inputSummary: string; lineNumber: number }>();

  for (const rec of records) {
    if (rec.type === "assistant") {
      const msg = rec.raw.message as {
        content?: ContentBlock[];
        usage?: Record<string, number>;
        stop_reason?: string;
      };

      if (msg.usage) {
        tokensIn += msg.usage.input_tokens || 0;
        tokensOut += msg.usage.output_tokens || 0;
        cacheRead += msg.usage.cache_read_input_tokens || 0;
        cacheCreation += msg.usage.cache_creation_input_tokens || 0;
      }

      if (msg.stop_reason) lastStopReason = msg.stop_reason;

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "thinking") {
            const thinking = (block as { thinking: string }).thinking;
            if (thinking.length > 0) {
              steps.push({ kind: "thinking", text: thinking, lineNumber: rec.lineNumber });
            }
          } else if (block.type === "text") {
            const text = (block as { text: string }).text;
            if (text.trim().length > 0) {
              steps.push({ kind: "text", text, lineNumber: rec.lineNumber });
            }
          } else if (block.type === "tool_use") {
            const toolBlock = block as { id: string; name: string; input: unknown };
            const inputSummary = summarizeToolInput(toolBlock.name, toolBlock.input);
            pendingToolCalls.set(toolBlock.id, {
              toolName: toolBlock.name,
              inputSummary,
              lineNumber: rec.lineNumber,
            });
          }
        }
      }
    } else if (rec.type === "user" && rec.raw.toolUseResult) {
      // This is a tool result — match it to its pending tool call
      const sourceId = rec.raw.sourceToolAssistantUUID as string | undefined;
      // Try to match by looking at the content for tool_result blocks
      const msg = rec.raw.message as { content?: Array<{ type: string; tool_use_id?: string; content?: unknown }> };
      if (Array.isArray(msg?.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_result" && block.tool_use_id) {
            const pending = pendingToolCalls.get(block.tool_use_id);
            if (pending) {
              const outputSummary = summarizeToolOutput(pending.toolName, block.content);

              if (pending.toolName === "Agent") {
                steps.push({
                  kind: "agent",
                  description: pending.inputSummary,
                  steps: [], // We don't have agent sub-steps in the main log
                  lineNumber: pending.lineNumber,
                  resultLineNumber: rec.lineNumber,
                });
              } else {
                steps.push({
                  kind: "tool_call",
                  toolName: pending.toolName,
                  inputSummary: pending.inputSummary,
                  outputSummary,
                  success: !isErrorResult(block.content),
                  lineNumber: pending.lineNumber,
                  resultLineNumber: rec.lineNumber,
                });
              }
              pendingToolCalls.delete(block.tool_use_id);
            }
          }
        }
      }
    } else if (rec.type === "system") {
      const subtype = rec.raw.subtype as string;
      if (subtype === "api_error") {
        const rawContent = rec.raw.content ?? rec.raw.error ?? "API error";
        const message = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);
        errors.push({
          message,
          lineNumber: rec.lineNumber,
          isRetry: !!rec.raw.retryAttempt,
        });
      }
    }
  }

  // Any pending tool calls that never got results
  for (const [id, pending] of pendingToolCalls) {
    steps.push({
      kind: "tool_call",
      toolName: pending.toolName,
      inputSummary: pending.inputSummary,
      outputSummary: "(no result recorded)",
      success: false,
      lineNumber: pending.lineNumber,
      resultLineNumber: -1,
    });
  }

  return {
    steps,
    tokensIn,
    tokensOut,
    cacheRead,
    cacheCreation,
    stopReason: lastStopReason,
    errors,
  };
}

function summarizeToolInput(toolName: string, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;

  switch (toolName) {
    case "Read":
      return obj.file_path as string || "";
    case "Write":
      return obj.file_path as string || "";
    case "Edit":
      return obj.file_path as string || "";
    case "Glob":
      return `${obj.pattern || ""}${obj.path ? ` in ${obj.path}` : ""}`;
    case "Grep":
      return `/${obj.pattern || ""}/${obj.path ? ` in ${obj.path}` : ""}`;
    case "Bash":
      return truncate(obj.command as string || "", 120);
    case "Agent": {
      const desc = obj.description as string || "";
      const prompt = obj.prompt as string || "";
      return desc || truncate(prompt, 80);
    }
    default:
      return truncate(JSON.stringify(input), 80);
  }
}

function summarizeToolOutput(toolName: string, content: unknown): string {
  if (typeof content === "string") {
    return truncate(content, 200);
  }
  if (Array.isArray(content)) {
    // Look for text blocks in tool result
    const textBlocks = content.filter((b: { type?: string }) => b?.type === "text");
    if (textBlocks.length > 0) {
      const combined = textBlocks.map((b: { text?: string }) => b.text || "").join("\n");
      return truncate(combined, 200);
    }
    return `[${content.length} blocks]`;
  }
  if (content && typeof content === "object") {
    return truncate(JSON.stringify(content), 200);
  }
  return "";
}

function isErrorResult(content: unknown): boolean {
  if (typeof content === "string") {
    return content.includes("Error") || content.includes("error") || content.includes("ENOENT");
  }
  if (Array.isArray(content)) {
    return content.some((b) => isErrorResult(b?.text || b?.content));
  }
  return false;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}
