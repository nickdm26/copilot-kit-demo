# PT Coach: build plan for parallel agents

How to use this file:
1. Put it in the repo root.
2. Start the orchestrator with the prompt in "Orchestrator prompt" below. It runs every task except Task 9.
3. At 22:00, start Task 9 yourself in Claude Code with Opus, in its own worktree.

### Model per task

| Task | Model tier | Run by |
|---|---|---|
| Orchestrator | Mid-tier (full GLM or DeepSeek, not Flash) | You |
| 0 Audit | Mid-tier | Orchestrator |
| 1 to 7 UI components | Cheap (DeepSeek or GLM Flash) | Orchestrator |
| 8 Wiring | Mid-tier | Orchestrator |
| 9 Declarative how-to | Opus in Claude Code | You, separately |
| 10 OpenTelemetry | Mid-tier | Orchestrator |

### Timeline (bed by midnight)

| Time | What | Blocking? |
|---|---|---|
| 21:35 to 21:55 | Task 0 audit. Skim AUDIT.md when done | Yes, but short and you're watching |
| 21:55 | Create worktrees (see below), about 5 minutes | Yes, short |
| 22:00 | Start Tasks 1 to 7, 9 and 10 in parallel, one per worktree | No |
| 22:45 | Check in. Merge finished UI tasks | No |
| 22:50 to 23:30 | Task 8 wiring on what's merged. Skip anything unfinished | Only on finished tasks |
| 23:30 | Review, commit, leave Task 9 running if needed | No |

Nothing important depends on Task 9 or 10, so they can run past midnight safely.

### Worktrees

One worktree per parallel task, all next to the main repo:

```bash
git worktree add ../pt-t1-status    -b feat/agent-status-strip
git worktree add ../pt-t2-progress  -b feat/progress-card
git worktree add ../pt-t3-diff      -b feat/program-diff-card
git worktree add ../pt-t4-profile   -b feat/client-profile
git worktree add ../pt-t5-chips     -b feat/suggestion-chips
git worktree add ../pt-t6-model     -b feat/model-picker
git worktree add ../pt-t7-mobile    -b feat/mobile-layout
git worktree add ../pt-t9-declar    -b feat/declarative-howto
git worktree add ../pt-t10-otel     -b feat/otel-traces
```

Task 8 runs in an `integration` worktree after merges:

```bash
git worktree add ../pt-integration -b integration
```

**Watch out for node_modules.** A fresh install in 9 worktrees is slow. Tasks 1 to 7 add no dependencies, so either:
- use pnpm, which shares one package store, or
- symlink it: `ln -s ../your-repo/node_modules ../pt-t1-status/node_modules` (repeat per worktree).

.NET is fine. `dotnet restore` uses the shared NuGet cache. Only Tasks 8, 9 and 10 touch .NET.

Clean up in the morning with `git worktree remove ../pt-t1-status` and so on.

If you run the orchestrator in Claude Code, its subagents can get their own worktree automatically, so you can skip the manual commands.

### Orchestrator prompt

```
You are the orchestrator for PT_COACH_BUILD_PLAN.md in the repo root.
Read the whole file first. You coordinate. You never write feature code.

Rules
- Use the model tier from "Model per task" for each subagent.
- Give each subagent its task section from the plan as its prompt,
  plus the path of its worktree.
- Check the real time with `date` before any time-based decision.
- Never merge to main. Retry a failed task once at most.
- Do not start, check or merge Task 9. I run it myself.
- Keep your own messages short. Don't paste subagent output back to me.

Steps
1. Run Task 0. Show me its 5 line summary. Wait for me to say "go".
2. Create the worktrees from the Worktrees section (skip Task 9's,
   I'll make it). Set up node_modules as the plan says.
3. Start Tasks 1 to 7 and 10 in parallel.
4. As each of 1 to 7 finishes: run the type check in its worktree.
   Pass: merge into the integration worktree. Fail: send the error back
   once. Fails again: skip it.
5. When 1 to 7 are all merged or skipped, or at 22:50, whichever is
   first: run one full build on integration, then run Task 8 there.
   Don't wait for Task 10.
6. When Task 10 finishes and builds: merge it into integration.
7. Stop all work at 23:45. Write ORCHESTRATOR_REPORT.md with:
   merged, skipped (and why), still running, and what I should check
   first in the morning. Then tell me it's done in one line.
```

