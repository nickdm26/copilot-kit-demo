# API notes

Short, verified facts about the prerelease libraries, so agents don't rediscover them.
One line per fact. Note the version it was checked against. `CONTRACTS.md` wins on any conflict.

Seeded 2026-11-08 from `SESSION_NOTES.md`, checked against: `@copilotkit/react-core` 1.85.0,
`@copilotkit/web-inspector` 1.85.0, `Microsoft.Agents.AI.Hosting.AGUI.AspNetCore`
1.28.0-preview.261106.1 (brings `AGUI.Server` and `AGUI.Abstractions` 1.0.0),
`Microsoft.Extensions.AI.OpenAI` 10.11.0, Vite 8.3.6.

## CopilotKit web inspector
- Mounted by `CopilotKitProvider`. Gate is in `@copilotkit/react-core/dist/copilotkit-*.mjs` (`shouldEnableInspector`).
- Needs `process.env.NODE_ENV === "development"` **and** a localhost hostname. `enableInspector` can only disable it, never force it on.
- Has no subagent view (zero `subagent` references in `@copilotkit/web-inspector`).

## Aspire and Vite
- `aspire run` starts the AppHost exe directly and ignores `launchSettings.json`, so `DOTNET_ENVIRONMENT` is unset.
- `AddViteApp` → `WithNodeDefaults()` sets `NODE_ENV=production` unless pinned on the resource.
- Vite bakes `NODE_ENV` into `node_modules/.vite/deps` at optimize time. Deleting the cache re-bakes the same value.

## Reasoning
- OpenRouter streams reasoning as `choices[0].delta.reasoning`. `Microsoft.Extensions.AI.OpenAI` 10.11.0 only reads `reasoning_content`, so it drops it. Bridged by `agent/Chat/ReasoningChatClient.cs`.
- `AGUI.Server` 1.0.0 maps `TextReasoningContent` to `REASONING_*` events (`ReasoningMessageTracker`).

## Subagents
- `AGUI.Abstractions` 1.0.0 defines `SubagentStartedEvent` / `SubagentFinishedEvent` / `SubagentErrorEvent`. `@ag-ui/core` and `@ag-ui/client` handle `SUBAGENT_*`.
- Nothing emits them: `AGUIStreamOptions` in `AGUI.Server` 1.0.0 has no subagent mapping hook.
- Nothing renders them: `@copilotkit/react-core` only re-exports the zod schemas, and `@copilotkit/core` ignores `subagentRunId` when pairing messages.

## Searching packages
- `node_modules` is gitignored, so Copilot's `grep` tool skips it. Use `Select-String -List` on a named package folder.
- `.NET` DLL string literals are UTF-16; type names in metadata are UTF-8. Prefer the package's `.xml` docs file over DLL bytes.

## Repo gotchas
- `dotnet build` / `test` fail with MSB3027 while Aspire runs (DLL lock). Stop Aspire first.
- `npx tsc` is broken here. From `web/`, run `node ..\node_modules\typescript\bin\tsc --noEmit`.
- `aspire run` can leave a `PtCoach.Agent` process behind. Check `Get-Process PtCoach.Agent`.
