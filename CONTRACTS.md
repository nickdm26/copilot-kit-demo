# CONTRACTS.md

The single source of truth for names, shapes, endpoints and versions. Every lane builds against this file.
If something here has to change, **stop and ask Nick**. Do not work around it.

Machine-readable copies, which must stay in step with this file:

| File | Holds |
| --- | --- |
| `shared/program.schema.json` | JSON Schema (2020-12) for the program state, with the canonical example |
| `web/src/lib/contracts.ts` | zod schemas + TS types for state, seed data, tool args, test ids, constants |
| `agent/Models/*.cs` | C# records and enums for the same, plus `ContractJson.Options` |

Verified in Phase 0: the schema validates its example; zod and C# both round-trip it; five bad variants are rejected by both ajv and zod; C# rejects unknown members.

---

## 0. Pinned versions

Pin exact versions (no `^` or `~`). Only bump one with Nick's OK.

| Package | Version | Notes |
| --- | --- | --- |
| .NET SDK | 10.0.101 | `global.json` at repo root |
| Node | 22.x (22.21.1 tested) | |
| yarn | 1.22.22 | classic workspaces |
| `Aspire.AppHost.Sdk` | 13.6.4 | |
| `Aspire.Hosting.JavaScript` | 13.6.4 | `AddViteApp`, `AddJavaScriptApp`, `.WithYarn()` |
| `Aspire.Hosting.Testing` | 13.6.4 | optional, for integration tests |
| `Microsoft.Agents.AI` | 1.28.0 | |
| `Microsoft.Agents.AI.OpenAI` | 1.28.0 | |
| `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore` | 1.28.0-preview.261106.1 | prerelease. Gives `MapAGUIServer`, `AGUIStreamOptions` (via `AGUI.Server` 1.0.0) |
| `Microsoft.Extensions.AI.OpenAI` | 10.11.0 | matches MAF's `Microsoft.Extensions.AI` 10.11.0 |
| `xunit.v3` | 4.0.2 | |
| `@copilotkit/react-core` | 1.85.0 | **import from `@copilotkit/react-core/v2` only** |
| `@copilotkit/runtime` | 1.85.0 | import from `@copilotkit/runtime/v2` and `@copilotkit/runtime/v2/express` |
| `@ag-ui/client` | 1.0.4 | `HttpAgent` |
| `zod` | 3.25.76 | v3 line; CopilotKit's runtime depends on `^3.25` |
| `react`, `react-dom` | 19.1.10 | |
| `vite` | 8.3.6 | |
| `@vitejs/plugin-react` | 6.2.1 | |
| `tailwindcss`, `@tailwindcss/vite` | 4.3.5 | v4, CSS-first config |
| `express` | 5.3.0 | |
| `typescript` | 5.9.3 | **not 7.x** |
| `@playwright/test` | 1.65.0 | |
| `ajv` | 8.20.0 | seed validation test |

The CopilotKit v2 hooks used in this repo, as exported by `@copilotkit/react-core/v2` 1.85.0:
`CopilotKitProvider`, `CopilotChat`, `useAgent`, `useAgentContext`, `useFrontendTool`, `useHumanInTheLoop`, `useRenderTool`, `useComponent`.
Hook `parameters` take a Standard Schema, so pass the zod schemas from `contracts.ts`.

---

## 1. Program state (the shared state)

The AG-UI agent state **is** a `ProgramState` object (no wrapper key).

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

| Field | Type | Rule |
| --- | --- | --- |
| `clientId` | id | kebab-case, matches a seed client id |
| `goal` | enum | `strength`, `hypertrophy`, `general`, `endurance-support` |
| `daysPerWeek` | int | 1 to 6 |
| `weeks[].week` | int | 1 to 12, unique, weeks sorted ascending |
| `weeks[].days[].day` | enum | `Mon` `Tue` `Wed` `Thu` `Fri` `Sat` `Sun`, unique within a week |
| `weeks[].days[]` order | | array order is display order |
| `focus` | string | at most 40 chars, e.g. "Lower", "Upper", "Full body" |
| `exercises[]` | | at most 10 per day; array order is row order |
| `exerciseId` | id | must exist in `shared/seed/exercises.json` |
| `sets` | int | 1 to 10 |
| `reps` | string | `"5"`, `"8-10"` or `"30s"` (regex `^[0-9]{1,2}(-[0-9]{1,2}|s)?$`) |
| `rpe` | number | 5 to 10 in steps of 0.5 |
| `note` | string | at most 140 chars, `""` when empty (always present) |
| `flags[]` | | `{ exerciseId, reason }`. A flagged exercise is highlighted wherever it appears |