Assumptions to check before you start:
- React + TypeScript + Tailwind v4. Change paths if your folders differ.
- Existing primitives live in `src/components/ui/` (Button, Card, Badge, Chip, Select).
- New agent UI goes in `src/components/agent/`.

---

## 0. Shared rules (every agent reads this)

### Design tokens (do not invent new colours or fonts)

| Token | Light | Dark |
|---|---|---|
| bg | #f7f5f0 | #141414 |
| surface | #ffffff | #1e1e1e |
| ink | #1a1a1a | #f2f0ea |
| ink-muted | #5f5e5a | ink at 72% opacity |
| border | #e2dfd6 | #2e2e2e |
| accent | #f2600c | #ff7a2e |
| flag | #d93636 | #f06262 |
| ok | #2f8f5b | #4cc287 |

- Radius: 10px default, 6px sm, 14px lg.
- Headings: Barlow Condensed 600, uppercase, tracking-wide.
- Body: Inter. All numbers use `tabular-nums`.

### Accessibility rules found in the design

- Primary buttons are accent background with **ink text**, not white. White on orange fails contrast.
- Badges are a light tint of their colour (about 10 to 14% opacity) with ink text and a 6px coloured dot. Never coloured text on white.
- Touch targets at least 44px on mobile.
- Real `<button>`, `<label>` and `<select>` elements. `aria-label` on icon-only buttons.
- No emoji. Icons are inline stroke SVG.

### Reuse these existing components

Button (primary, secondary, ghost, danger. sm h-8, md h-10), Card (surface, 1px border, rounded-md, p-4), Badge (neutral, accent, flag, ok. 12px pill), Chip (rounded-full toggle), Select (h-10 native select).

### Rules for every task

- Build **presentational components only**. Props in, callbacks out. No CopilotKit imports. Task 8 does the wiring.
- Export a typed props interface.
- Add a fixtures file with realistic data for the client "Aroha Tane".
- Add a demo page or story that shows every state listed in your task, in light and dark.
- Only create or edit the files listed in your task. If you need a change elsewhere, write it in your final message instead.
- Do not add new dependencies.
- Use the paths, props and patterns in AUDIT.md where they differ from this file. AUDIT.md wins.
- Do not build pages, nav items or features that don't exist in the app (for example Programs or Exercise library). The mockup header is illustrative only.
- Time box: aim to finish in about 30 minutes. If you get stuck, stop and list what's left in your final message. A partial, working result beats an unfinished big one.
- Work only in your own worktree and branch (see Worktrees below). Don't touch main.
- **Checks, not tests.** When done, run only the type check and lint. Don't write new unit tests (except Task 9). Don't start a dev server, browser or Storybook. The demo page is for me to look at in the morning.
- If the type check fails on files you didn't touch, ignore it and say so.

### Sample data used across the designs

- Client: Aroha Tane. Training age 2 yrs. 3 days a week.
- Goals: Back squat 120 kg by March. Build upper back strength. Stay pain free overhead.
- Equipment: Barbell, Dumbbells, Cable, Pull-up bar (Machines not available).
- Injury: Left shoulder. History of impingement. Avoid behind-neck pressing and deep dips.
- Program: Strength block, 6 weeks, currently week 3. Day 1 Lower, Day 2 Upper, Day 3 Full.

---

## Task 0. Audit (run first, about 15 minutes)

Use a mid-tier model. This is read-only except for the two files below.

Read PT_COACH_BUILD_PLAN.md in full. Then compare it with the actual repo and write `AUDIT.md`. Keep it short, tables over prose.

