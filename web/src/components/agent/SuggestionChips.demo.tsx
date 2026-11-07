import { useEffect, useState } from "react";
import { Card, cx } from "../ui";
import { SuggestionChips } from "./SuggestionChips";
import { ChatEmptyState } from "./ChatEmptyState";
import {
  FIXTURE_CHIPS,
  FIXTURE_EMPTY_SUGGESTIONS,
  FIXTURE_CLIENT,
} from "./suggestion.fixtures";

type ThemeMode = "light" | "dark" | "system";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 border-b border-border pb-2 text-2xl">{title}</h2>
      {children}
    </section>
  );
}

export default function SuggestionChipsDemo() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-5xl uppercase leading-none">SuggestionChips + ChatEmptyState</h1>
          <p className="mt-2 text-sm text-ink-muted">Client: {FIXTURE_CLIENT}</p>
        </div>
        <div role="group" aria-label="Theme" className="flex gap-1">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cx(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-accent-tint text-ink border-accent"
                  : "bg-surface text-ink-muted border-border",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      {/* ── SuggestionChips ───────────────────────────────────── */}
      <Section title="SuggestionChips — default">
        <Card flush className="overflow-hidden">
          <div className="bg-bg">
            <SuggestionChips
              suggestions={FIXTURE_CHIPS}
              onPick={(l) => console.log("[demo] chip pick:", l)}
            />
          </div>
        </Card>
      </Section>

      <Section title="SuggestionChips — no highlighted">
        <Card flush className="overflow-hidden">
          <div className="bg-bg">
            <SuggestionChips
              suggestions={[
                { label: "Deload next week" },
                { label: "Swap for home gym" },
              ]}
              onPick={(l) => console.log("[demo] chip pick:", l)}
            />
          </div>
        </Card>
      </Section>

      <Section title="SuggestionChips — empty (no chips)">
        <Card flush className="overflow-hidden">
          <div className="bg-bg">
            <SuggestionChips suggestions={[]} onPick={() => {}} />
          </div>
        </Card>
      </Section>

      {/* ── ChatEmptyState ───────────────────────────────────── */}
      <Section title="ChatEmptyState — default">
        <Card flush className="overflow-hidden">
          <div className="bg-surface">
            <ChatEmptyState
              clientName={FIXTURE_CLIENT}
              suggestions={FIXTURE_EMPTY_SUGGESTIONS}
              onPick={(l) => console.log("[demo] empty-state pick:", l)}
            />
          </div>
        </Card>
      </Section>

      <Section title="ChatEmptyState — no suggestions">
        <Card flush className="overflow-hidden">
          <div className="bg-surface">
            <ChatEmptyState
              clientName={FIXTURE_CLIENT}
              suggestions={[]}
              onPick={() => {}}
            />
          </div>
        </Card>
      </Section>
    </div>
  );
}
