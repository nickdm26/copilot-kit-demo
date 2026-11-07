# Handoff: PT Coach demo build

Written 2026-11-07 by the lead agent (Opus) when the session budget ran low. Read `CLAUDE.md`, `PLAN.md` and `CONTRACTS.md` first.

## Where we are

| Phase | Status |
| --- | --- |
| 0 Contracts | Done, approved by Nick |
| 1 Lanes A–D | Done, merged |
| 2 Lanes E, F | Done, merged; integration fixes committed |
| 3 Integration | **Done.** Open review items are listed under "Phase 3 status" |

**Nick has a VS Code session improving the UI for mobile.** It has uncommitted changes in `web/` (App.tsx, ProgramGrid.tsx). Don't edit `web/` while it is active, and stage commits by path only, never `git add -A`.

The replay model passes the same demo driver with no errors.

**The live demo works.** In the real UI, all three models (DeepSeek, GLM, Qwen) completed all 6 steps of the demo script (`lead-demo.mjs`, last full pass at commit `587cdaa`): the grid fills day by day across 4 weeks, overhead press is flagged and a swap card appears, Approve swaps every occurrence and clears the flag, an edit plus a drag followed by "rebalance" changes week 1 while keeping the edits, and "show me Monday" renders exercise cards. There were no run errors and no console errors.

## Contract changes Nick approved

- Section 6: three real models, `deepseek`, `qwen` and `glm` (OpenRouter ids are in `agent/appsettings.json`).
- Section 3: `showExerciseCard` and `showWeekSummary` use `useFrontendTool` (`useRenderTool` never sends the tool to the model, and `useComponent` has no streaming status). `showWeekSummary` is `followUp: true` so the agent keeps building after each week; `showExerciseCard` is `followUp: false`.

## Key fixes made during integration (all committed)

- **Approve crashed the run** (`ToolApprovalRequestContent ... no matching ToolApprovalResponseContent`). Fix: `DisableApprovalResponseBinding = true` in `CoachAgentBuilder`. MAF only honours approvals recorded in a server-side session, but CopilotKit replays the full history every run. A session store did *not* fix it (tried and reverted).
- **`builder.Services.AddAGUIServer()` was missing.** Without it, args on the approval path serialized as `{}`, and RUN_ERROR `usage.provider: null` broke CopilotKit's parsing.
- OpenRouter network timeout raised to 5 min, because GLM's builds take about 2 minutes.
- Prompt: "write every requested week before you finish" (GLM was stopping after week 1) and "pass week as a number" (Qwen sent `"2"`).
- WeekSummary/ExerciseCard: a string `week` is coerced, and a finished call with no args renders nothing. Some models still occasionally produce `{}` calls on the approval path; they're now hidden.

## Replay model (done, commit c3d49bd)

- `agent/Chat/Replay.cs`: `ReplayChatClient` plays `agent/Replay/demo-run.json` per AG-UI thread, and `RecordingChatClient` is on when `Replay:RecordDirectory` is set (it saves in `finally`).
- The recording is GLM's run of the demo script. Four `showWeekSummary` calls lost by the earlier recorder bug were filled in by hand (turns 10, 12, 14 and 18).
- The temporary `Replay:RecordDirectory` user secret has been **removed**.
- 4 xUnit tests cover it, for 46 tests in total. The full solution builds with warnings as errors, after fixing xUnit1051 in AgentHostTests.

## Phase 3 status

All Phase 3 tasks are done: the replay model, the Playwright e2e (`e2e/demo.spec.ts`), the README, the independent review, and fixes for the review findings (`c089fb7`). After the fixes, `dotnet test` passes 46/46 and `npx playwright test` passes in about 34 s.

**Review findings still open (need Nick or the VS Code mobile session):**
1. **The page grows with the chat, so the grid scrolls out of view.** `web/src/App.tsx` uses `min-h-screen`. Make the root `h-screen overflow-hidden` and let the grid and chat columns scroll on their own. This is in App.tsx, which the mobile session is editing.
2. **A trainer edit made while the agent is running is lost.** The run's working copy overwrites it. Disable the grid inputs and drag while the agent is running (`ProgramGrid.tsx` inputs; `isRunning` in `useProgramState.ts`). This is in ProgramGrid.tsx, which the mobile session is editing.
3. **`@ag-ui/client` is installed twice.** The contract pins 1.0.4, but CopilotKit 1.85.0 pins 1.0.2 exactly, so the runtime mixes two versions. Recommended: change the contract and `runtime/package.json` to 1.0.2. **Needs Nick (contract change).**
4. **Vite listens on the LAN** (`host: true` in `web/vite.config.ts`), and the runtime listens on all interfaces. People on the same Wi-Fi could start paid runs. This may be wanted for testing on a phone. **Ask Nick.**
5. Optional: re-record Replay from a run where the overhead press is written and flagged before `proposeSwap`, so the flag highlight shows on Replay.
6. Optional: set `TypeInfoResolver = new DefaultJsonTypeInfoResolver()` on `ContractJson.Options` and drop the two private `ToolJson` copies. The resolver is still needed: the review confirmed that removing it breaks `AIFunctionFactory.Create`.
7. Nits: tool-only chat messages show empty copy-button rows; old week summary cards recompute after edits; the zod schema doesn't enforce unique or sorted weeks (the C# validator does); `global.json` allows SDK roll-forward.

## Open items and notes

- **CopilotKit telemetry** sends to `telemetry.copilotkit.ai` about 3 times per request. Recommended: set `COPILOTKIT_TELEMETRY_DISABLED=true` on the runtime in the AppHost. **Waiting on Nick's answer.**
- The model dropdown sorts alphabetically (.NET config sorts keys). An explicit order is optional and was offered to Nick.
- No model picks a shoulder-risky lift by itself, so the demo prompt asks for overhead press explicitly ("She wants overhead press in there"). Use that wording live.
- Sometimes approval-path tool calls still arrive with `{}` args. The root cause is not fully understood; it's MAF wrapping client tools as approval requests. The UI hides those calls. Worth a look in the review.
- The review should also look at lane A's `ToolJson` resolver workaround in `CoachTools.cs`, which may be unnecessary now that `AddAGUIServer()` is registered.
- Two stray lane C `vite preview` processes (port 5198) may still be running; they're harmless.
- Old lane worktrees under `.claude/worktrees/` can be removed with `git worktree remove`; the lane B one is locked.
- Aspire may still be running detached: `aspire stop --apphost apphost`. In a fresh PowerShell, refresh PATH first if `aspire` isn't found.
- Network blips (DNS `No such host is known`) caused a couple of failed runs. Those failures aren't bugs in the app.

## Verification commands

```powershell
dotnet test                       # 46 tests at last commit (stop Aspire first: it locks agent DLLs)
yarn workspace web typecheck
yarn workspace web build
grep -rnE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(' web/src --include=*.ts --include=*.tsx   # must be empty
```
