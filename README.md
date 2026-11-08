# PT Coach demo

A personal trainer and an AI coach build a training program together on one screen. The trainer types a request, the agent fills in the program grid live, flags risky lifts and asks for approval, then rebalances the week when the trainer edits it.

It shows CopilotKit v2 and AG-UI with a .NET 10 Microsoft Agent Framework agent. Aspire 13 starts the three apps, and models are called through OpenRouter.

> Demo only. Not medical advice.

## Prerequisites

- .NET SDK 10.0.101 (pinned in `global.json`)
- Node 22 or newer
- Yarn 1.22.22
- The Aspire CLI
- An OpenRouter API key
- Trust the dev certificate once. The Aspire dashboard and `aspire otel` need it:

```powershell
dotnet dev-certs https --trust
```

## Setup

```powershell
yarn install
dotnet user-secrets set "OpenRouter:ApiKey" "<key>" --project agent
```

The key lives only in the agent's user secrets. It never goes in `appsettings*.json`, the web app, the runtime or git.

## Run

From the repo root:

```powershell
aspire run
```

Open the `web` URL shown in the Aspire dashboard.

- **agent**: .NET AG-UI server. Runs the model calls and the program tools.
- **runtime**: Express server with the CopilotKit runtime. Connects the browser to the agent.
- **web**: Vite React app. The trainer's screen.

## The 60-second demo script

1. Pick a model from the dropdown.
2. Type: "4 week strength block for Sarah, 3 days a week, sore left shoulder. She wants overhead press in there." Models avoid overhead press on their own, so asking for it reliably triggers the swap card.
3. Watch the program grid fill in day by day.
4. A weekly volume summary appears in the chat after each week. Ask "Show me Monday" to get exercise cards.
5. The agent flags the shoulder-risky lifts and asks to swap them. Tap Approve or Reject.
6. Edit a cell (sets, reps or RPE) or drag a day header, then ask: "Rebalance week 1 around my edits."

## Models

The allowlist is in `agent/appsettings.json` under `Models`:

```json
"Models": {
  "deepseek": { "label": "DeepSeek", "modelId": "deepseek/deepseek-v4.1-flash-1017" },
  "qwen": { "label": "Qwen", "modelId": "qwen/qwen3.8-flash" },
  "glm": { "label": "GLM", "modelId": "z-ai/glm-5.3-flash" },
  "replay": { "label": "Replay", "modelId": "recorded/demo-run" }
}
```

To add a model:

1. Add an entry with a lowercase key (`^[a-z][a-z0-9-]*$`), a `label`, and an OpenRouter `modelId` that supports tool calling.
2. Restart the app.

The dropdown shows `{label} ({modelId})`. The `replay` key is reserved for the offline model below.

## Replay mode (offline backup)

Pick **Replay** in the dropdown. It plays back a recorded good run from `agent/Replay/demo-run.json` with no network and no key, as long as you follow the demo script in order.

The recording only has the Approve branch: on Replay, tap **Approve** (Reject still shows "Rejected", but the recording carries on as if approved). The swap card appears before the grid fills, so the red flag highlight does not show on Replay.

To record a new run:

1. Set a folder to record into: `dotnet user-secrets set "Replay:RecordDirectory" "<folder>" --project agent`
2. Restart the app.
3. Do the demo on a live model, in one thread. Changing the model starts a new thread.
4. Copy the `.json` file written to that folder over `agent/Replay/demo-run.json`.
5. Stop recording: `dotnet user-secrets remove "Replay:RecordDirectory" --project agent`

## Tests

- **Unit and integration (xUnit)**: stop Aspire first (`aspire stop`), since it locks the agent's files. Then run:

  ```powershell
  dotnet test
  ```

- **End to end (Playwright)**: with the app running (`aspire run`), point the test at the web URL and run it:

  ```powershell
  $env:BASE_URL="<web url>"; npx playwright test
  ```

  It runs the demo script against the `replay` model, with and without parallel sub-agents.

## Parallel sub-agents (for the engineers in the room)

Overkill for a PT app, but it shows how an agent hands work to sub-agents running in parallel, the way a coding agent does. Switch **Sub-agents** on in the chat header (or open the app with `?subagents`), then ask for a block as usual:

