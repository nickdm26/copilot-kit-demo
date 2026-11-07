import { useEffect, useState } from "react";
import { ModelPicker } from "./ModelPicker";
import { SystemMessage } from "./SystemMessage";
import { FIXTURE_MODELS } from "./ModelPicker.fixtures";
import { Card, cx } from "../ui";

type ThemeMode = "light" | "dark" | "system";

function DemoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-heading text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function ModelPickerDemo() {
  const [modelId, setModelId] = useState(FIXTURE_MODELS[0].id);
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
          <h1 className="font-heading text-5xl uppercase leading-none">Task 6: ModelPicker</h1>
          <p className="mt-2 text-sm text-ink-muted">
            ModelPicker, SystemMessage, and their fixtures.
          </p>
        </div>
        <div role="group" aria-label="Theme" className="flex gap-1" data-testid="theme-toggle">
          {(["light", "dark", "system"] as const).map((m) => (
            <button
              key={m}
              className={cx(
                "h-8 rounded-full border px-3 text-xs font-body font-medium cursor-pointer transition-colors",
                mode === m
                  ? "bg-accent text-on-fill border-accent"
                  : "bg-surface text-ink border-border hover:bg-bg",
              )}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </header>

      <DemoSection title="ModelPicker — desktop">
        <Card className="flex items-center gap-4 p-4">
          <ModelPicker models={FIXTURE_MODELS} value={modelId} onChange={setModelId} />
          <span className="text-sm text-ink-muted">
            Selected: {FIXTURE_MODELS.find((m) => m.id === modelId)?.name}
          </span>
        </Card>
      </DemoSection>

      <DemoSection title="ModelPicker — compact (mobile)">
        <Card className="flex items-center gap-4 p-4">
          <ModelPicker models={FIXTURE_MODELS} value={modelId} onChange={setModelId} compact />
          <span className="text-sm text-ink-muted">Compact, max-w 130px</span>
        </Card>
      </DemoSection>

      <DemoSection title="SystemMessage">
        <Card className="flex flex-col items-center gap-3 p-4">
          <SystemMessage text="Switched to Claude Sonnet 5.5" />
          <SystemMessage text="Model changed to GPT-5 mini" />
          <SystemMessage text="Connecting to Llama 4 Maverick..." />
        </Card>
      </DemoSection>

      <DemoSection title="Combined — ModelPicker + SystemMessage">
        <Card className="flex flex-col items-center gap-3 p-4">
          <ModelPicker models={FIXTURE_MODELS} value={modelId} onChange={setModelId} />
          <SystemMessage
            text={`Switched to ${FIXTURE_MODELS.find((m) => m.id === modelId)?.name}`}
          />
        </Card>
      </DemoSection>
    </div>
  );
}
