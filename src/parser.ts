import * as fs from "node:fs";
import * as readline from "node:readline";
import { ObservationCollector } from "./observations.js";
import {
  KNOWN_RECORD_TYPES,
  KNOWN_FIELDS,
  KNOWN_MESSAGE_FIELDS,
  KNOWN_CONTENT_BLOCK_TYPES,
  KNOWN_USAGE_FIELDS,
  type KnownRecordType,
} from "./schema.js";

// Parsed record types

export interface ConversationRecord {
  type: string;
  lineNumber: number;
  raw: Record<string, unknown>;
}

export interface UserRecord extends ConversationRecord {
  type: "user";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  message: {
    role: "user";
    content: unknown; // string or array of content blocks
  };
  isMeta?: boolean;
  toolUseResult?: unknown;
}

export interface AssistantRecord extends ConversationRecord {
  type: "assistant";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  sessionId: string;
  message: {
    role: "assistant";
    content: ContentBlock[];
    model?: string;
    usage?: Record<string, unknown>;
    stop_reason?: string;
  };
}

export interface SystemRecord extends ConversationRecord {
  type: "system";
  uuid: string;
  parentUuid: string | null;
  timestamp: string;
  subtype?: string;
  level?: string;
  content?: string;
}

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: unknown }
  | { type: "thinking"; thinking: string }
  | { type: string; [key: string]: unknown }; // fallback for unknown types

export interface ParseResult {
  records: ConversationRecord[];
  observations: ObservationCollector;
  stats: {
    totalLines: number;
    byType: Record<string, number>;
    parseErrors: number;
  };
}

export async function parseConversationLog(
  filePath: string
): Promise<ParseResult> {
  const observations = new ObservationCollector();
  const records: ConversationRecord[] = [];
  const byType: Record<string, number> = {};
  let totalLines = 0;
  let parseErrors = 0;

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    totalLines++;
    if (line.trim() === "") continue;

    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line);
    } catch {
      parseErrors++;
      observations.record(
        "unexpected_value",
        "PARSE_ERROR",
        `Line is not valid JSON`,
        totalLines
      );
      continue;
    }

    const recordType = raw.type as string;
    if (!recordType) {
      observations.record(
        "unexpected_value",
        "UNKNOWN",
        `Record has no 'type' field. Keys: ${Object.keys(raw).join(", ")}`,
        totalLines
      );
      continue;
    }

    byType[recordType] = (byType[recordType] || 0) + 1;

    // Check if this is a known record type
    if (!KNOWN_RECORD_TYPES.includes(recordType as KnownRecordType)) {
      observations.record(
        "unknown_record_type",
        recordType,
        `Record type "${recordType}" is not in our schema`,
        totalLines
      );
    }

    // Check fields against our schema
    checkFields(raw, recordType, totalLines, observations);

    // Check message internals for user/assistant records
    if (
      (recordType === "user" || recordType === "assistant") &&
      raw.message &&
      typeof raw.message === "object"
    ) {
      checkMessage(
        raw.message as Record<string, unknown>,
        recordType,
        totalLines,
        observations
      );
    }

    const record: ConversationRecord = {
      type: recordType,
      lineNumber: totalLines,
      raw,
    };

    records.push(record);
  }

  return {
    records,
    observations,
    stats: { totalLines, byType, parseErrors },
  };
}

function checkFields(
  raw: Record<string, unknown>,
  recordType: string,
  lineNumber: number,
  observations: ObservationCollector
): void {
  const knownFields = KNOWN_FIELDS[recordType];
  if (!knownFields) return; // unknown record type, already reported

  const actualFields = Object.keys(raw);

  // Fields present but not in our schema
  for (const field of actualFields) {
    if (!knownFields.includes(field)) {
      observations.record(
        "unknown_field",
        recordType,
        `field "${field}"`,
        lineNumber
      );
    }
  }

  // We don't report missing fields per-record because many fields are optional.
  // Instead, we could track which known fields we never saw across the whole file.
  // That's done at the end in the caller if needed.
}

function checkMessage(
  message: Record<string, unknown>,
  recordType: "user" | "assistant",
  lineNumber: number,
  observations: ObservationCollector
): void {
  const knownFields =
    KNOWN_MESSAGE_FIELDS[recordType as keyof typeof KNOWN_MESSAGE_FIELDS];
  if (!knownFields) return;

  for (const field of Object.keys(message)) {
    if (!(knownFields as readonly string[]).includes(field)) {
      observations.record(
        "unknown_message_field",
        recordType,
        `message field "${field}"`,
        lineNumber
      );
    }
  }

  // Check content blocks for assistant messages
  if (recordType === "assistant" && Array.isArray(message.content)) {
    for (const block of message.content) {
      if (block && typeof block === "object" && "type" in block) {
        const blockType = (block as { type: string }).type;
        if (
          !KNOWN_CONTENT_BLOCK_TYPES.includes(
            blockType as (typeof KNOWN_CONTENT_BLOCK_TYPES)[number]
          )
        ) {
          observations.record(
            "unknown_content_block_type",
            recordType,
            `content block type "${blockType}"`,
            lineNumber
          );
        }
      }
    }
  }

  // Check usage fields for assistant messages
  if (message.usage && typeof message.usage === "object") {
    for (const field of Object.keys(message.usage as object)) {
      if (
        !KNOWN_USAGE_FIELDS.includes(
          field as (typeof KNOWN_USAGE_FIELDS)[number]
        )
      ) {
        observations.record(
          "unknown_usage_field",
          recordType,
          `usage field "${field}"`,
          lineNumber
        );
      }
    }
  }
}
