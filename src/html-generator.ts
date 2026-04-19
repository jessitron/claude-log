// Generate an HTML webtoon page from comic panels.

import type { Panel, ToolDetail } from "./panels.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sourceTag(panel: Panel): string {
  const lines = panel.lineNumbers.join(",");
  const file = panel.sourceFile || "";
  const ref = file ? `${file}:L${lines}` : `L${lines}`;
  const title = file ? `${file} line(s): ${lines}` : `JSONL line(s): ${lines}`;
  return `<span class="source-tag" title="${escapeHtml(title)}">${escapeHtml(ref)}</span>`;
}

function tokenBadge(tokens: number | undefined): string {
  if (tokens === undefined) return "";
  const label = `${tokens.toLocaleString()} in`;
  const title = `${tokens.toLocaleString()} total input tokens sent on this turn`;
  return `<span class="token-badge" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function panelAttrs(panel: Panel, index: number): string {
  const file = panel.sourceFile ? ` data-source-file="${escapeHtml(panel.sourceFile)}"` : "";
  return `data-panel="${index}" data-source-lines="${panel.lineNumbers.join(",")}"${file}`;
}

function renderPanel(panel: Panel, index: number): string {
  const attrs = panelAttrs(panel, index);
  const tag = sourceTag(panel);
  switch (panel.type) {
    case "human-speech":
      return `
    <div class="panel human-speech" ${attrs}>
      ${tag}
      <div class="character-label">Human</div>
      <div class="speech-bubble human-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "claude-speech":
      return `
    <div class="panel claude-speech" ${attrs}>
      ${tag}
      ${tokenBadge(panel.totalInputTokens)}
      <div class="character-label">Claude</div>
      <div class="speech-bubble claude-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "claude-think":
      return `
    <div class="panel claude-think" ${attrs}>
      ${tag}
      ${tokenBadge(panel.totalInputTokens)}
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
          const badge = tokenBadge(d.totalInputTokens);
          const first = `<strong>${escapeHtml(d.name)}</strong> ${escapeHtml(lines[0])}${badge ? " " + badge : ""}`;
          const rest = lines.slice(1).map((l) => `<span class="tool-command">${escapeHtml(l)}</span>`);
          const mainContent = [first, ...rest].join("\n              ");

          let extras = "";

          // Subagent comic
          if (d.subpanels && d.subpanels.length > 0) {
            const subHtml = d.subpanels.map((sp, si) => renderPanel(sp, si)).join("\n");
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
    <div class="panel action-montage" ${attrs}>
      ${tag}
      <details class="montage-burst">
        <summary class="montage-summary">${summary}</summary>
        <ul class="montage-details">
            ${detailItems}
        </ul>
      </details>
    </div>`;
    }

    case "notification":
      return `
    <div class="panel notification" ${attrs}>
      ${tag}
      <div class="notification-box">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "narrator":
      return `
    <div class="panel narrator" ${attrs}>
      ${tag}
      <div class="narrator-box">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
    </div>`;
  }
}

export function generateHtml(panels: Panel[], title: string): string {
  const panelHtml = panels.map((p, i) => renderPanel(p, i)).join("\n");

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
        <button id="toggle-refs" class="toggle-btn" title="Hotkey: r">Show refs <kbd>r</kbd></button>
        <button id="toggle-tokens" class="toggle-btn" title="Hotkey: t">Show tokens <kbd>t</kbd></button>
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

    function hotkeyToggle(buttonId, bodyClass, hotkey, showText, hideText) {
      const btn = document.getElementById(buttonId);
      function toggle() {
        const on = document.body.classList.toggle(bodyClass);
        btn.innerHTML = (on ? hideText : showText) + ' <kbd>' + hotkey + '</kbd>';
      }
      btn.addEventListener('click', toggle);
      document.addEventListener('keydown', function(e) {
        if (e.key !== hotkey || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        e.preventDefault();
        toggle();
      });
    }
    hotkeyToggle('toggle-refs', 'show-refs', 'r', 'Show refs', 'Hide refs');
    hotkeyToggle('toggle-tokens', 'show-tokens', 't', 'Show tokens', 'Hide tokens');

    document.addEventListener('click', function(e) {
      const tag = e.target.closest('.source-tag');
      if (!tag) return;
      e.preventDefault();
      e.stopPropagation();
      const text = tag.textContent;
      navigator.clipboard.writeText(text).then(function() {
        const original = tag.textContent;
        tag.textContent = 'copied!';
        tag.classList.add('copied');
        setTimeout(function() {
          tag.textContent = original;
          tag.classList.remove('copied');
        }, 900);
      });
    });
  </script>
</body>
</html>
`;
}
