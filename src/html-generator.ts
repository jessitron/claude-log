// Generate an HTML webtoon page from comic panels.

import type { Panel, ToolDetail } from "./panels.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPanel(panel: Panel): string {
  switch (panel.type) {
    case "human-speech":
      return `
    <div class="panel human-speech">
      <div class="character-label">Human</div>
      <div class="speech-bubble human-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "claude-speech":
      return `
    <div class="panel claude-speech">
      <div class="character-label">Claude</div>
      <div class="speech-bubble claude-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "claude-think":
      return `
    <div class="panel claude-think">
      <div class="thought-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "action-montage": {
      const details = panel.toolDetails || [];
      const detailItems = details
        .filter((d) => d.summary)
        .map((d) => {
          const lines = d.summary.split("\n");
          const first = `<strong>${escapeHtml(d.name)}</strong> ${escapeHtml(lines[0])}`;
          const rest = lines.slice(1).map((l) => `<span class="tool-command">${escapeHtml(l)}</span>`);
          const mainContent = [first, ...rest].join("\n              ");
          if (d.output) {
            const truncatedOutput = d.output.length > 2000 ? d.output.slice(0, 2000) + "\n…" : d.output;
            return `<li>${mainContent}
              <details class="tool-output-details">
                <summary class="tool-output-toggle">output</summary>
                <pre class="tool-output">${escapeHtml(truncatedOutput)}</pre>
              </details></li>`;
          }
          return `<li>${mainContent}</li>`;
        })
        .join("\n            ");
      const summary = panel.lines.map((l) => escapeHtml(l)).join("  ");
      return `
    <div class="panel action-montage">
      <details class="montage-burst">
        <summary class="montage-summary">${summary}</summary>
        <ul class="montage-details">
            ${detailItems}
        </ul>
      </details>
    </div>`;
    }

    case "narrator":
      return `
    <div class="panel narrator">
      <div class="narrator-box">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;
  }
}

export function generateHtml(panels: Panel[], title: string): string {
  const panelHtml = panels.map(renderPanel).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="comic.css">
</head>
<body>
  <div class="comic-strip">
    <div class="comic-title">
      <h1>${escapeHtml(title)}</h1>
    </div>
${panelHtml}
    <div class="comic-end">fin.</div>
  </div>
</body>
</html>
`;
}
