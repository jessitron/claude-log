# Layout Plan: Webtoon Comic Redesign

This file started as a forward-looking plan and is now a current-state
document with the parts that are still unbuilt called out at the end.

## Design Principles

1. **Human is grounded.** Human speech has no animation — it's already there. You typed it, it doesn't "happen."
2. **Claude arrives.** Claude's speech appears like typing. Thoughts fade in.
3. **The robot has its own column.** A single robot graphic slides vertically through a sequence of Claude's thinks → actions → speech. Between robot-sequences (separated by human speech), a fresh robot appears.
4. **Conversation zone ≠ backstage zone.** Claude's speech is closer to the robot's column (intimate, dialogue); think/action/spawn-agent have a bigger gap from the robot (backstage, behind-the-scenes work).
5. **Colors and typography are a separate arc.** This plan covers layout, positioning, and reveal behavior only.

---

## Reveal Model

The comic is **keyboard-driven**, not scroll-driven. On load only the first top-level panel is visible; the rest keep their layout footprint (via `visibility: hidden`) so the full conversation length is apparent.

- **→** reveals the next hidden top-level panel and smooth-scrolls it into view.
- **←** re-hides the most recently revealed panel.
- **Reveal all** button in the toolbar fills in every panel at once (and shows speech bubbles fully-typed).

Scroll happens _before_ typing starts (we wait for `scrollend` with a 900ms timeout fallback), so the reader has arrived at the panel before the text streams in. For human-speech panels the scroll target also includes the absolutely-positioned avatar hanging below the bubble.

Top-level panels are the direct children of `.comic-strip` plus panels nested inside `.comic-strip > .robot-sequence > .sequence-panels`. Subagent sub-panels deeper in the tree are _not_ part of the reveal flow.

---

## Spatial Model (current)

All positions are in % of the comic-strip's content width (max 1600px, padding 40px).

```
| Left (0-55%)    | Robot col (~22-26%) | Claude zone (27-100%) |
| Human speech    | 🤖                  | speech (27-82%)       |
|                 |                     | think/action (50-100%)|
|                 |                     | spawn-agent (50-100%) |
```

- **Human speech** — `align-self: flex-start`, `max-width: 55%`. Avatar is absolutely positioned, hangs below the bubble, doesn't push later content.
- **Robot column** — `position: absolute; left: 22%` inside a `.robot-sequence` wrapper. Robot right edge at ~26%.
- **Claude speech** — `align-self: flex-end; width: 55%; margin-right: 18%` → spans 27%-82%. Tight to the robot (dialogue feel).
- **Think / action-montage / spawn-agent** — `align-self: flex-end; width: 50%` → spans 50%-100%. Bigger gap from robot (backstage feel).
- **Notification** — `align-self: flex-end; max-width: 50%; margin-right: 30%` → center-right (unchanged from pre-sequence layout).
- **Narrator** — `align-self: center; max-width: 90%`.

Speech bubbles (both sides) are `width: fit-content`, so they grow from their left edge as text types in. Panel heights are frozen to their fully-typed size before blanking so typing doesn't reflow the rest of the page.

---

## Robot Sequence

Contiguous robot-type panels are wrapped in a `<div class="robot-sequence">` at render time:

```html
<div class="robot-sequence">
  <img class="sequence-robot" src="robot.png" />
  <div class="sequence-panels">
    <!-- claude-think / action-montage / spawn-agent / claude-speech,
         plus any notification panels that arrived mid-sequence -->
  </div>
</div>
```

**Grouping rules** (`groupForRendering` in `src/html-generator.ts`):

- A sequence is a maximal run of robot-type panels.
- A **claude-speech ends its sequence** — the next robot panel after it starts a fresh sequence with its own robot graphic.
- **Notifications pass through**: they stay in the DOM where they appear but don't break the sequence. The robot's `translateY` only tracks robot-type panels, so notifications are skipped when picking "last visible panel."
- **Human speech** breaks a sequence.
- **Narrator** currently breaks a sequence (TBD whether it should pass through like notifications).

**Robot motion**: the robot is `position: absolute; left: 22%` and `transition: transform 500ms ease`. JS sets `translateY(lastVisibleRobotPanel.offsetTop)`. Motion is therefore pure vertical. Robot is hidden via `:has` until at least one panel in its sequence is visible; initial placement skips the transition so it doesn't slide in from `translateY(0)` on load.

---

## Transitions by Panel Type

| Panel type     | Entrance                                                                       | Status     |
| -------------- | ------------------------------------------------------------------------------ | ---------- |
| human-speech   | Typewriter, 60 chars/sec, bubble grows from left                               | ✅ done    |
| claude-speech  | Typewriter, 180 chars/sec, bubble grows from left                              | ✅ done    |
| claude-think   | Fade-in (opacity 0→1 over 400ms)                                               | ✅ done    |
| action-montage | Conditional                                                                    | ❌ not yet |
| spawn-agent    | Conditional                                                                    | ❌ not yet |
| notification   | needs to slide in from left. Ideally, after dropping from its source tool call | ❌ not yet |
| narrator       | None                                                                           | ❌ not yet |

Plus: the robot itself animates its `translateY` whenever the last-revealed robot panel in its sequence changes (reveal or re-hide).

The speech typewriter persists the typed state only until re-hide: if you press ←, the panel resets to blank and the next → replays the typewriter. The think fade-in re-runs naturally on every visibility change because it's pure CSS transition.

Separate from entrance transitions, the action-montage's own `<details>` expansion animates via `interpolate-size: allow-keywords` + `::details-content` (block-size + opacity, ~250ms). Chrome/Safari only — Firefox degrades to snap.

---

## Known open items

- **Action-montage entrance** — should have some reveal animation (the robot slides to it, but the box itself snaps in). Options: fade in, slide in from the right, or briefly flash the ⚡ACTION⚡ banner.
  - I want some of these to come in open, and show what they're doing. but only some of them, so we'll need a way to provide that input.
- **Spawn-agent entrance** — same.
- **Notification entrance** — would benefit from a slide-in-from-right (200ms or so) to sell "a messenger arrived mid-flow." Especially important now that notifications live _inside_ robot sequences.
  - ideally they originate at whatever tool call initiated the process that a "background command completed" came from.
- **Narrator entrance** — these are rare enough that we don't need to worry about them yet. They could use some sort of violent entrance.
- **Spacing between panels** — still uses the default gap of the containing flex column. The original plan had gap-by-context rules (tight think→action, looser action→speech, extra before notification). Not implemented.
