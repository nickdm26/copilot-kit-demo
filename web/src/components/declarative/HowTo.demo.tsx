// Demo of the declarative how-to states. Not mounted anywhere; render <HowToDemo /> to look at it.
// The theme toggle flips <html data-theme>, so every state can be checked in light and dark.

import { useState } from "react";
import { Button } from "../ui";
import { HowToCard } from "./HowToCard";
import { gobletSquatHowTo, pauseSquatHowTo, scriptNode } from "./fixtures";

const STATES = [
  { title: "Pause squat (plan example)", ui: pauseSquatHowTo, state: "done" as const },
  { title: "Every catalog part", ui: gobletSquatHowTo, state: "done" as const },
  { title: "Streaming", ui: undefined, state: "streaming" as const },
  { title: 'Rejected ("type": "Script")', ui: scriptNode, state: "done" as const },
];

export default function HowToDemo() {
  const [dark, setDark] = useState(false);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  };

  return (
    <div className="min-h-screen bg-bg p-4 text-ink">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl uppercase tracking-wide">Declarative how-to</h1>
        <Button variant="secondary" onClick={toggle} aria-pressed={dark}>
          {dark ? "Light" : "Dark"} theme
        </Button>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        {STATES.map((s) => (
          <div key={s.title} className="flex flex-col gap-2">
            <h2 className="font-heading text-base uppercase tracking-wide text-ink-muted">{s.title}</h2>
            {/* 360px is the narrowest phone; 400px is the desktop chat pane. */}
            <div className="w-[360px] rounded-lg border border-border bg-surface p-4">
              <HowToCard ui={s.ui} state={s.state} />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <h2 className="font-heading text-base uppercase tracking-wide text-ink-muted">Chat pane width (400px)</h2>
          <div className="w-[400px] rounded-lg border border-border bg-surface p-4">
            <HowToCard ui={pauseSquatHowTo} state="done" />
          </div>
        </div>
      </div>
    </div>
  );
}
