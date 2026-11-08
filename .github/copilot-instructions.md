# Copilot instructions

`CLAUDE.md` still applies. These rules come on top of it and are about working efficiently.
A past research session took 600+ model calls and two hours, mostly from single-step tool
use and wide package scans. Don't repeat that.

## Plan before acting
- Before the first tool call, write a short plan: what you need to know and which files hold it.
- Planning, research or "is this possible" requests: **at most about 25 tool calls**, then
  report findings and stop. Don't write or edit code unless asked to implement.
- If a request says "planning", "research" or "just looking", treat it as read-only even
  in autopilot.

## Batch your tool calls
- When several reads or searches don't depend on each other, make them **all in one
  response**. Reading 5 files is one step, not 5.
- Read whole files with `view` rather than small ranges, unless the file is over ~1500 lines.
- Put related checks in one `powershell` command rather than one command per check.

## Look up prerelease APIs cheaply
`CLAUDE.md` says to check installed docs before using a prerelease API. Do it in this order
and stop at the first answer:
1. `docs/api-notes.md`: facts already found. Check here first.
2. The **one** package that owns the API, by exact path, for example
   `node_modules/@copilotkit/react-core/dist/*.d.mts` or
   `~/.nuget/packages/<package>/<version>/lib/<tfm>/*.xml`. Prefer `.d.ts` and `.xml` docs
   over minified `.mjs` bundles and DLL bytes.
3. The live docs or source on GitHub with `web_fetch`.

When you learn a non-obvious API fact, add one line to `docs/api-notes.md`.

## Never
- Never scan all of `~/.nuget/packages`, all of `node_modules`, or every `dist` bundle.
  Search a named package folder only, and use `Select-String -List` to stop at the first hit.
- Never read DLL bytes across many files. If you must read a binary, name the single DLL.
- Never run a command that might take more than 60 seconds in the foreground. Run it
  async, then poll with `read_powershell`.
- Don't rerun the full Playwright suite to check one fix. Run the one spec file.

## Context
- Don't paste large outputs back into the conversation. Pipe through `Select-Object -First N`
  or `-Last N`.
- If a session is past ~150k tokens and the task has changed, suggest starting a new chat
  with a short handoff note.
