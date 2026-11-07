# PT Coach Demo: Build Plan for Claude Code

Nov 7, 2026 · @Nick

## Goal and demo story

Build a small demo app where a personal trainer and an AI coach build a training program together, live, on the same screen. The point is to show off CopilotKit and the AG-UI protocol with a .NET 10 agent behind it.

The app must nail this 60 second demo:

1. Trainer picks a model from a dropdown (for example "Quick" or "Thorough").
2. Trainer types: "4 week strength block for Sarah, 3 days a week, sore left shoulder".
3. The program grid fills in day by day while they watch (shared state).
4. Exercise cards and a weekly volume summary appear in the chat (generative UI).
5. The agent flags shoulder risky lifts and asks to swap them. Trainer taps Approve or Reject (human in the loop).
6. Trainer drags a day or edits a cell. The agent notices and rebalances the week.

If a feature does not help this script, it is out of scope.

## What you might be missing

Your list covers the big parts. These are the gaps that usually bite when agents build in parallel.

| Gap | Why it matters | Where it lands |
| --- | --- | --- |
| Shared contracts first | Parallel agents drift if they each invent the program schema and tool names. One contracts file stops that. | Phase 0 |
| Program grid (shared state) | This is the hero of the demo. The 2 to 3 chat components are the supporting cast. | Phase 2, lane F |
| Approval flow | Swap approvals are the human in the loop moment. Needs its own component. | Phase 2, lane E |
| Local orchestration | Three apps (Vite web app, Express runtime, .NET agent) need one command to start. .NET Aspire does this and gives you an OpenTelemetry dashboard for free. | Phase 1, lane A |
| Secrets | OpenRouter key must never reach the browser or git. Use user secrets for .NET. | Phase 0 and lane A |
| Seed data | An exercise library and 2 to 3 fictional clients make the demo feel real and give the agent something to ground on. | Phase 1, lane D |
| End to end test of the demo script | Proves the 60 second flow works before you show anyone. | Phase 3 |
| Fallback if .NET shared state is thin | Microsoft says .NET support for each AG-UI feature varies. Plan B is to drive the grid with a frontend tool. | Phase 2, lane F |
| Domain sanity check | You are not a PT. Get your friend to eyeball the generated programs. | After Phase 3 |
| Safety wording | The demo mentions a sore shoulder. Add a small "not medical advice" note in the UI. | Phase 2 |
| CopilotKit docs for Claude Code | CopilotKit publishes a skills plugin with a live docs MCP server. It stops Claude Code guessing at v1 vs v2 APIs. | Before you start |

