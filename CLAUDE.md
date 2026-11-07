# CLAUDE.md

PT Coach demo: a personal trainer and an AI coach build a training program together on one screen.
It shows off CopilotKit + AG-UI with a .NET 10 Microsoft Agent Framework agent. Plan: `PLAN.md`. Names and shapes: `CONTRACTS.md`.

## Rules

- **`CONTRACTS.md` is law.** Use its names, shapes, endpoints, env vars, test ids and versions exactly. If a contract must change, stop and ask Nick. Don't invent a local variant.
- **Stay in your lane.** Only touch the folders your lane owns (`CONTRACTS.md` section 10). Need something outside them? Say so in your summary instead.
- **Scope = the 60 second demo script** in `PLAN.md`. If a feature doesn't help the script, don't build it.
- **CopilotKit v2 only**: import from `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2`. Never the v1 root imports (`useCopilotAction`, `useCopilotReadable`, `CopilotKit` from the root entry, etc.).
- **Prerelease libraries** (CopilotKit, AG-UI, Microsoft Agent Framework): check the live docs or the installed `.d.ts`/XML docs before using an API. Don't guess from memory. Pin exact versions from `CONTRACTS.md` section 0.
- **Secrets**: the OpenRouter key lives only in the agent's .NET user secrets (`OpenRouter:ApiKey`). Never in `appsettings*.json`, the web app, the runtime, env files, logs, traces or git.
- **Theme tokens only.** No raw colour values (hex, rgb, hsl, named colours) outside `web/src/styles/theme.css`.
- **No hard-coded ports or URLs** between apps. Aspire injects `AGENT_URL`, `RUNTIME_URL` and `PORT`.
- Shared types: TS imports from `web/src/lib/contracts.ts`; C# uses `agent/Models/*` with `ContractJson.Options`. Don't redeclare them.

## Commands

```powershell
aspire run                      # start agent, runtime and web together (from repo root)
dotnet run --project agent.tests  # xUnit (46 tests; stop Aspire first)
yarn install                    # web + runtime workspaces
yarn workspace web dev          # web alone (needs RUNTIME_URL and AGENT_URL)
npx playwright test             # e2e demo script (Phase 3, against the replay model)
dotnet user-secrets set "OpenRouter:ApiKey" "<key>" --project agent
```

## Lane summaries

Keep them short: what was built, what was skipped, what to check. Say how you checked each "Done when" item.
