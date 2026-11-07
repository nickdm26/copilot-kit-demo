import { useEffect, useState } from "react";
import { ProgressCard } from "./ProgressCard";
import { stalledSquat, risingBench, noGoalBench } from "./ProgressCard.fixtures";

type ThemeMode = "light" | "dark" | "system";

export default function ProgressCardDemo() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl uppercase tracking-wide">ProgressCard</h1>
          <p className="text-sm text-ink-muted mt-1">Stalled and rising states · light and dark</p>
        </div>
        <div className="flex gap-2">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-sm border border-border px-3 py-1 text-sm font-medium ${
                mode === m ? "bg-accent text-on-fill" : "bg-surface text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="font-heading text-lg uppercase tracking-wide mb-3 text-ink-muted">
            Stalled
          </h2>
          <ProgressCard {...stalledSquat} />
        </section>
        <section>
          <h2 className="font-heading text-lg uppercase tracking-wide mb-3 text-ink-muted">
            Rising
          </h2>
          <ProgressCard {...risingBench} />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-heading text-lg uppercase tracking-wide mb-3 text-ink-muted">
          No goal set
        </h2>
        <div className="max-w-sm">
          <ProgressCard {...noGoalBench} />
        </div>
      </section>
    </div>
  );
}