Sources: [CopilotKit hooks](https://docs.copilotkit.ai/concepts/which-hook), [MAF AG-UI integration](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/), [CopilotKit develop skill](https://skillselion.com/skills/copilotkit/skills/copilotkit-develop)

## Tech stack and repo layout

One repo, three apps, started together by Aspire. The runtime and the React UI live in the same yarn workspace as two packages: a Vite app, and a small Express server for the runtime, since Vite has no server side.

| Layer | Choice | Notes |
| --- | --- | --- |
| Orchestration | .NET Aspire 13 AppHost | `Aspire.Hosting.JavaScript` with `AddViteApp` for the web app and `AddJavaScriptApp` for the runtime, both with `.WithYarn()` |
| Agent | .NET 10 ASP.NET Core + Microsoft Agent Framework | `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` (prerelease) |
| LLM | OpenRouter via the OpenAI .NET client | Custom endpoint `https://openrouter.ai/api/v1` |
| Web app and runtime | Vite, React, TypeScript, plus an Express server for the CopilotKit runtime | `@copilotkit/react-core/v2`, `@copilotkit/runtime`, `@ag-ui/client` |
| Styling | Tailwind CSS with CSS variable theme tokens | Light and dark mode |
| Tests | xUnit for .NET, Playwright for end to end | Playwright runs the demo script |
| Packages | yarn workspaces for web and runtime, NuGet for .NET | Pin every CopilotKit, AG-UI and MAF version |

```text
pt-coach-demo/
  CLAUDE.md              rules for Claude Code
  CONTRACTS.md           schema, tool names, ports, models (Phase 0)
  package.json           yarn workspaces: web, runtime
  shared/
    program.schema.json  the program state shape
    seed/exercises.json
    seed/clients.json
  apphost/               Aspire AppHost
  agent/                 .NET 10 agent (MAF + AG-UI)
    Agents/  Tools/  Models/  Seed/
  agent.tests/
  runtime/               Express server with the CopilotKit runtime
    src/server.ts        mounts /api/copilotkit
  web/                   Vite + React app
    vite.config.ts       proxies /api/copilotkit to the runtime
    src/App.tsx
    src/components/program-grid/
    src/components/genui/
    src/components/ui/
    src/lib/contracts.ts
    src/styles/theme.css
  e2e/                   Playwright demo test
```

Sources: [Aspire JavaScript integration](https://aspire.dev/integrations/frameworks/javascript.md), [AG-UI getting started](https://learn.microsoft.com/agent-framework/integrations/ag-ui/getting-started)

## Build order at a glance

4 phases, 6 parallel lanes:

- **Phase 0** (lead, Opus, sequential): contracts. Ends with Nick's review.
- **Phase 1** (parallel): lane A .NET agent + Aspire (Sonnet), lane B Vite app + runtime (Sonnet), lane C theme (Sonnet), lane D seed data (Haiku).
- **Phase 2** (parallel): lane E generative UI (Sonnet), lane F program grid + shared state (Opus).
- **Phase 3** (lead, sequential): merge, replay model, Playwright test (Sonnet), README (Haiku), separate review agent (Opus).

Phase 0 runs alone and ends with your review. Each later phase starts only when every lane before it passes its "Done when" check.

**Model choice.** Opus goes where a mistake spreads to everything else: the contracts, the program grid, the merge and the review. Sonnet does most of the building. Haiku gets small jobs that a schema or test can check. If a Sonnet or Haiku lane fails its "Done when" check twice, the lead re-runs it on Opus.

## Phase 0: Contracts (lead agent, sequential)

The lead agent does this alone before any subagent starts. Everything later builds against these files, so nobody invents their own names.

**Outputs:** `CLAUDE.md`, `CONTRACTS.md`, `shared/program.schema.json`, `web/src/lib/contracts.ts`, `agent/Models/*.cs`.

**1. Program state shape.** Keep it small. Both the grid and the agent read and write this.

```json
{
  "clientId": "sarah",
  "goal": "strength",
  "daysPerWeek": 3,
  "weeks": [
    {
      "week": 1,
      "days": [
        {
          "day": "Mon",
          "focus": "Lower",
          "exercises": [
            { "exerciseId": "back-squat", "sets": 4, "reps": "5", "rpe": 7, "note": "" }
          ]
        }
      ]
    }
  ],
  "flags": [ { "exerciseId": "overhead-press", "reason": "left shoulder" } ]
}
```

**2. Tool names.** One table, used by both sides.

| Tool | Where it runs | What it does | UI |
| --- | --- | --- | --- |
| `getClient` | .NET backend | Loads a client profile from seed data | None |
| `searchExercises` | .NET backend | Finds exercises by pattern, muscle or equipment | None |
| `updateProgram` | Shared state (fallback: frontend tool) | Writes days and exercises into the grid | Program grid |
| `showExerciseCard` | Frontend render | Shows one exercise with sets, reps, RPE and cues | `ExerciseCard` |
| `showWeekSummary` | Frontend render | Shows sets per muscle group for a week | `WeekSummary` |
| `proposeSwap` | Frontend human in the loop | Asks the trainer to approve or reject a swap | `SwapApproval` |

**3. Endpoints and config.**

- Agent endpoints: `/agent/{modelKey}`, one per allowed model.
- Runtime endpoint: `/api/copilotkit` on the Express server in `runtime/src/server.ts`.
- Aspire injects the agent URL into the runtime as `AGENT_URL`. No hard coded ports.
- OpenRouter key: `dotnet user-secrets` in the agent project only. Never in the web app or runtime.

**4. Model allowlist** in `agent/appsettings.json`. Nick fills in the real model ids after testing.

```json
"Models": {
  "quick":    { "label": "Quick",    "modelId": "TODO-provider/model" },
  "thorough": { "label": "Thorough", "modelId": "TODO-provider/model" }
}
```

**5. Theme token names** (values come from the Theme section).

**Done when:** the schema validates the example, the C# records and TypeScript types match it, and `CONTRACTS.md` lists every name above.

## Phase 1: Scaffolding (4 lanes in parallel)

Each lane is one subagent in its own git worktree. Lanes only touch their own folders. Lanes C and D are small and can share one subagent.

### Lane A: .NET agent and Aspire

Folders: `apphost/`, `agent/`, `agent.tests/`

- [ ] Create the Aspire 13 AppHost. Add the agent project, the Vite app (`AddViteApp`) and the Express runtime (`AddJavaScriptApp`), both with `.WithYarn()`. Pass the agent URL to the runtime.
- [ ] Create the .NET 10 agent with Microsoft Agent Framework and the AG-UI hosting package.
- [ ] Point the OpenAI client at OpenRouter. Read the key from user secrets.
- [ ] Loop over the `Models` config and map one AG-UI endpoint per key at `/agent/{key}`.
- [ ] Add `GET /models` that returns `key`, `label` and `modelId`. Never return the API key. The dropdown reads this, so the list lives in one place.
- [ ] Write the coach system prompt. Rules: use the tools, write the program through `updateProgram`, and always call `proposeSwap` before changing a flagged exercise.
- [ ] Add the backend tools `getClient` and `searchExercises` over the seed files.
- [ ] Send all OpenTelemetry to the Aspire dashboard. Use Aspire service defaults, and add Agent Framework's OpenTelemetry to the agent and chat client so each LLM call shows the model, token counts and tool calls. Instrument the Express runtime too, exporting OTLP to the endpoint Aspire injects. Goal: one chat message is one trace, from the runtime request to the OpenRouter call.

**Done when:** `aspire run` starts all three apps, a POST to `/agent/quick` streams AG-UI events, xUnit tests pass for both tools, and one chat message shows up as one trace in the Aspire dashboard.

### Lane B: Vite app and CopilotKit runtime

Folders: `web/` and `runtime/` (except `web/src/styles/`, `web/src/components/ui/` and `web/src/components/genui/`)

- [ ] Create the Vite React app with the CopilotKit v2 provider, and the Express runtime server. Use yarn workspaces.
- [ ] In `runtime/src/server.ts`, mount the CopilotKit runtime at `/api/copilotkit` and register one `HttpAgent` per model key, each pointing at `AGENT_URL/agent/{key}`. Vite proxies `/api/copilotkit` to the runtime in dev.
- [ ] Lay out the page: program grid area on the left, CopilotKit chat on the right.
- [ ] Add the model dropdown. Load options from `/models`. Show each option as the friendly label with the real model in brackets, for example "Quick (provider/model-name)". Show the active model in the chat header too. On change, switch `agentId` and start a fresh thread.
- [ ] Add a client picker loaded from the seed clients.
- [ ] Add a small "Demo only. Not medical advice." note in the footer.

**Done when:** chat streams text from the .NET agent for both models, and switching model clears the thread.

### Lane C: Theme

Folders: `web/src/styles/`, `web/src/components/ui/`

- [ ] Write theme tokens as CSS variables with light and dark values (see Theme section).
- [ ] Wire them into Tailwind. Load the fonts.
- [ ] Build base pieces: Button, Card, Badge, Select, Chip.
- [ ] Add a `/styleguide` page that shows every token and component.

**Done when:** `/styleguide` looks right in light and dark, and no other file hard codes a colour.

### Lane D: Seed data

Folders: `shared/seed/`

- [ ] `exercises.json`: about 40 exercises. Fields: `id`, `name`, `pattern`, `muscles`, `equipment`, `shoulderStress` (low, medium, high), `cues`.
- [ ] `clients.json`: 3 fictional clients. Sarah (strength goal, sore left shoulder), a beginner, and a runner who wants a gym block.
- [ ] A tiny schema for each file, plus a test that the files validate.

**Done when:** both files validate and every client can get a sensible 3 day program from the library.

## Phase 2: Features (2 lanes in parallel)

Starts once Phase 1 is merged and the chat streams end to end. Lane E only needs lanes B and C. Lane F needs A, B and C.

### Lane E: Generative UI components

Folder: `web/src/components/genui/`. All hooks come from `@copilotkit/react-core/v2`. Each component is registered by tool name, so the agent picks it just by calling that tool.

| Component | Tool | Hook | What it shows |
| --- | --- | --- | --- |
| `ExerciseCard` | `showExerciseCard` | `useComponent` or `useRenderTool` | Name, sets x reps at RPE, 2 to 3 coaching cues, a shoulder stress badge |
| `WeekSummary` | `showWeekSummary` | `useRenderTool` | Sets per muscle group as simple bars, with too much or too little marked |
| `SwapApproval` | `proposeSwap` | `useHumanInTheLoop` | Current lift, proposed lift, reason, then Approve and Reject buttons |

- [ ] Each component handles the streaming state (skeleton), the done state, and for `SwapApproval` the answered state.
- [ ] Use theme tokens only. No chart library needed for `WeekSummary`.
- [ ] Add each component to `/styleguide` with mock data so it can be built before the agent calls it.
- [ ] On Approve, the agent must update the grid. On Reject, it keeps the original and says why it flagged it.

**Done when:** asking the agent to "show me Monday" renders cards, and a flagged lift always triggers an approval card.

### Lane F: Program grid with shared state

Folder: `web/src/components/program-grid/` plus agent side state wiring.

- [ ] Build the grid: one row per exercise, one column per day, a week switcher on top.
- [ ] Cells are editable (sets, reps, RPE). Days can be dragged to reorder.
- [ ] Bind the grid to agent state through `useAgent`. Trainer edits write back to that state.
- [ ] Animate cells as the agent fills them. This is the "fills in while they watch" moment.
- [ ] Highlight cells that match `flags` in the program state.
- [ ] Check the current MAF .NET docs for state snapshot and delta support first.
- [ ] **Fallback if .NET state sync is thin:** make `updateProgram` a frontend tool (`useFrontendTool`) that writes React state, and send the current program back to the agent each run with `useAgentContext`. Same demo, simpler wiring.

**Done when:** the agent fills the grid live, and a trainer edit is used by the agent on the next message.

Sources: [CopilotKit hooks](https://docs.copilotkit.ai/concepts/which-hook), [useHumanInTheLoop](https://docs.copilotkit.ai/reference/react-native/hooks/useHumanInTheLoop), [MAF AG-UI integration](https://learn.microsoft.com/en-us/agent-framework/integrations/by-component/ui/ag-ui/)

## Phase 3: Integration and checks (sequential)

The lead agent merges the lanes, then proves the demo works. A separate review agent checks the result.

- [ ] Merge all lanes. Run the whole app with `aspire run`.
- [ ] Add a `replay` model key backed by a fake `IChatClient` that replays a recorded good run. It makes tests repeatable and is your backup if OpenRouter or the wifi dies on demo day.
- [ ] Write a Playwright test of the 6 step demo script against `replay`. Check structure, not exact words: 3 days filled, at least one approval card, grid edit reflected.
- [ ] Write the README: set the OpenRouter key with user secrets, `aspire run`, how to add a model, and the demo script.
- [ ] Start a **separate review subagent** that has not seen the build. It runs the demo, checks every name against `CONTRACTS.md`, confirms the OpenRouter key never reaches the browser bundle, and lists anything broken.
- [ ] Fix what the review finds, then run the Playwright test again.

**Then your part:**

- [ ] Fill in the real model ids and run the demo on each one.
- [ ] Drop any model that fumbles `proposeSwap` or `updateProgram`.
- [ ] Get your PT friend to sanity check two generated programs.

## Theme: "Chalk and steel"

A gym whiteboard feel. Calm neutrals, one loud accent, and a clear colour for anything the agent just touched. The trainer should always see what the AI changed.

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#F7F5F0` | `#141414` | Page background |
| `--surface` | `#FFFFFF` | `#1E1E1E` | Cards, grid cells |
| `--ink` | `#1A1A1A` | `#F2F0EA` | Main text |
| `--ink-muted` | `#5F5E5A` | `#A8A6A0` | Labels, hints |
| `--border` | `#E2DFD6` | `#2E2E2E` | Lines and dividers |
| `--accent` | `#F2600C` | `#FF7A2E` | Buttons, active model, agent activity |
| `--flag` | `#D93636` | `#F06262` | Injury flags, rejected swaps |
| `--ok` | `#2F8F5B` | `#4CC287` | Approved swaps, good volume |

- **Fonts:** Barlow Condensed for headings (gym signage feel), Inter for body. Use tabular numbers for sets, reps and RPE so columns line up.
- **Agent highlight:** a cell the agent just wrote gets an `--accent` tint for about 2 seconds, then fades.
- **Shape:** 10px corners, a 4px spacing scale, thin 1px borders, no shadows.
- **Rule for Claude Code:** components use tokens only. No raw hex values outside `theme.css`.

## Handing it to Claude Code

1. Export this doc as Markdown and save it as `PLAN.md` in an empty repo.
2. Install the CopilotKit skills plugin in Claude Code so it can search live CopilotKit docs.
3. Optional: run `aspire mcp init` later so Claude Code can read Aspire logs and traces.
4. Start Claude Code and paste the prompt below.

```text
Read PLAN.md. You are the lead agent. Run on Opus.

1. Do Phase 0 yourself. Then STOP and show me CONTRACTS.md for review.
2. After I approve, run Phase 1 lanes A to D as parallel subagents.
   Each one works in its own git worktree and only touches its listed folders.
   Merge when every lane meets its "Done when" check.
3. Run Phase 2 lanes E and F in parallel the same way.
4. Do Phase 3 yourself, including the separate review subagent.

Models for subagents:
- Sonnet: lanes A, B, C, E and the Playwright test.
- Haiku: lane D and the README.
- Opus: lane F and the review subagent.
- If a Sonnet or Haiku lane fails its "Done when" check twice, re-run it on Opus.

Rules:
- Follow CONTRACTS.md exactly. If a contract must change, stop and ask me.
- Use CopilotKit v2 APIs only (@copilotkit/react-core/v2).
- CopilotKit, AG-UI and Microsoft Agent Framework are prerelease. Check the live docs
  before using any of their APIs, and pin every version.
- The OpenRouter key stays in .NET user secrets. Never in the web app or git.
- Theme tokens only. No raw colours outside theme.css.
- Keep each lane's summary short: what was built, what was skipped, what to check.
```

The stop after Phase 0 is the important one. Fixing a contract there costs minutes. Fixing it after six agents have built on it costs hours.
