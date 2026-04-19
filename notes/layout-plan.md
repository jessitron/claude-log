# Layout Plan: Webtoon Comic Redesign

## Design Principles

1. **Scroll is pacing.** The reader scrolls down through the conversation. Transitions happen relative to scroll position, not time.
2. **Human is grounded.** Human speech has no animation — it's already there. You typed it, it doesn't "happen."
3. **Claude arrives.** Claude's speech appears like typing. Thoughts fade in. Actions expand then fold away.
4. **Conversation is center-left, backstage is right.** Human is at the left. Claude's dialogue is center — not far right — because the right side is reserved for behind-the-scenes work (actions, subagents). The stage has depth to the right.
5. **Work folds up when done.** Montages start expanded, then collapse as you scroll past them. Like real Claude usage: you watch the tools fly, then move on.
6. **Colors and typography are a separate arc.** This plan covers layout, positioning, and scroll behavior only.

---

## Spatial Model

The container widens to ~900px to make room for backstage. Think of horizontal zones:

```
|  Left (0-35%)  |  Center (35-65%)  |  Right (65-100%)  |
|  Human speech   |  Claude dialogue  |  Backstage:       |
|  👤 avatar      |  🤖 avatar        |  action montages  |
|                 |  think bubbles    |  subagent comics  |
|                 |  notifications    |                   |
|                 |  narrator         |                   |
```

These aren't rigid columns — it's a single flex container and each panel type has its own `align-self` + `max-width` + `margin-left` to land in the right zone. The zones overlap; nothing is grid-locked.

## Panel Layout Changes

### Human Speech
- **Position:** Left-aligned (unchanged). Lives in the left zone.
- **Avatar:** Small circular icon to the left of the bubble (replaces "Human" text label). CSS circle with emoji or simple SVG.
- **Max-width:** ~50% of container — human messages don't need to be wide.
- **Transition:** None. Already there.

### Claude Speech
- **Position:** Center-right. `align-self: flex-end` with a `margin-right` that reserves space for the backstage zone. Alternatively, `align-self: center` or a calculated offset. The key: Claude's dialogue should *not* hug the right edge.
- **Avatar:** Small circular icon to the right of the bubble (replaces "Claude" text label).
- **Max-width:** ~50% of container.
- **Transition:** Typewriter reveal. The bubble appears immediately but the text is masked and reveals left-to-right over ~600ms. Uses CSS `clip-path` animation. Plays once on first scroll into view, then stays revealed.
- **Implementation:** Add class `unrevealed` by default. IntersectionObserver adds `revealed` class on first entry. CSS animation runs on `.revealed .claude-bubble`.

### Claude Think
- **Position:** Same zone as Claude speech (center-right), slightly narrower.
- **Avatar:** None (thoughts don't need a face).
- **Transition:** Gentle fade-in. Opacity 0 → 1 over ~400ms. Plays once.

### Action Montage
- **Position:** Right zone. `align-self: flex-end`, no right margin. This is the backstage — furthest right.
- **Max-width:** ~55% of container.
- **Transition — the big one:**
  - Montages render with their `<details>` **open by default** (add `open` attribute).
  - When the *next panel after the montage* is fully visible in the viewport (IntersectionObserver, `threshold: 1.0`), the montage collapses.
  - On collapse: measure height before, close the `<details>`, measure height after, adjust `window.scrollY` by the difference to keep the reading position stable.
  - If the user scrolls back up and the montage re-enters the viewport, it re-expands. Scroll adjustment in reverse.
- **Collapse animation:** Instant (simpler, less jarring with the scroll adjustment).

### Subagent Comics (inside montages)
- **Same collapse-on-scroll-past behavior** as montages. They start open, fold up when the reader has moved past.
- **Position:** Already indented inside the montage (which is now in the right zone), so they're the most "backstage" element.

### Notifications
- **Position:** Center-right, same zone as Claude speech. These are Claude's workers reporting back *to* the conversation.
- **Transition:** Small slide-in from the right, ~200ms. Subtle, like a messenger arriving.

### Narrator
- **Position:** Centered (unchanged). Spans across the zones — it's the omniscient voice.
- **Transition:** Fade-in, ~400ms.

---

## Avatar Design

Both avatars are pure CSS — no image files needed.

```
.avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.human-avatar {
  background: #0f3460;
  border: 2px solid #3282b8;
}

.claude-avatar {
  background: #1a1a40;
  border: 2px solid #e94560;
}
```

Layout: each speech panel becomes a flex row with the avatar on the outside edge and the bubble filling the rest.

---

## Scroll Behavior: Implementation Plan

### IntersectionObserver Setup

One observer for "entrance" animations (think, speech, notification, narrator):
```js
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting && !entry.target.classList.contains('revealed')) {
      entry.target.classList.add('revealed');
      revealObserver.unobserve(entry.target); // once only
    }
  });
}, { threshold: 0.3 });
```

One observer for montage/subagent collapse, watching the *next sibling* panel:
```js
// For each montage, observe the next panel element.
// When that next panel is fully visible, collapse the montage.
document.querySelectorAll('.action-montage, .subagent-details').forEach(montage => {
  const trigger = montage.nextElementSibling;
  if (!trigger) return;

  const collapseObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const details = montage.querySelector('details');
      if (entry.isIntersecting && details.open) {
        // Collapse
        const heightBefore = montage.offsetHeight;
        details.open = false;
        const heightAfter = montage.offsetHeight;
        window.scrollBy(0, heightAfter - heightBefore);
      } else if (!entry.isIntersecting && !details.open) {
        // Re-expand when scrolling back up
        const heightBefore = montage.offsetHeight;
        details.open = true;
        const heightAfter = montage.offsetHeight;
        window.scrollBy(0, heightAfter - heightBefore);
      }
    });
  }, { threshold: 1.0 });

  collapseObserver.observe(trigger);
});
```

### Scroll Anchoring

The browser's native CSS `overflow-anchor: auto` may help, but for the montage collapse we'll do explicit scroll adjustment to be safe. The key invariant: **the panel the reader is looking at must not move on screen.**

---

## Spacing (Gap Between Panels)

Use CSS classes on panels based on what follows them:

| Transition | Gap | Why |
|---|---|---|
| think → action-montage | 4px (tight) | thought becomes action immediately |
| action-montage → claude-speech | 16px (bigger) | a beat while Claude formulates |
| human-speech → claude-think | 12px (moderate) | conversational pause |
| anything → notification | 20px (extra) | interruption needs room |
| Default | 8px (current) | |

Implementation: either CSS `:has()` selectors or add a `data-next` attribute during HTML generation.

---

## Implementation Order

Prototype one change at a time so we can see each in isolation:

1. **Widen container + reposition all panels** — Establish the three-zone layout. Move Claude speech to center, montages to right. CSS changes + minor HTML (margin/alignment classes).
2. **Avatars** — Replace text labels with avatar circles. HTML+CSS change.
3. **Montage starts-open + collapse-on-scroll** — Add `open` attribute + JS observer. The core interaction.
4. **Typewriter reveal on Claude speech** — CSS animation + JS observer.
5. **Think bubble fade-in** — CSS animation + JS observer.
6. **Notification slide-in** — CSS animation + JS observer.
7. **Spacing refinement** — Adjust gaps between panel types.

Colors, fonts, and visual polish are a separate arc — not in scope here.
