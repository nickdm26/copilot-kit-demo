import { useEffect, useState } from "react";
import { AgentStatusStrip, type AgentStatusStripProps } from "./AgentStatusStrip";
import { allFixtures } from "./AgentStatusStrip.fixtures";
import { cx } from "../ui";

type ThemeMode = "light" | "dark";

export default function AgentStatusStripDemo() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  return (
    <div className="min-h-screen bg-bg text-ink font-body p-8">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <h1 className="font-heading text-3xl uppercase">AgentStatusStrip</h1>
          <button
            onClick={() => setTheme((t: ThemeMode) => (t === "light" ? "dark" : "light"))}
            className={cx(
              "rounded-md border border-border bg-surface px-3 py-1 text-sm font-medium cursor-pointer",
              "hover:bg-accent-tint transition-colors",
            )}
          >
            {theme === "light" ? "🌙 Dark" : "☀️ Light"}
          </button>
        </div>

        <div className="space-y-6">
          {allFixtures.map((fixture, i) => (
            <div key={i}>
              <Preview label={fixture.label} props={fixture.props} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Preview({ label, props }: { label: string; props: AgentStatusStripProps }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink-muted mb-1 uppercase tracking-wide">{label}</h2>
      <div className="rounded-md border border-border overflow-hidden">
        <AgentStatusStrip {...props} />
      </div>
    </div>
  );
}
