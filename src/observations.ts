// Schema observations: what surprised us during parsing

export interface SchemaObservation {
  kind:
    | "unknown_record_type"
    | "unknown_field"
    | "missing_expected_field"
    | "unknown_content_block_type"
    | "unknown_message_field"
    | "unknown_usage_field"
    | "unexpected_value";
  recordType: string;
  detail: string;
  count: number;
  exampleLineNumbers: number[]; // first few line numbers where we saw this
}

export class ObservationCollector {
  private observations = new Map<string, SchemaObservation>();

  record(
    kind: SchemaObservation["kind"],
    recordType: string,
    detail: string,
    lineNumber: number
  ): void {
    const key = `${kind}:${recordType}:${detail}`;
    const existing = this.observations.get(key);
    if (existing) {
      existing.count++;
      if (existing.exampleLineNumbers.length < 3) {
        existing.exampleLineNumbers.push(lineNumber);
      }
    } else {
      this.observations.set(key, {
        kind,
        recordType,
        detail,
        count: 1,
        exampleLineNumbers: [lineNumber],
      });
    }
  }

  getAll(): SchemaObservation[] {
    return Array.from(this.observations.values()).sort((a, b) => {
      // Sort by kind, then by count descending
      if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
      return b.count - a.count;
    });
  }

  isEmpty(): boolean {
    return this.observations.size === 0;
  }

  summary(): string {
    const obs = this.getAll();
    if (obs.length === 0) return "No schema observations. Everything matched expectations.";

    const lines: string[] = [`${obs.length} schema observation(s):\n`];

    // Group by kind
    let currentKind = "";
    for (const o of obs) {
      if (o.kind !== currentKind) {
        currentKind = o.kind;
        lines.push(`  ${formatKind(o.kind)}:`);
      }
      const where =
        o.exampleLineNumbers.length < o.count
          ? `lines ${o.exampleLineNumbers.join(", ")}... (and ${o.count - o.exampleLineNumbers.length} more)`
          : `line${o.count > 1 ? "s" : ""} ${o.exampleLineNumbers.join(", ")}`;
      lines.push(`    - [${o.recordType}] ${o.detail} (${o.count}x, ${where})`);
    }
    return lines.join("\n");
  }
}

function formatKind(kind: SchemaObservation["kind"]): string {
  switch (kind) {
    case "unknown_record_type":
      return "Unknown record types (we don't know what these are yet)";
    case "unknown_field":
      return "Unknown fields (present in records but not in our schema)";
    case "missing_expected_field":
      return "Missing expected fields (in our schema but absent from records)";
    case "unknown_content_block_type":
      return "Unknown content block types (in message.content arrays)";
    case "unknown_message_field":
      return "Unknown message fields (in message objects)";
    case "unknown_usage_field":
      return "Unknown usage fields (in message.usage objects)";
    case "unexpected_value":
      return "Unexpected values";
  }
}
