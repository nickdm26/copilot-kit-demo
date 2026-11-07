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
4. Exercise cards and a weekly volume summary appear in the chat.
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

To record a new run:

1. Set a folder to record into: `dotnet user-secrets set "Replay:RecordDirectory" "<folder>" --project agent`
2. Restart the app.
3. Do the demo on a live model, in one thread. Changing the model starts a new thread.
4. Copy the `.json` file written to that folder over `agent/Replay/demo-run.json`.
5. Stop recording: `dotnet user-secrets remove "Replay:RecordDirectory" --project agent`

## Tests

- **Unit and integration (xUnit)**: stop Aspire first (`aspire stop`), since it locks the agent's files. Then run:

  ```powershell
  dotnet test agent.tests
  ```

- **End to end (Playwright)**: with the app running (`aspire run`), point the test at the web URL and run it:

  ```powershell
  $env:BASE_URL="<web url>"; npx playwright test
  ```

  It runs the demo script against the `replay` model.

## Observability

One chat message is one trace in the Aspire dashboard: runtime, then agent, then the model call.

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

## Troubleshooting

- `OpenRouter API key is not configured` in `aspire logs agent`: set the user secret (see Setup).
- `aspire` not found in a fresh shell: reopen the terminal after installing the Aspire CLI.
- Build fails with "file is locked by PtCoach.Agent": run `aspire stop` first.