1. The coach fans week 1 out in one tool call: a **day-builder** per training day plus an **injury-screen**. Each one is its own Agent Framework agent with its own prompt and tools, and they run at the same time.
2. The grid's columns appear at once and fill side by side. In the chat, a **Sub-agents** card shows one lane per sub-agent on a shared timeline, with a live clock and the parallel speed-up. Open a lane to see its brief, every tool call it made and what it said.
3. The coach flags the risky lift the builders wrote and asks you about the swap. After you answer, it fans weeks 2 to 4 out to three **week-builders**.

What's under the hood:

- It is AG-UI 1.0's subagent support end to end: `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` / `SUBAGENT_ERROR`, plus a `subagentRunId` on everything a sub-agent sends, emitted by the .NET agent through `AGUIStreamOptions.MapContent` while the coach's tool call is still open. Open `?subagents&inspector` to watch the events go by.
- Each sub-agent can only write its own day or week, a limit set by its tool rather than its prompt, so they can't overwrite each other.
- In the Aspire dashboard the sub-agents' `invoke_agent` spans sit side by side under the coach's `runSubagents` span.
- On **Replay** it plays `agent/Replay/demo-run-parallel.json` (generated by hand, Approve branch only).

The wire format and rules are in `CONTRACTS.md` section 11.

## Observability

Each agent run is one trace in the Aspire dashboard, from the runtime through the agent to the model call. One chat message can start several runs, because the agent keeps going after a card or a swap answer.

### Reasoning ("Thought for…")

The configured OpenRouter models stream their reasoning, and the chat shows it as a collapsible **Thought for…** block above each answer. `agent/Chat/ReasoningChatClient.cs` is what makes that work: `Microsoft.Extensions.AI.OpenAI` 10.11.0 only reads `delta.reasoning_content`, while OpenRouter sends `delta.reasoning`, so the client copies the field across as `TextReasoningContent` and the AG-UI host turns it into `REASONING_*` events.

Two details worth knowing before changing it:

- OpenRouter sends `"content": ""` on every reasoning chunk. Left in, the AG-UI host treats it as text and closes the reasoning block, so the chat shows one block per token. The client drops empty text parts.
- Reasoning is display-only and is **not** sent back to the agent: `MapChatRole` in AGUI.Abstractions 1.0.0 has no `reasoning` case, so replaying a thread containing one fails the next run with `Unknown chat role: reasoning`. `App.tsx` filters them out of the request with CopilotKit's `messageFilter`, which leaves the on-screen transcript alone.

### CopilotKit Web Inspector

Append `?inspector` to the web URL to mount CopilotKit's Web Inspector: AG-UI event stream, agent state, tool calls, and the reasoning events above. It is opt-in because its floating launcher sits above the page and swallows clicks on whatever is under it.

It only appears when Vite runs with `NODE_ENV=development`, which the AppHost pins for the web resource. Without that, Aspire would pass `production` (it derives `NODE_ENV` from the AppHost's own environment, and `aspire run` starts the AppHost without a launch profile), and CopilotKit would never mount the inspector.

## Repo layout

```text
apphost/            Aspire AppHost: starts agent, runtime and web
agent/              .NET 10 AG-UI agent (Microsoft Agent Framework), model allowlist, replay
agent.tests/        xUnit tests for the agent
servicedefaults/    Shared Aspire service defaults
runtime/            Express server with the CopilotKit runtime
web/                Vite + React app: the trainer's screen
shared/             Program schema and seed data (exercises, clients)
e2e/                Playwright test of the demo script
```

Planning and status docs live alongside this one: `PLAN.md`, `CONTRACTS.md` (the authoritative
shapes and names), `HANDOFF.md`, `AUDIT.md`, `ORCHESTRATOR_REPORT.md`, and `SESSION_NOTES.md`
(why reasoning, the inspector and subagents are the way they are, with the evidence).

## Troubleshooting

- `OpenRouter API key is not configured` in `aspire logs agent`: set the user secret (see Setup).
- `aspire` not found in a fresh shell: reopen the terminal after installing the Aspire CLI.
- Build fails with "file is locked by PtCoach.Agent": run `aspire stop` first.
