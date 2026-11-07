import { useEffect, useState } from "react";
import { Chip } from "../ui";
import { ProgramDiffCard } from "./ProgramDiffCard";
import { pendingProps, approvedProps, rejectedProps } from "./ProgramDiffCard.fixtures";

type ThemeMode = "light" | "dark" | "system";

export function ProgramDiffCardDemo() {
  const [mode, setMode] = useState<ThemeMode>("system");

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl uppercase leading-none">ProgramDiffCard</h1>
          <p className="mt-1 text-sm text-ink-muted">Human in the loop for batch program changes</p>
        </div>
        <div role="group" aria-label="Theme" className="flex gap-1">
          {(["light", "dark", "system"] as const).map((m) => (
            <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
              {m}
            </Chip>
          ))}
        </div>
      </header>

      <div className="flex flex-col gap-8">
        <section>
          <h2 className="font-heading text-xl uppercase mb-3 text-ink-muted">Pending</h2>
          <ProgramDiffCard {...pendingProps} />
        </section>

        <section>
          <h2 className="font-heading text-xl uppercase mb-3 text-ink-muted">Approved</h2>
          <ProgramDiffCard {...approvedProps} />
        </section>

        <section>
          <h2 className="font-heading text-xl uppercase mb-3 text-ink-muted">Rejected</h2>
          <ProgramDiffCard {...rejectedProps} />
        </section>
      </div>
    </div>
  );
}