Check and record:
1. **Stack**: TypeScript or JavaScript, React version, Tailwind version, CopilotKit and AG-UI package versions, test setup, whether Storybook or a demo route exists.
2. **Paths**: where UI primitives, agent cards and layouts actually live. Give the real path for every file each task plans to create.
3. **Primitives**: do Button, Card, Badge, Chip and Select exist? List their real prop names and variants.
4. **Tokens**: are the section 0 colours defined (Tailwind theme, CSS variables)? Note the real token names and anything missing, such as dark mode.
5. **Existing agent UI**: how ExerciseCard, SwapApproval and WeekSummary are wired. Name the hooks and files. This is the pattern Task 8 follows.
6. **Layout**: what the current app shell has (nav items, panels, chat pane). List anything in the mockups that doesn't exist. Mark each as "skip" or "in scope".
7. **Backend**: where the .NET agent defines tools, where it calls OpenRouter, how model choice is passed, and how OpenTelemetry is set up today.
8. **Conflicts**: any task whose files would clash with another task. Suggest a fix.

Then edit this file:
- Fix the "Assumptions" list and every file path in Tasks 1 to 10 to match the repo.
- Remove or mark as skipped anything that doesn't apply.
- Don't change the design rules in section 0.

Finish with a 5 line summary of the biggest differences you found.

---

## Task 1. AgentStatusStrip

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/agent/AgentStatusStrip.tsx` plus fixtures and demo.

A strip that sits under the chat header and shows what the agent is doing.

```ts
type StepState = "done" | "active" | "pending";
interface AgentStatusStripProps {
  status: "idle" | "working" | "awaiting-approval" | "done" | "error";
  steps?: { label: string; state: StepState }[];
  summary?: string;        // done: "4 steps · 2 cells changed"
  errorMessage?: string;   // error: "OpenRouter timed out after 30 s on step 2."
  onShowSteps?: () => void;
  onRetry?: () => void;
  onSwitchModel?: () => void;
}
```

States:
- **idle**: muted text, small grey dot. "Ready."
- **working**: accent tint background. Spinner, current step label in bold, "Step 3 of 4" on the right. Step list below. Done steps get a green check, active step an accent dot, pending steps an outlined dot.
- **awaiting-approval**: accent tint, pause icon, "Waiting for your approval".
- **done**: ok tint, green check, "Done", summary in muted text, ghost "Show steps" button on the right.
- **error**: flag tint, X icon, bold "Couldn't reach the model", error message, buttons "Retry" (secondary) and "Switch model" (ghost). Use `role="alert"`. Other states use `role="status"`.

Done when: all 5 states render in light and dark on the demo page.

---

## Task 2. ProgressCard

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/agent/ProgressCard.tsx` plus fixtures and demo.

A chat card that shows one lift over time.

```ts
interface ProgressCardProps {
  lift: string;                       // "Back squat"
  points: { week: number; kg: number }[];
  topSet: string;                     // "95 kg × 3"
  est1rm: number;                     // 103
  goal?: number;                      // 120
  trend: { tone: "ok" | "flag"; label: string }; // "Stalled 4 wks" or "Up 10 kg"
}
```

Layout:
- Header row: heading "{lift} · top set", trend Badge on the right.
- Hand-drawn SVG line chart, about 320 by 130 viewBox. No chart library. Dashed gridline at the latest value with a "95 kg" label. X labels W1, middle week, last week.
- If the trend tone is flag, colour the flat tail of the line and its points in flag. Otherwise use ink in light mode and ok in dark mode.
- SVG has `role="img"` and an `aria-label` that describes the trend in words.
- Footer: 3 stats in a row (Top set, Est. 1RM, Goal) with a border-top.

Fixtures:
- Stalled: back squat 85, 88, 90, 92.5, 95, 95, 95, 95.
- Rising: bench press 60, 62.5, 62.5, 65, 65, 67.5, 67.5, 70.

---

