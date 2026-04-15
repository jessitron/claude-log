// Emit OpenTelemetry traces from a Conversation, following GenAI semantic conventions.
// Sends OTLP JSON directly to Honeycomb via HTTP.

import * as crypto from "node:crypto";
import type {
  Conversation,
  Turn,
  Step,
  ToolCallStep,
  AgentStep,
  TextStep,
  ThinkingStep,
} from "./conversation.js";

// --- OTLP JSON wire format types ---

interface OtlpSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number; // 1=INTERNAL, 3=CLIENT
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpAttribute[];
  events: OtlpEvent[];
  status: { code: number }; // 0=UNSET, 1=OK, 2=ERROR
}

interface OtlpAttribute {
  key: string;
  value:
    | { stringValue: string }
    | { intValue: string }
    | { doubleValue: number }
    | { boolValue: boolean }
    | { arrayValue: { values: Array<{ stringValue: string }> } };
}

interface OtlpEvent {
  name: string;
  timeUnixNano: string;
  attributes: OtlpAttribute[];
}

// --- Helpers ---

function genTraceId(): string {
  return crypto.randomBytes(16).toString("hex");
}

function genSpanId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function isoToNano(iso: string): string {
  const ms = new Date(iso).getTime();
  // nanoseconds as a string (OTLP uses string for uint64)
  return (BigInt(ms) * 1000000n).toString();
}

function strAttr(key: string, value: string): OtlpAttribute {
  return { key, value: { stringValue: value } };
}

function intAttr(key: string, value: number): OtlpAttribute {
  return { key, value: { intValue: String(value) } };
}

function strArrayAttr(key: string, values: string[]): OtlpAttribute {
  return {
    key,
    value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } },
  };
}

// --- Build spans from Conversation ---

export function conversationToSpans(conv: Conversation): OtlpSpan[] {
  const traceId = genTraceId();
  const spans: OtlpSpan[] = [];
  const meta = conv.metadata;

  // Root span: the whole session
  const sessionSpanId = genSpanId();
  spans.push({
    traceId,
    spanId: sessionSpanId,
    name: `invoke_agent claude-code`,
    kind: 1, // INTERNAL
    startTimeUnixNano: isoToNano(meta.startTime),
    endTimeUnixNano: isoToNano(meta.endTime),
    attributes: [
      strAttr("gen_ai.operation.name", "invoke_agent"),
      strAttr("gen_ai.provider.name", "anthropic"),
      strAttr("gen_ai.agent.name", "claude-code"),
      strAttr("gen_ai.agent.version", meta.version),
      strAttr("gen_ai.conversation.id", meta.sessionId),
      strAttr("gen_ai.request.model", meta.model),
      strAttr("gen_ai.response.model", meta.model),
      intAttr("gen_ai.usage.input_tokens", meta.totalTokensIn),
      intAttr("gen_ai.usage.output_tokens", meta.totalTokensOut),
      intAttr("gen_ai.usage.cache_read.input_tokens", meta.totalCacheRead),
      intAttr("gen_ai.usage.cache_creation.input_tokens", meta.totalCacheCreation),
      strAttr("cwd", meta.cwd),
      strAttr("git.branch", meta.gitBranch),
      intAttr("turn.count", conv.turns.length),
    ],
    events: [],
    status: { code: 1 }, // OK
  });

  // One span per turn
  for (const turn of conv.turns) {
    buildTurnSpans(traceId, sessionSpanId, turn, meta, spans);
  }

  return spans;
}

