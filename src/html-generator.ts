// Generate an HTML webtoon page from comic panels.

import type { Panel } from "./panels.js";

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
      const tools = panel.lines.map((l) => `<span class="tool-badge">${escapeHtml(l)}</span>`);
      return `
    <div class="panel action-montage">
      <div class="montage-burst">
        ${tools.join("\n        ")}
      </div>
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