## Task 3. ProgramDiffCard

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/agent/ProgramDiffCard.tsx` plus fixtures and demo.

Human in the loop card for when the agent changes many program cells at once.

```ts
interface DiffRow { cell: string; before: string; after: string } // cell: "Day 3 · A1"
interface ProgramDiffCardProps {
  week: number;
  rows: DiffRow[];
  reason?: string;
  status: "pending" | "approved" | "rejected";
  appliedAt?: string;          // "9:02 pm"
  onApproveAll?: () => void;
  onReviewOneByOne?: () => void;
  onReject?: () => void;
  onUndo?: () => void;
  onSuggest?: (text: string) => void; // rejected state chips
}
```

States:
- **pending**: accent border on the card. Badge accent "{n} changes". Rows show cell, before, after. After value has an accent tint highlight. Reason text in muted. Buttons: "Approve all" (primary), "Review one by one" (secondary), "Reject" (danger outline).
- **approved**: normal border. Badge ok "Approved". Rows show only the after value. Footer "Applied to the program at {appliedAt}" and a ghost "Undo".
- **rejected**: normal border, muted heading. Neutral Badge "Rejected". Rows have a dashed border and the after value struck through. Text "Nothing changed. Tell the agent what to try instead." Two chips: "Keep front squats", "Smaller change".

Responsive: below 480px, stack each row as cell, then struck-through before, then bold after. Buttons go full width with Approve all on its own row.

Fixture rows:
- Day 1 · A1: Back Squat 4 x 6 @ RPE 8 → Back Squat 4 x 5 @ RPE 7
- Day 3 · A1: Front Squat 3 x 6 @ RPE 7 → Pause Squat 3 x 4 @ RPE 6
- Day 3 · B1: Overhead Press 3 x 8 @ RPE 7 → Landmine Press 3 x 8 @ RPE 7

---

## Task 4. ClientProfilePanel

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/client/ClientProfilePanel.tsx` plus fixtures and demo.

```ts
interface ClientProfilePanelProps {
  clients: { id: string; name: string }[];
  selectedClientId: string;
  onSelectClient: (id: string) => void;
  name: string;
  trainingAgeYears: number;
  daysPerWeek: number;
  goals: string[];
  equipment: { name: string; available: boolean }[];
  injuries: { area: string; note: string }[];
  onToggleEquipment?: (name: string) => void;
}
```

Layout, top to bottom:
- Label "Client" and a Select to switch client.
- Card with the client name as a large heading and "Training age 2 yrs · 3 days a week" in muted text.
- "Goals" section heading (small, muted, Barlow) and a bullet list.
- "Equipment" section with Chips. Available chips: accent border and accent tint, `aria-pressed="true"`. Unavailable: plain border, muted text.
- "Injury notes" section. Each injury is a bordered box with a flag Badge for the area and the note below.
- Footer note in a dashed accent box with an eye icon: "The coach agent can read this panel."

Width: fills its container, designed for 260 to 320px.

---

## Task 5. SuggestionChips and empty chat state

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/agent/SuggestionChips.tsx` and `src/components/agent/ChatEmptyState.tsx` plus fixtures and demo.

```ts
interface SuggestionChipsProps {
  suggestions: { label: string; highlighted?: boolean }[];
  onPick: (label: string) => void;
}
interface ChatEmptyStateProps {
  clientName: string;
  suggestions: string[];
  onPick: (label: string) => void;
}
```

- Chips sit above the chat input. One row. On mobile the row scrolls sideways with no visible scrollbar. Chip height 32px desktop, 36px mobile.
- A highlighted chip gets accent border and accent tint.
- Empty state: centred, short heading "Ask about {clientName}'s program", then the chips as larger starter buttons stacked vertically.
- Fixture suggestions: "Show me a pause squat" (highlighted), "Deload next week", "Swap for home gym", "Check shoulder load".

---

## Task 6. ModelPicker

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/components/agent/ModelPicker.tsx` and `src/components/agent/SystemMessage.tsx` plus fixtures and demo.

```ts
interface ModelOption { id: string; name: string; shortName: string; provider: string; speed?: "Fast" | "Balanced" | "Smart" }
interface ModelPickerProps {
  models: ModelOption[];
  value: string;
  onChange: (id: string) => void;
  compact?: boolean; // mobile: show shortName, max-width 130px
}
interface SystemMessageProps { text: string } // "Switched to Claude Sonnet 5.5"
```