function buildTurnSpans(
  traceId: string,
  parentSpanId: string,
  turn: Turn,
  meta: Conversation["metadata"],
  spans: OtlpSpan[]
): void {
  const turnSpanId = genSpanId();
  const resp = turn.assistantResponse;

  // Compute turn time range. Use turn timestamps, but if duration is 0 or
  // times are missing, synthesize from parent.
  const startNano = isoToNano(turn.startTime);
  const endNano = isoToNano(turn.endTime || turn.startTime);

  const turnAttrs: OtlpAttribute[] = [
    strAttr("gen_ai.operation.name", "invoke_agent"),
    strAttr("gen_ai.agent.name", "claude-code"),
    strAttr("gen_ai.conversation.id", meta.sessionId),
    intAttr("turn.number", turn.turnNumber),
    strAttr("human.message", truncate(turn.humanMessage.text, 500)),
    intAttr("gen_ai.usage.input_tokens", resp.tokensIn),
    intAttr("gen_ai.usage.output_tokens", resp.tokensOut),
    intAttr("gen_ai.usage.cache_read.input_tokens", resp.cacheRead),
    intAttr("gen_ai.usage.cache_creation.input_tokens", resp.cacheCreation),
    strArrayAttr("gen_ai.response.finish_reasons", [resp.stopReason]),
  ];

  // Count steps by kind
  const toolCalls = resp.steps.filter((s) => s.kind === "tool_call") as ToolCallStep[];
  const agents = resp.steps.filter((s) => s.kind === "agent") as AgentStep[];
  const textSteps = resp.steps.filter((s) => s.kind === "text") as TextStep[];
  turnAttrs.push(intAttr("tool_call.count", toolCalls.length));
  turnAttrs.push(intAttr("agent.count", agents.length));

  // Errors as attributes on the turn span
  if (resp.errors.length > 0) {
    turnAttrs.push(intAttr("error.count", resp.errors.length));
    const errorMessages = resp.errors.map((e) => e.message).filter((m) => m && m !== "{}");
    if (errorMessages.length > 0) {
      turnAttrs.push(strAttr("error.messages", truncate(errorMessages.join("; "), 500)));
    }
    const retryCount = resp.errors.filter((e) => e.isRetry).length;
    if (retryCount > 0) {
      turnAttrs.push(intAttr("error.retry_count", retryCount));
    }
  }

  const turnEvents: OtlpEvent[] = [];

  spans.push({
    traceId,
    spanId: turnSpanId,
    parentSpanId,
    name: `turn ${turn.turnNumber}`,
    kind: 1,
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    attributes: turnAttrs,
    events: turnEvents,
    status: { code: resp.errors.length > 0 ? 2 : 1 },
  });

  // Child spans: human message, then chat, then tool calls/agents.
  // We distribute time across all child spans within the turn.
  const stepsWithSpans = resp.steps.filter(
    (s) => s.kind === "tool_call" || s.kind === "agent"
  );

  const turnStartMs = new Date(turn.startTime).getTime();
  const turnEndMs = new Date(turn.endTime || turn.startTime).getTime();
  // Slots: human message + chat + tool/agent steps
  const totalSlots = 2 + stepsWithSpans.length; // human + chat + tools
  const turnDuration = Math.max(turnEndMs - turnStartMs, totalSlots);
  const slotDuration = turnDuration / totalSlots;

  // Slot 0: human message span
  buildHumanMessageSpan(
    traceId,
    turnSpanId,
    turn,
    turnStartMs,
    turnStartMs + slotDuration * 0.8,
    spans
  );

  // Slot 1: chat span (LLM inference)
  const chatStartMs = turnStartMs + slotDuration;
  const chatEndMs = chatStartMs + slotDuration * 0.8;
  buildChatSpan(traceId, turnSpanId, turn, chatStartMs, chatEndMs, textSteps, meta, spans);

  // Remaining slots: tool calls and agent steps
  for (let i = 0; i < stepsWithSpans.length; i++) {
    const step = stepsWithSpans[i];
    const stepStartMs = turnStartMs + slotDuration * (i + 2); // offset by 2 for human + chat
    const stepEndMs = stepStartMs + slotDuration * 0.8;

    if (step.kind === "tool_call") {
      buildToolCallSpan(traceId, turnSpanId, step, stepStartMs, stepEndMs, meta, spans);
    } else if (step.kind === "agent") {
      buildAgentSpan(traceId, turnSpanId, step, stepStartMs, stepEndMs, meta, spans);
    }
  }
}

