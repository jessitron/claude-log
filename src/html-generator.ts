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

          let extras = "";

          // Subagent comic
          if (d.subpanels && d.subpanels.length > 0) {
            const subHtml = d.subpanels.map(renderPanel).join("\n");
            const label = d.agentType || "Agent";
            extras += `
              <details class="subagent-details">
                <summary class="subagent-toggle">${escapeHtml(label)} subcomic (${d.subpanels.length} panels)</summary>
                <div class="subagent-comic">
                  ${subHtml}
                </div>
              </details>`;
          }

          // Tool output
          if (d.output) {
            const truncatedOutput = d.output.length > 2000 ? d.output.slice(0, 2000) + "\n…" : d.output;
            extras += `
              <details class="tool-output-details">
                <summary class="tool-output-toggle">output</summary>
                <pre class="tool-output">${escapeHtml(truncatedOutput)}</pre>
              </details>`;
          }

          return `<li>${mainContent}${extras}</li>`;
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
      <div class="toggle-bar">
        <button id="toggle-actions" class="toggle-btn">Show all actions</button>
        <button id="toggle-outputs" class="toggle-btn">Show all outputs</button>
      </div>
    </div>
${panelHtml}
    <div class="comic-end">fin.</div>
  </div>
  <script>
    function makeToggle(buttonId, selector, showText, hideText) {
      const btn = document.getElementById(buttonId);
      let expanded = false;
      btn.addEventListener('click', function() {
        expanded = !expanded;
        btn.textContent = expanded ? hideText : showText;
        document.querySelectorAll(selector).forEach(function(el) {
          el.open = expanded;
        });
      });
    }
    makeToggle('toggle-actions', 'details.montage-burst', 'Show all actions', 'Hide all actions');
    makeToggle('toggle-outputs', 'details.tool-output-details', 'Show all outputs', 'Hide all outputs');
  </script>
</body>
</html>
`;
}