Empty state, before the agent writes anything: `{ clientId, goal, daysPerWeek, weeks: [], flags: [] }`
(`emptyProgram()` in TS, `ProgramState.Empty()` in C#).

### 1a. Update semantics (`applyUpdate`)

Used by `updateProgram` on both sides (C# `ProgramUpdater` in the agent, and `applyUpdate.ts` in the grid for the fallback and for trainer edits). Steps, in order:

1. `clientId`, `goal`, `daysPerWeek`: overwrite when present.
2. `removeDays`: delete each matching `(week, day)`. Drop a week left with no days.
3. `days`: for each item, find the week (create it if missing, keep weeks sorted). Find the day by name: replace it in place if found, else append it.
4. `flags`: when present, replace the whole list.
5. Return the complete new state.

### 1b. Trainer edits

- **Cell edit** (sets, reps, RPE): change that entry, then write the full state back.
- **Day drag**: the day slots keep their labels in their original order. Only the content (`focus` + `exercises`) moves. Example: dragging the Wed content onto Mon in a Mon/Wed/Fri week swaps the two contents, and the labels stay Mon/Wed/Fri.
- Every edit sets the agent state, so the next run sends it to the agent (see section 9).

---

## 2. Seed data

Files: `shared/seed/exercises.json` (array of `Exercise`, about 40) and `shared/seed/clients.json` (array of `Client`, exactly 3). Lane D writes a JSON Schema for each (`shared/seed/exercises.schema.json`, `shared/seed/clients.schema.json`) matching the shapes below.

**Exercise**

| Field | Type |
| --- | --- |
| `id` | kebab-case id, unique |
| `name` | string, at most 60 chars |
| `pattern` | `squat` `hinge` `lunge` `horizontal-push` `vertical-push` `horizontal-pull` `vertical-pull` `carry` `core` `isolation` |
| `muscles` | 1 to 4 of `chest` `back` `shoulders` `biceps` `triceps` `quads` `hamstrings` `glutes` `calves` `core`. **First is primary** |
| `equipment` | 1 or more of `barbell` `dumbbell` `kettlebell` `cable` `machine` `bodyweight` `band` `trap-bar` |
| `shoulderStress` | `low` `medium` `high` |
| `cues` | 2 or 3 strings, at most 80 chars each |

Required exercise ids (the replay run and tests use them): `back-squat`, `goblet-squat`, `trap-bar-deadlift`, `romanian-deadlift`, `split-squat`, `hip-thrust`, `bench-press` (medium), `overhead-press` (high), `landmine-press` (medium), `dumbbell-floor-press` (low), `push-up` (medium), `barbell-row`, `chest-supported-row` (low), `lat-pulldown`, `face-pull` (low), `plank`, `dead-bug`, `farmer-carry`.
Every `vertical-push` and every `high` exercise must have at least one `low` or `medium` alternative with the same pattern or primary muscle.

**Client**

| Field | Type |
| --- | --- |
| `id` | kebab-case id |
| `name` | string, at most 40 chars |
| `age` | int 16 to 90 |
| `goal` | goal enum |
| `experience` | `beginner` `intermediate` `advanced` |
| `daysPerWeek` | int 1 to 6 |
| `equipment` | equipment enum list |
| `injuries` | list of `{ area, side?, severity, note }`. `area`: `shoulder` `knee` `lower-back` `hip` `ankle` `elbow` `wrist`. `side`: `left` `right` `both`. `severity`: `mild` `moderate` |
| `notes` | string, at most 280 chars |

Client ids: `sarah` (strength, intermediate, 3 days, mild left shoulder injury), `tom` (beginner, general, 3 days, no injuries), `priya` (runner, endurance-support, 2 to 3 days). All fictional.

The web app imports seed files read-only through a Vite alias `@seed` → `../shared/seed`. The agent copies them to its output directory and loads them at startup.

---

## 3. Tools

| Tool | Runs | Args (see `contracts.ts`) | Returns | UI | Hook |
| --- | --- | --- | --- | --- | --- |
| `getClient` | .NET backend | `{ clientId }` | `Client` JSON, or an error string for an unknown id | none | |
| `searchExercises` | .NET backend | `{ query?, pattern?, muscle?, equipment?, maxShoulderStress? }`, filters AND-ed, `query` matches name/id case-insensitively | `Exercise[]`, at most 10 | none | |
| `updateProgram` | .NET backend, result mapped to `STATE_SNAPSHOT` (fallback: frontend tool) | `{ clientId?, goal?, daysPerWeek?, days?: [{ week, day, focus, exercises }], removeDays?: [{ week, day }], flags? }` | the full `ProgramState` | program grid | `useAgent` (fallback: `useFrontendTool`) |
| `showExerciseCard` | frontend render | `{ exerciseId, sets, reps, rpe, week?, day?, note? }` | n/a | `ExerciseCard` | `useFrontendTool` (`followUp: false`, render) |
| `showWeekSummary` | frontend render | `{ week, note? }` | n/a | `WeekSummary` | `useFrontendTool` (`followUp: true`, render: the agent keeps building after each week) |
| `proposeSwap` | frontend human in the loop | `{ fromExerciseId, toExerciseId, reason, week?, day? }` (no week and no day means every occurrence) | `{ approved, fromExerciseId, toExerciseId }` via `respond()` | `SwapApproval` | `useHumanInTheLoop` |

- Why `useFrontendTool` for the two render tools: in CopilotKit 1.85.0 `useRenderTool` never sends the tool definition to the model, and `useComponent` gives its render no status (so no streaming skeleton).
- `ExerciseCard` looks up name, cues and `shoulderStress` from the seed library by `exerciseId`. The agent never sends cue text.
- `WeekSummary` computes sets per muscle for `week` from the current program state: each set counts **1.0** for the primary muscle and **0.5** for each other muscle. A muscle with sets > 0 is "too little" below **4** and "too much" above **16** (`VOLUME_WEIGHTS`, `VOLUME_RANGE`).
- Tool names are camelCase exactly as above, on every side. C# constants: `ToolNames.*`. TS constants: `TOOLS.*`.

---

## 4. Agent behaviour rules (system prompt)

1. Call `getClient` before planning for a client. Use only exercise ids that `searchExercises` returned.
2. Write the program only through `updateProgram`. Never paste the program as text.
3. Fill it day by day: one `updateProgram` call per day of week 1, then one call per later week (all its days in one call).
4. A **shoulder-risky lift** is any exercise with `shoulderStress: "high"` for a client with a shoulder injury. When one is in the program, add it to `flags` and call `proposeSwap` with a `low` or `medium` alternative **before** changing it.
5. On approve: `updateProgram` with the swapped exercise in every affected day, and remove that flag. On reject: keep the original and the flag, and say in one sentence why it was flagged.
6. After writing a week, call `showWeekSummary` for it. Use `showExerciseCard` when the trainer asks about a lift or a day.
7. Treat the program state sent by the client as the truth. The trainer may have edited it. Rebalance from it; never revert trainer edits without saying so.
8. Keep chat text short. The grid and the cards carry the detail.

---

## 5. Apps, endpoints, config, secrets

**Aspire resources** (names are also OpenTelemetry service names): `agent` (.NET project), `runtime` (`AddJavaScriptApp`, `.WithYarn()`), `web` (`AddViteApp`, `.WithYarn()`).

| App | Endpoint | What |
| --- | --- | --- |
| agent | `POST /agent/{modelKey}` | AG-UI endpoint via `MapAGUIServer`, one per key in `Models` |
| agent | `GET /models` | `[{ key, label, modelId }]` in config order. Never secrets |
| agent | `GET /health`, `GET /alive` | Aspire service defaults |
| runtime | `POST /api/copilotkit` (and its sub-routes) | CopilotKit runtime, `@copilotkit/runtime/v2/express` |
| web | `/api/copilotkit` | Vite dev proxy → `${RUNTIME_URL}/api/copilotkit` |
| web | `/api/models` | Vite dev proxy → `${AGENT_URL}/models` |

**Environment variables** (Aspire injects them; no hard-coded ports anywhere):

| Var | Set on | Value |
| --- | --- | --- |
| `AGENT_URL` | runtime, web | agent http endpoint, no trailing slash |
| `RUNTIME_URL` | web | runtime http endpoint |
| `PORT` | runtime | the port it must listen on |
| `OTEL_EXPORTER_OTLP_ENDPOINT` etc. | all | Aspire standard |

**Runtime agents.** At startup the runtime fetches `${AGENT_URL}/models` and registers one `HttpAgent` per entry: agent id = `key`, url = `${AGENT_URL}/agent/${key}`. The CopilotKit `agentId` is therefore always the model key.

**Browser.** `CopilotKitProvider runtimeUrl="/api/copilotkit"`. The browser only talks to its own origin. Changing the model or the client starts a new thread (fresh `threadId`) and resets the grid to `emptyProgram(clientId)`.

**Secrets.** The OpenRouter key lives only in the agent project's user secrets:

```powershell
dotnet user-secrets set "OpenRouter:ApiKey" "<key>" --project agent
```

It never appears in `appsettings*.json`, the runtime, the web app, Aspire parameters, logs or traces. `OpenRouter:BaseUrl` is `https://openrouter.ai/api/v1` in `agent/appsettings.json`.

---

## 6. Model allowlist

In `agent/appsettings.json`. Ids chosen by Nick (all three support tool calling on OpenRouter). Keys are config-driven: no code may hard-code them except tests, which set their own.

```json
"Models": {
  "deepseek": { "label": "DeepSeek", "modelId": "deepseek/deepseek-v4.1-flash-1017" },
  "qwen": { "label": "Qwen", "modelId": "qwen/qwen3.8-flash" },
  "glm": { "label": "GLM", "modelId": "z-ai/glm-5.3-flash" },
  "replay": { "label": "Replay", "modelId": "recorded/demo-run" }
}
```

- Key: lowercase, `^[a-z][a-z0-9-]*$`. It is the URL segment, the CopilotKit agent id and the dropdown value.
- Dropdown text and chat header text: `"{label} ({modelId})"`, e.g. "Qwen (qwen/qwen3.8-flash)" (`modelDisplayName()`).
- **Reserved key `replay`**: backed by `ReplayChatClient`, which plays `agent/Replay/demo-run.json` turn by turn per thread (backend tools still run). No network call, no key. Record a new run by setting `Replay:RecordDirectory` (see README).

---

## 7. Test ids

Playwright depends on these `data-testid` values (`TEST_IDS` in `contracts.ts`). Data attributes are part of the contract.

| `data-testid` | Element | Data attributes |
| --- | --- | --- |
| `model-select` | model dropdown | |
| `active-model` | model name in the chat header | |
| `client-select` | client picker | |
| `chat` | chat panel root | |
| `disclaimer` | footer note "Demo only. Not medical advice." | |
| `program-grid` | grid root | `data-week` = selected week |
| `grid-week-tab` | each week switcher button | `data-week`, `aria-selected` |
| `grid-day` | each day column header (drag handle) | `data-week`, `data-day` |
| `grid-cell` | each exercise cell | `data-week`, `data-day`, `data-index`, `data-exercise-id`, `data-flagged` (`true`/`false`), `data-agent-touched` (`true` while highlighted). Editable inputs inside carry `data-field` = `sets`, `reps` or `rpe` |
| `exercise-card` | `ExerciseCard` root | `data-exercise-id`, `data-state` = `streaming`/`done` |
| `week-summary` | `WeekSummary` root | `data-week`, `data-state` = `streaming`/`done` |
| `swap-approval` | `SwapApproval` root | `data-state` = `streaming`/`pending`/`approved`/`rejected` |
| `swap-approve`, `swap-reject` | its two buttons | |

---

## 8. Theme tokens ("Chalk and steel")

Defined once in `web/src/styles/theme.css`. **No raw colour values anywhere else.**

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--bg` | `#F7F5F0` | `#141414` | page background |
| `--surface` | `#FFFFFF` | `#1E1E1E` | cards, grid cells |
| `--ink` | `#1A1A1A` | `#F2F0EA` | main text |
| `--ink-muted` | `#5F5E5A` | `#A8A6A0` | labels, hints |
| `--border` | `#E2DFD6` | `#2E2E2E` | lines, dividers |
| `--accent` | `#F2600C` | `#FF7A2E` | buttons, active model, agent activity |
| `--flag` | `#D93636` | `#F06262` | injury flags, rejected swaps |
| `--ok` | `#2F8F5B` | `#4CC287` | approved swaps, good volume |

Non-colour tokens: `--radius: 10px`, `--space: 4px` (spacing scale is multiples of it), `--font-heading: "Barlow Condensed"`, `--font-body: "Inter"`.

- Tailwind v4 colour names map 1:1: `bg`, `surface`, `ink`, `ink-muted`, `border`, `accent`, `flag`, `ok` (e.g. `bg-surface`, `text-ink-muted`, `border-border`).
- Derived tokens (in `theme.css` only, with Tailwind names): `accent-tint`, `flag-tint`, `ok-tint`, `accent-strong`, `flag-strong` (hover shades), `on-fill` (text on an accent/flag/ok fill).
- **Inside the chat, CopilotKit redefines `--accent`, `--border` and `--radius`.** Components that render in the chat (all of `genui/`) must use the Tailwind utilities (`bg-accent`, `border-border`, `rounded-md`) or the `--color-*` variables, never raw `var(--accent)` / `var(--border)` / `var(--radius)`.
- Dark mode follows `prefers-color-scheme`; `<html data-theme="light|dark">` overrides it.
- Tints are derived with `color-mix()` inside `theme.css` only (e.g. `--accent-tint`).
- Agent highlight: a cell the agent just wrote gets an `--accent` tint for about 2 s, then fades (class `agent-touched`).
- 1px borders, no shadows, tabular numbers (`font-variant-numeric: tabular-nums`) for sets, reps and RPE.

---

## 9. Shared state wiring

Checked against the MAF .NET docs (AG-UI state management page, updated 2026-10-28). .NET supports reading client state and emitting `STATE_SNAPSHOT`/`STATE_DELTA`. State mapping is opt-in. **So Plan A is the primary path.**

**Plan A: shared state (primary)**

- Agent: a `DelegatingAIAgent` reads `RunAgentInput.State` with `ChatOptions.TryGetRunAgentInput(...)`, validates it as `ProgramState` (untrusted input), and adds it to the model context as a system message.
- Agent: `updateProgram` is a backend `AIFunction`. It applies section 1a to a per-run working copy (seeded from the request state, else `ProgramState.Empty`) and returns the full state as a `JsonElement`.
- Agent: `app.MapAGUIServer($"/agent/{key}", agent).WithMetadata(new AGUIStreamOptions().MapResultAsStateSnapshot("updateProgram"))`.
- Web: the grid reads `agent.state` from `useAgent({ agentId })` and writes trainer edits with `agent.setState(next)`.

**Plan B: frontend tool (fallback, only if Plan A fails in practice)**

- `updateProgram` becomes `useFrontendTool` with `UpdateProgramArgsSchema`. The handler applies section 1a to React state and returns the full state JSON.
- The current program goes to the agent every run via `useAgentContext({ description: "Current program state (ProgramState JSON)", value })`.
- Same tool name, same args, same returns. Switching plans changes no contract. Lane F records which plan shipped in its summary.

---

## 10. Ownership

| Lane | Owns | Model |
| --- | --- | --- |
| Phase 0 (lead) | `CLAUDE.md`, `CONTRACTS.md`, `PLAN.md`, root `package.json`, `.gitignore`, `shared/program.schema.json`, `web/src/lib/contracts.ts`, `agent/Models/*.cs`, `agent/appsettings.json` (Models block) | Opus |
| A | `apphost/`, `agent/` (except `Models/`), `agent.tests/`, `global.json`, solution file | Sonnet |
| B | `web/`, `runtime/` except `web/src/styles/`, `web/src/components/ui/`, `web/src/components/genui/`, `web/src/components/program-grid/`, `web/src/lib/contracts.ts` | Sonnet |
| C | `web/src/styles/`, `web/src/components/ui/` (incl. `Styleguide.tsx`, mounted by B at `/styleguide`) | Sonnet |
| D | `shared/seed/` | Haiku |
| E | `web/src/components/genui/` (and adds its components to `Styleguide.tsx`) | Sonnet |
| F | `web/src/components/program-grid/`, plus the agent's state wiring files | Opus |
| Phase 3 | `e2e/`, `README.md`, the `replay` client | lead / Sonnet / Haiku |

Lanes C and B meet at `/styleguide`: C exports `web/src/components/ui/Styleguide.tsx` (default export). B renders it when `location.pathname === "/styleguide"`. No router.
