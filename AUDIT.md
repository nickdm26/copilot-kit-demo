# Audit: PT Coach repo vs build plan

## 1. Stack

| Item | Value |
|---|---|
| TypeScript | Yes, strict mode |
| React | 19.1.10 |
| Tailwind | 4.3.5 (v4) |
| CopilotKit | 1.85.0 (v2 imports) |
| AG-UI | 1.0.2 (pinned by CopilotKit) |
| Test setup | Playwright e2e, xUnit (.NET) |
| Storybook / demo route | No Storybook. `/styleguide` route exists in App.tsx |

## 2. Paths (real vs plan)

| Plan path | Real path | Status |
|---|---|---|
| `src/components/ui/` | `web/src/components/ui/` | ✅ Exists |
| `src/components/agent/` | `web/src/components/agent/` | ❌ Does not exist — **create it** |
| `src/components/client/` | `web/src/components/client/` | ❌ Does not exist — **create it** |
| `src/components/program/` | `web/src/components/program/` | ❌ Does not exist — **create it** |
| `src/components/declarative/` | `web/src/components/declarative/` | ❌ Does not exist — **create it** |
| `src/layouts/` | `web/src/layouts/` | ❌ Does not exist — **create it** |
| `src/components/genui/` | `web/src/components/genui/` | ✅ Exists (ExerciseCard, SwapApproval, WeekSummary) |
| `src/components/program-grid/` | `web/src/components/program-grid/` | ✅ Exists (ProgramGrid) |
| `src/lib/contracts.ts` | `web/src/lib/contracts.ts` | ✅ Exists |
| `src/styles/theme.css` | `web/src/styles/theme.css` | ✅ Exists |

## 3. Primitives

All five exist in `web/src/components/ui/`:

| Component | Props | Notes |
|---|---|---|
| **Button** | `variant`: "primary" \| "secondary" \| "ghost" \| "danger"<br>`size`: "sm" \| "md"<br>extends `ButtonHTMLAttributes` | Has `disabled:opacity-45` styling. No `lg` size. |
| **Card** | `flush`?: boolean<br>extends `HTMLAttributes` | Surface bg, 1px border, rounded-md, p-4 default. |
| **Badge** | `tone`: "neutral" \| "accent" \| "flag" \| "ok"<br>extends `HTMLAttributes` | 12px pill with border. No coloured dot. |
| **Chip** | `selected`?: boolean<br>extends `ButtonHTMLAttributes` | Rounded-full toggle. `aria-pressed` set. |
| **Select** | extends `SelectHTMLAttributes` | Native `<select>`, h-10, styled. |

**Gap**: Badge has no coloured dot (plan says "6px coloured dot"). Chip height is `h-7` (28px), plan says 32px desktop / 36px mobile for suggestion chips.

## 4. Design tokens

All tokens from section 0 are defined in `theme.css`:

- Light and dark mode via `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`
- Tints: `--accent-tint` (18%), `--flag-tint` (14%), `--ok-tint` (14%), `--accent-strong` (85%), `--flag-strong` (85%)
- Tailwind theme tokens: `--color-bg`, `--color-surface`, `--color-ink`, `--color-ink-muted`, `--color-border`, `--color-accent`, `--color-flag`, `--color-ok`, `--color-accent-tint`, `--color-flag-tint`, `--color-ok-tint`, `--color-accent-strong`, `--color-flag-strong`, `--color-on-fill`
- Radius: `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (14px)
- Fonts: `--font-heading` (Barlow Condensed 600), `--font-body` (Inter)
- `agent-touched-fade` animation exists for the 2s accent fade
- CopilotKit chat variables mapped to our tokens

**Missing**: No `--color-bg` in the `@theme static` block (but `bg-bg` works because Tailwind v4 resolves it from the CSS variable). Verified: `bg-bg` is used in Button.tsx and works.

## 5. Existing agent UI

| Component | States | Wiring |
|---|---|---|
| **ExerciseCard** | streaming, done | `useFrontendTool` (followUp: false) |
| **SwapApproval** | streaming, pending, approved, rejected | `useHumanInTheLoop` |
| **WeekSummary** | streaming, done | `useFrontendTool` (followUp: true) |

All registered in `genui/index.tsx`. Pattern: `useFrontendTool` for render-only, `useHumanInTheLoop` for approval.

## 6. Layout (current app shell)

| Element | Exists? | Notes |
|---|---|---|
| Header with "PT Coach" | ✅ | Barlow heading |
| Model select | ✅ | In header, native `<select>` |
| Client select | ✅ | In header, native `<select>` |
| Program grid | ✅ | Left/top pane |
| Chat pane | ✅ | Right/bottom pane, uses `CopilotChat` |
| Footer disclaimer | ✅ | "Demo only" |
| Agent status strip | ❌ | **In scope** (Task 1) |
| Progress card | ❌ | **In scope** (Task 2) |
| Program diff card | ❌ | **In scope** (Task 3) |
| Client profile panel | ❌ | **In scope** (Task 4) |
| Suggestion chips | ❌ | **In scope** (Task 5) |
| Chat empty state | ❌ | **In scope** (Task 5) |
| Model picker (compact) | ❌ | **In scope** (Task 6) |
| Mobile shell | ❌ | **In scope** (Task 7) |
| Mobile day view | ❌ | **In scope** (Task 7) |
| Pending changes banner | ❌ | **In scope** (Task 7) |

## 7. Backend

| Item | Status |
|---|---|
| Tool definitions | `CoachTools.cs` — getClient, searchExercises (backend). `genui/index.tsx` — showExerciseCard, showWeekSummary, proposeSwap (frontend). |
| OpenRouter | Called via `OpenRouterChatClientFactory`. Key in user secrets (`OpenRouter:ApiKey`). |
| Model choice | Passed via agent key → model config in `appsettings.json`. Three real models: deepseek, qwen, glm. One replay model. |
| OpenTelemetry | Runtime has basic HTTP/Express/Undici instrumentation via NodeSDK. No GenAI spans, no tool call spans, no approval events. Agent has `UseOpenTelemetry(AgentTelemetrySource)` but no custom spans. |

## 8. Conflicts

| Tasks | Conflict? | Notes |
|---|---|---|
| 1–7 | None | Each creates files in separate directories (`agent/`, `client/`, `program/`, `layouts/`). No overlap. |
| 8 (wiring) | With App.tsx, genui/index.tsx | These are the integration points. Task 8 must merge after 1–7. |
| 9 (declarative) | With agent tool defs | Creates `declarative/` dir and adds a tool. No conflict with 1–7. |
| 10 (otel) | With runtime/src/otel.ts | Only touches runtime and agent instrumentation. No conflict with 1–8. |

## Summary (5 biggest differences)

1. **No `src/components/agent/`, `client/`, `program/`, `declarative/`, or `layouts/` dirs exist** — every task 1–7 and 9 needs to create its directory.
2. **No demo pages or stories exist** — the plan says each task adds a demo page, but there's no Storybook or demo framework. Tasks should add a standalone HTML demo or a route in App.tsx.
3. **Badge has no coloured dot** — the plan says "6px coloured dot" but the existing Badge component is just a pill with border. Tasks needing dots must add them inline.
4. **Model select is in the header, not a dedicated ModelPicker component** — Task 6's ModelPicker replaces or augments this. The existing select uses `modelDisplayName()` format.
5. **OpenTelemetry is basic** — only HTTP/Express/Undici instrumentation. No GenAI semantic conventions, no tool call spans, no approval events. Task 10 has a lot to add.