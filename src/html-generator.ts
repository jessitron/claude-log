// Generate an HTML webtoon page from comic panels.

import type { Panel, ToolDetail, ConversationTotals } from "./panels.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape HTML, then promote **bold** to <strong>bold</strong>.
// Safe because ** survives escapeHtml unchanged, and the replacement only
// injects our own tags.
function escapeHtmlWithBold(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function sourceTag(panel: Panel): string {
  const lines = panel.lineNumbers.join(",");
  const file = panel.sourceFile || "";
  const ref = file ? `${file}:L${lines}` : `L${lines}`;
  const title = file ? `${file} line(s): ${lines}` : `JSONL line(s): ${lines}`;
  return `<span class="source-tag" title="${escapeHtml(title)}">${escapeHtml(ref)}</span>`;
}

function tokenBadge(inputTokens: number | undefined, outputTokens: number | undefined): string {
  if (inputTokens === undefined && outputTokens === undefined) return "";
  const parts: string[] = [];
  if (inputTokens !== undefined) parts.push(`${inputTokens.toLocaleString()} in`);
  if (outputTokens !== undefined) parts.push(`${outputTokens.toLocaleString()} out`);
  const label = parts.join(" / ");
  const titleParts: string[] = [];
  if (inputTokens !== undefined) titleParts.push(`${inputTokens.toLocaleString()} total input tokens sent`);
  if (outputTokens !== undefined) titleParts.push(`${outputTokens.toLocaleString()} output tokens generated`);
  const title = titleParts.join(" · ") + " on this turn";
  return `<span class="token-badge" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function panelAttrs(panel: Panel, index: number): string {
  const file = panel.sourceFile ? ` data-source-file="${escapeHtml(panel.sourceFile)}"` : "";
  return `data-panel="${index}" data-source-lines="${panel.lineNumbers.join(",")}"${file}`;
}

function qCls(panel: Panel): string {
  return panel.queued ? " queued" : "";
}

function renderPanel(panel: Panel, index: number): string {
  const attrs = panelAttrs(panel, index);
  const tag = sourceTag(panel);
  const q = qCls(panel);
  switch (panel.type) {
    case "human-speech":
      return `
    <div class="panel human-speech${q}" ${attrs}>
      ${tag}
      <div class="speech-bubble human-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("\n        ")}
      </div>
      <img class="character-avatar human-avatar" src="blue-tooth-person.png" alt="Human">
    </div>`;

    case "claude-speech":
      return `
    <div class="panel claude-speech" ${attrs}>
      ${tag}
      ${tokenBadge(panel.totalInputTokens, panel.outputTokens)}
      <img class="character-avatar robot-avatar" src="robot.png" alt="Claude">
      <div class="speech-bubble claude-bubble">
        ${panel.lines.map((l) => `<p>${escapeHtmlWithBold(l)}</p>`).join("\n        ")}
      </div>
    </div>`;

    case "claude-think":
      return `
    <div class="panel claude-think" ${attrs}>
      ${tag}
      ${tokenBadge(panel.totalInputTokens, panel.outputTokens)}
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

          // Tool output — open by default; the [−] summary minimizes it.
          if (d.output) {
            const truncatedOutput = d.output.length > 2000 ? d.output.slice(0, 2000) + "\n…" : d.output;
            extras += `
              <details class="tool-output-details" open>
                <summary class="tool-output-toggle" title="Toggle output"></summary>
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

    case "spawn-agent": {
      const d = panel.toolDetails?.[0];
      const sub = d?.subpanels ?? [];
      const agentType = d?.agentType || "Agent";
      const title = d?.summary?.trim() || agentType;
      const activityCount = sub.length;
      const msgLabel = `${activityCount} ${activityCount === 1 ? "activity" : "activities"}`;
      const subHtml = sub.map((sp, si) => renderPanel(sp, si)).join("\n");
      return `
    <div class="panel spawn-agent" ${attrs}>
      ${tag}
      <details class="spawn-agent-burst">
        <summary class="spawn-agent-summary">
          <span class="spawn-agent-type">${escapeHtml(agentType)}</span>
          <span class="spawn-agent-title">${escapeHtml(title)}</span>
          <span class="spawn-agent-count">${msgLabel}</span>
        </summary>
        <div class="subagent-comic">
          ${subHtml}
        </div>
      </details>
    </div>`;
    }

    case "notification":
      return `
    <div class="panel notification${q}" ${attrs}>
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

function renderTotals(totals: ConversationTotals | undefined): string {
  if (!totals) return "";
  const inT = totals.inputTokens.toLocaleString();
  const outT = totals.outputTokens.toLocaleString();
  const msgs = totals.messageCount.toLocaleString();
  return `
    <div class="conversation-totals" title="Sum of input + cache_creation + cache_read tokens across all assistant messages (including subagents), deduped by message id.">
      <div class="totals-label">Conversation totals</div>
      <div class="totals-numbers">
        <span class="totals-bucket"><strong>${inT}</strong> input tokens</span>
        <span class="totals-sep">·</span>
        <span class="totals-bucket"><strong>${outT}</strong> output tokens</span>
        <span class="totals-sep">·</span>
        <span class="totals-bucket">${msgs} message${totals.messageCount === 1 ? "" : "s"}</span>
      </div>
    </div>`;
}

export function generateHtml(
  panels: Panel[],
  title: string,
  totals?: ConversationTotals
): string {
  const panelHtml = panels.map((p, i) => renderPanel(p, i)).join("\n");
  const totalsHtml = renderTotals(totals);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cascadia+Code:wght@400;700&family=Sen:wght@400;700&family=Tenor+Sans&display=swap">
  <link rel="stylesheet" href="comic.css">
</head>
<body>
  <div class="comic-strip">
    <div class="comic-title">
      <h1>${escapeHtml(title)}</h1>
      <div class="toggle-bar">
        <button id="reveal-all" class="toggle-btn" title="Reveal all panels">Reveal all</button>
        <button id="toggle-actions" class="toggle-btn">Show all actions</button>
        <button id="toggle-outputs" class="toggle-btn">Hide all outputs</button>
        <button id="toggle-refs" class="toggle-btn" title="Hotkey: r">Show refs <kbd>r</kbd></button>
        <button id="toggle-tokens" class="toggle-btn" title="Hotkey: t">Show tokens <kbd>t</kbd></button>
        <button id="toggle-queued" class="toggle-btn" title="Hotkey: q">Show queued <kbd>q</kbd></button>
      </div>
    </div>
${panelHtml}
    <div class="comic-end">fin.</div>${totalsHtml}
  </div>
  <script>
    function makeToggle(buttonId, selector, showText, hideText, initialExpanded) {
      const btn = document.getElementById(buttonId);
      let expanded = initialExpanded || false;
      btn.textContent = expanded ? hideText : showText;
      btn.addEventListener('click', function() {
        expanded = !expanded;
        btn.textContent = expanded ? hideText : showText;
        document.querySelectorAll(selector).forEach(function(el) {
          el.open = expanded;
        });
      });
    }
    makeToggle('toggle-actions', 'details.montage-burst', 'Show all actions', 'Hide all actions');
    makeToggle('toggle-outputs', 'details.tool-output-details', 'Show all outputs', 'Hide all outputs', true);

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
    hotkeyToggle('toggle-queued', 'show-queued', 'q', 'Show queued', 'Hide queued');

    // Panel reveal + Claude-speech typewriter. The layout is fully laid
    // out, but only the first top-level panel is visible on load. Right
    // arrow reveals the next hidden panel (typing its text if it's a
    // Claude speech bubble) and smooth-scrolls it into view if needed.
    // Left arrow re-hides the most recently revealed panel. "Reveal all"
    // shows everything at once with no typing animation.
    (function panelReveal() {
      const panels = Array.from(document.querySelectorAll('.comic-strip > .panel'));
      if (panels.length === 0) return;

      // For each speech bubble (Claude or Human): walk its text nodes,
      // stash the originals, freeze the panel's rendered height so the
      // bubble can grow from one edge without shifting other panels,
      // then blank the text out. Hiding the panel resets the entry so
      // re-revealing retypes from scratch. Claude types fast; the human
      // types slower.
      const entryByPanel = new WeakMap();
      panels.forEach(function(panel) {
        let charsPerSec = 0;
        if (panel.classList.contains('claude-speech')) charsPerSec = 180;
        else if (panel.classList.contains('human-speech')) charsPerSec = 60;
        else return;
        const bubble = panel.querySelector('.speech-bubble');
        if (!bubble) return;
        const nodes = [];
        const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) nodes.push(n);
        const originals = nodes.map(function(n) { return n.nodeValue; });
        panel.style.minHeight = panel.offsetHeight + 'px';
        nodes.forEach(function(n) { n.nodeValue = ''; });
        entryByPanel.set(panel, { nodes: nodes, originals: originals, typed: false, aborted: false, charsPerSec: charsPerSec });
      });

      function typeEntry(entry) {
        if (entry.typed) return;
        const total = entry.originals.reduce(function(a, s) { return a + s.length; }, 0);
        if (total === 0) { entry.typed = true; return; }
        entry.aborted = false;
        const startMs = performance.now();
        const durationMs = (total / entry.charsPerSec) * 1000;
        function tick(now) {
          if (entry.aborted) return;
          const elapsed = now - startMs;
          const targetChars = Math.min(total, Math.ceil((elapsed / durationMs) * total));
          let remaining = targetChars;
          for (let i = 0; i < entry.nodes.length; i++) {
            const orig = entry.originals[i];
            if (remaining >= orig.length) {
              entry.nodes[i].nodeValue = orig;
              remaining -= orig.length;
            } else {
              entry.nodes[i].nodeValue = orig.slice(0, remaining);
              for (let j = i + 1; j < entry.nodes.length; j++) entry.nodes[j].nodeValue = '';
              break;
            }
          }
          if (targetChars < total) requestAnimationFrame(tick);
          else entry.typed = true;
        }
        requestAnimationFrame(tick);
      }
      function showEntryFully(entry) {
        entry.aborted = true;
        entry.nodes.forEach(function(n, i) { n.nodeValue = entry.originals[i]; });
        entry.typed = true;
      }

      panels.forEach(function(el, i) {
        if (i > 0) el.classList.add('panel-hidden');
      });

      // If the first panel happens to be a Claude speech, start typing it.
      const firstEntry = entryByPanel.get(panels[0]);
      if (firstEntry) typeEntry(firstEntry);

      function nextHiddenIndex() {
        for (let i = 0; i < panels.length; i++) {
          if (panels[i].classList.contains('panel-hidden')) return i;
        }
        return -1;
      }
      function lastVisibleIndex() {
        for (let i = panels.length - 1; i > 0; i--) {
          if (!panels[i].classList.contains('panel-hidden')) return i;
        }
        return -1;
      }

      function revealNext() {
        const i = nextHiddenIndex();
        if (i < 0) return;
        const el = panels[i];
        el.classList.remove('panel-hidden');
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const entry = entryByPanel.get(el);
        if (entry) typeEntry(entry);
      }
      function hideLast() {
        const i = lastVisibleIndex();
        if (i < 0) return;
        const el = panels[i];
        el.classList.add('panel-hidden');
        const entry = entryByPanel.get(el);
        if (entry) {
          entry.aborted = true;
          entry.nodes.forEach(function(n) { n.nodeValue = ''; });
          entry.typed = false;
        }
      }
      function revealAll() {
        panels.forEach(function(el) {
          const entry = entryByPanel.get(el);
          if (entry) showEntryFully(entry);
          el.classList.remove('panel-hidden');
        });
      }

      document.getElementById('reveal-all').addEventListener('click', revealAll);
      document.addEventListener('keydown', function(e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
        if (e.key === 'ArrowRight') { e.preventDefault(); revealNext(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); hideLast(); }
      });
    })();

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