- Uses the existing Select. Label is visually hidden but present for screen readers ("Model").
- Desktop option text: "{name} · {provider}". Compact option text: shortName.
- SystemMessage: centred, 12px, muted, no bubble.
- Fixture models: Claude Sonnet 5.5 (Anthropic), GPT-5 mini (OpenAI), Llama 4 Maverick (Meta). Change these to whatever you expose through OpenRouter.

---

## Task 7. Mobile layout

Read PT_COACH_BUILD_PLAN.md section 0 first.

Build `src/layouts/MobileShell.tsx`, `src/components/program/MobileDayView.tsx` and `src/components/program/PendingChangesBanner.tsx` plus a demo page.

Use plain placeholder divs for the chat and profile content. Other tasks are building those.

**MobileShell** (below 768px only)
- Bottom tab bar: Program, Coach, Client. Icon above a 12px label. Active tab in ink and bold. Others muted. 52px tall items plus bottom safe-area padding.
- Coach tab shows a small accent dot when `hasPendingApproval` is true.
- The chat screen hides the tab bar and has a back button (44px) in its header instead.

**MobileDayView**
- Header: small muted line "Strength block · Wk 3 of 6", client name as a large heading, week Select on the right.
- Segmented control for days (grey track, white active segment). Tabs use `role="tab"`.
- List of exercise cards. Grid: slot label (Barlow, muted), then name (bold) and prescription (muted, tabular), then a chevron.
- Agent-edited cards: accent border, accent tint, small "Just updated by agent" line. Tint fades out after 2 seconds.
- Flagged cards: flag Badge under the prescription, for example "Shoulder history".

**PendingChangesBanner**
- Accent border and tint, accent dot, bold "Coach agent proposed {n} changes", muted "Tap to review before they apply", chevron. Whole banner is one link or button.

Day 3 fixture: A1 Pause Squat 3 x 4 @ RPE 6 (agent edited), A2 Pull-up 4 x 6 @ RPE 8, B1 Overhead Press 3 x 8 @ RPE 7 (flag), B2 Hip Thrust 3 x 10 @ RPE 7, C1 Farmer Carry 3 x 30 m.

---

## Task 8. Wiring (after Tasks 1 to 7)

Use a mid-tier model or better.

Read PT_COACH_BUILD_PLAN.md section 0 and AUDIT.md. Then wire the components from Tasks 1 to 7 into the app using the CopilotKit and AG-UI setup that already exists in this repo.

Only wire components that are merged. Skip any that aren't and list them at the end. Do the items in the order below and commit after each one, so stopping early still leaves working code.

- Look at how ExerciseCard, SwapApproval and WeekSummary are already wired. Follow the same pattern. Check the installed CopilotKit version's docs before using a hook you haven't seen in the repo.
- ProgressCard: rendered from an agent tool call.
- ProgramDiffCard: human in the loop. The agent waits for approve or reject. On approve, the grid cells update and get the 2 second accent fade.
- AgentStatusStrip: driven by the agent's streamed state.
- ClientProfilePanel: its data is shared with the agent as readable context.
- SuggestionChips: send the chip text as a user message.
- ModelPicker: passes the chosen model to the .NET agent, which forwards it to OpenRouter. Add the SystemMessage on change.
- MobileShell: swap layouts at 768px.

List any backend changes the .NET agent needs, and make them if they are small.

---

## Task 9. Declarative how-to (Opus in Claude Code)

Read PT_COACH_BUILD_PLAN.md section 0 first. This task can run while Tasks 1 to 7 run. Stay inside `src/components/declarative/` and the .NET agent's tool definitions.

Build a declarative generative UI feature. The agent sends JSON that describes a UI built only from a catalog of our components. The frontend validates and renders it. The agent never sends HTML, CSS or JS.

**First**, check CopilotKit's current docs for declarative generative UI support (A2UI) and use it if it fits our version. If it doesn't, build a small renderer ourselves with the same idea.

**Catalog** (each a React component using section 0 tokens):