function buildHumanMessageSpan(
  traceId: string,
  parentSpanId: string,
  turn: Turn,
  startMs: number,
  endMs: number,
  spans: OtlpSpan[]
): void {
  const spanId = genSpanId();
  const text = turn.humanMessage.text;

  spans.push({
    traceId,
    spanId,
    parentSpanId,
    name: `human message`,
    kind: 1, // INTERNAL
    startTimeUnixNano: msToNano(startMs),
    endTimeUnixNano: msToNano(endMs),
    attributes: [
      strAttr("message.text", truncate(text, 1000)),
      intAttr("message.length", text.length),
    ],
    events: [],
    status: { code: 0 }, // UNSET
  });
}

function buildChatSpan(
  traceId: string,
  parentSpanId: string,
  turn: Turn,
  startMs: number,
  endMs: number,
  textSteps: TextStep[],
  meta: Conversation["metadata"],
  spans: OtlpSpan[]
): void {
  const spanId = genSpanId();
  const responseText = textSteps.map((s) => s.text).join("\n");

  spans.push({
    traceId,
    spanId,
    parentSpanId,
    name: `chat ${meta.model}`,
    kind: 3, // CLIENT — calling the remote model
    startTimeUnixNano: msToNano(startMs),
    endTimeUnixNano: msToNano(endMs),
    attributes: [
      strAttr("gen_ai.operation.name", "chat"),
      strAttr("gen_ai.provider.name", "anthropic"),
      strAttr("gen_ai.request.model", meta.model),
      strAttr("gen_ai.response.model", meta.model),
      intAttr("gen_ai.usage.input_tokens", turn.assistantResponse.tokensIn),
      intAttr("gen_ai.usage.output_tokens", turn.assistantResponse.tokensOut),
      strAttr("gen_ai.output.text", truncate(responseText, 1000)),
    ],
    events: [],
    status: { code: 1 },
  });
}

function buildToolCallSpan(
  traceId: string,
  parentSpanId: string,
  step: ToolCallStep,
  startMs: number,
  endMs: number,
  meta: Conversation["metadata"],
  spans: OtlpSpan[]
): void {
  const spanId = genSpanId();

  spans.push({
    traceId,
    spanId,
    parentSpanId,
    name: `execute_tool ${step.toolName}`,
    kind: 1, // INTERNAL
    startTimeUnixNano: msToNano(startMs),
    endTimeUnixNano: msToNano(endMs),
    attributes: [
      strAttr("gen_ai.operation.name", "execute_tool"),
      strAttr("gen_ai.tool.name", step.toolName),
      strAttr("gen_ai.tool.call.arguments", truncate(step.inputSummary, 500)),
      strAttr("gen_ai.tool.call.result", truncate(step.outputSummary, 500)),
    ],
    events: [],
    status: { code: step.success ? 1 : 2 },
  });
}

function buildAgentSpan(
  traceId: string,
  parentSpanId: string,
  step: AgentStep,
  startMs: number,
  endMs: number,
  meta: Conversation["metadata"],
  spans: OtlpSpan[]
): void {
  const spanId = genSpanId();

  spans.push({
    traceId,
    spanId,
    parentSpanId,
    name: `invoke_agent ${step.description}`,
    kind: 1,
    startTimeUnixNano: msToNano(startMs),
    endTimeUnixNano: msToNano(endMs),
    attributes: [
      strAttr("gen_ai.operation.name", "invoke_agent"),
      strAttr("gen_ai.agent.name", step.description),
      strAttr("gen_ai.provider.name", "anthropic"),
    ],
    events: [],
    status: { code: 1 },
  });
}

function msToNano(ms: number): string {
  return (BigInt(Math.round(ms)) * 1000000n).toString();
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + "...";
}

// --- Send to Honeycomb ---

export async function sendToHoneycomb(
  spans: OtlpSpan[],
  apiKey: string,
  dataset: string
): Promise<void> {
  const body = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            strAttr("service.name", dataset),
          ],
        },
        scopeSpans: [
          {
            scope: { name: "claude-log", version: "1.0.0" },
            spans,
          },
        ],
      },
    ],
  };

  const response = await fetch("https://api.honeycomb.io/v1/traces", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Honeycomb-Team": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Honeycomb rejected traces: ${response.status} ${text}`);
  }

  console.log(`Sent ${spans.length} spans to Honeycomb dataset "${dataset}"`);
}