| type | Props | Notes |
|---|---|---|
| Card | children | Container. Surface, border, radius 10 |
| Heading | text, meta? | Barlow heading, muted meta on the right |
| Stepper | steps[] | Each step: title, cue, figure. Back and Next (44px). Next becomes "Start again" on the last step. Progress bars above the text. `aria-live="polite"` on the step text |
| PoseFigure | pose, marker? | SVG stick figure. pose: stand, half, bottom. marker: down, hold, up. Presets only. The agent cannot pass coordinates |
| TempoStrip | segments[], follows? | 3 boxes. When follows is "Stepper", highlight the box for the current step (step 1 none, step 2 first box, and so on) |
| Callout | tone, text | tone: ok, flag, info. Tinted background |

**Safety**
- Validate with a schema (zod or similar). Unknown `type`, unknown props or wrong types are rejected and the whole block is not rendered. Show a small fallback message instead.
- Limit depth (4) and node count (50).
- Text is rendered as text, never as HTML.

**Agent side (.NET)**
- Add a tool such as `show_how_to` whose argument is the JSON tree. Describe the catalog and the allowed values in the tool description so the model only uses real types.
- Personalise from client context. For Aroha the Callout should mention her left shoulder.

**Example the agent should be able to produce**

```json
{
  "type": "Card",
  "children": [
    { "type": "Heading", "text": "Pause squat", "meta": "Tempo 3-2-X" },
    { "type": "Stepper", "steps": [
      { "title": "Brace", "cue": "Big breath into your belly.", "figure": { "pose": "stand" } },
      { "title": "Lower for 3 seconds", "cue": "Knees track over the toes.", "figure": { "pose": "half", "marker": "down" } },
      { "title": "Pause for 2 seconds", "cue": "Stay tight. No bounce.", "figure": { "pose": "bottom", "marker": "hold" } },
      { "title": "Drive up fast", "cue": "Chest and hips rise together.", "figure": { "pose": "half", "marker": "up" } }
    ] },
    { "type": "TempoStrip", "segments": ["3s down", "2s pause", "Up fast"], "follows": "Stepper" },
    { "type": "Callout", "tone": "flag", "text": "For Aroha: wider grip, elbows down." }
  ]
}
```

**UI details**
- Above the card, a small ok-tinted badge with a grid icon: "Declarative · built from your catalog".
- Works at 360px wide and inside the desktop chat pane (about 400px).

**Tests** (schema only, plain unit tests, no rendering or browser)

This is the one task that keeps tests, because the schema is the security boundary. Keep them fast:
- The example JSON passes validation.
- A node with `"type": "Script"` fails.
- Extra props fail.
- Depth over 4 and more than 50 nodes fail.

Finish with a short summary of the files you added and how to trigger it from chat ("Show me a pause squat").

---

## Task 10. Richer OpenTelemetry traces

Use a mid-tier model. Runs in parallel with Tasks 1 to 9.

Read PT_COACH_BUILD_PLAN.md section 0 and the backend part of AUDIT.md. OpenTelemetry is already set up and partly working. The goal is traces that show what the agent did on each run.

**First**, read the current setup and write a short "before" note: which spans exist today, and what's missing.

**Then add**, following the OpenTelemetry GenAI semantic conventions (check the current version, they are still changing):
- A span per LLM call with model requested and returned, operation name, input and output token counts, finish reason and the OpenRouter provider if available.
- A span per tool call with the tool name and call id. Includes `show_how_to` and the program-edit tools.
- Root span attributes for the AG-UI run: run id, thread id, client **id** (not name).
- Span events for approvals: proposed, approved or rejected, and how many cells changed.
- Errors recorded on the span with status set, especially OpenRouter timeouts.
- Trace context passed from the React app to the .NET agent if the frontend sends `traceparent`. If it doesn't, note it as a follow-up. Don't add frontend tracing tonight.

If the agent uses Microsoft.Extensions.AI or a similar library that already emits GenAI spans, turn that on first before adding anything by hand.

**Privacy**
- Never record prompt or response text, client names or injury notes by default.
- Put prompt and response capture behind a config flag that is off by default.

**Avoid clashes**
- Wrap or decorate the LLM client and tool runner. Don't edit each tool's file, since Tasks 8 and 9 are working on those.

Finish with a short "after" note: the new spans and attributes, and how to see a full agent run in your trace viewer.
