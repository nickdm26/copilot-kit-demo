import { useState, useEffect } from "react";
import { Chip, cx } from "../ui";
import { MobileShell, defaultTabs, type MobileTab } from "../../layouts/MobileShell";
import { MobileDayView } from "./MobileDayView";
import { PendingChangesBanner } from "./PendingChangesBanner";
import { day3Fixture, weekOptions } from "./fixtures";

type ThemeMode = "light" | "dark" | "system";

/**
 * Demo page for Task 7 (Mobile layout).
 * Shows MobileShell, MobileDayView, and PendingChangesBanner in light and dark.
 */
export default function MobileDemo() {
  const [mode, setMode] = useState<ThemeMode>("system");
  const [activeTab, setActiveTab] = useState<MobileTab>("program");
  const [selectedWeek, setSelectedWeek] = useState(3);
  const [selectedDay, setSelectedDay] = useState("Wed");
  const [pendingCount, setPendingCount] = useState(1);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
  }, [mode]);

  const dayLabels = ["Mon", "Wed", "Fri"];
  const hasPending = pendingCount > 0;

  // Placeholder content for tabs
  const programContent = (
    <div className="p-4">
      <MobileDayView
        day={day3Fixture}
        weekOptions={weekOptions}
        selectedWeek={selectedWeek}
        onWeekChange={setSelectedWeek}
        dayLabels={dayLabels}
        selectedDay={selectedDay}
        onDayChange={setSelectedDay}
        onExerciseTap={(ex) => console.log("Tapped:", ex.displayName)}
      />
      {hasPending && (
        <div className="px-4 pb-4">
          <PendingChangesBanner
            count={pendingCount}
            onReview={() => alert("Review changes")}
          />
        </div>
      )}
    </div>
  );

  const coachContent = (
    <div className="flex items-center justify-center h-full p-8">
      <p className="text-ink-muted text-sm">
        {hasPending
          ? "Coach has proposed changes. Switch to Program tab to review."
          : "Coach tab placeholder — chat content goes here."}
      </p>
    </div>
  );

  const clientContent = (
    <div className="p-4 space-y-3">
      <h2 className="font-heading text-xl uppercase tracking-wide">Client Profile</h2>
      <div className="rounded-md border border-border bg-surface p-4 text-sm space-y-2">
        <p><span className="text-ink-muted">Name:</span> Aroha Tane</p>
        <p><span className="text-ink-muted">Training age:</span> 2 yrs</p>
        <p><span className="text-ink-muted">Days / week:</span> 3</p>
        <p><span className="text-ink-muted">Goals:</span> Back squat 120 kg by March. Build upper back strength.</p>
        <p><span className="text-ink-muted">Injuries:</span> Left shoulder impingement</p>
      </div>
    </div>
  );

  return (
    <div>
      {/* Theme toggle */}
      <div className="sticky top-0 z-50 flex items-center justify-between gap-4 border-b border-border bg-bg px-4 py-2">
        <h1 className="font-heading text-lg uppercase tracking-wide">Mobile Layout Demo</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPendingCount((c) => (c > 0 ? 0 : 1))}
            className="text-xs text-ink-muted underline cursor-pointer"
          >
            {hasPending ? "Clear pending" : "Add pending"}
          </button>
          <div role="group" aria-label="Theme" className="flex gap-1">
            {(["light", "dark", "system"] as const).map((m) => (
              <Chip key={m} selected={mode === m} onClick={() => setMode(m)}>
                {m}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile shell demo (max 420px wide to simulate phone) */}
      <div className="mx-auto flex justify-center py-4">
        <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-border shadow-lg">
          <MobileShell
            tabs={defaultTabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            hasPendingApproval={hasPending}
            panels={{ program: programContent, coach: coachContent, client: clientContent }}
          />
        </div>
      </div>

      {/* Standalone component previews */}
      <div className="mx-auto max-w-2xl px-4 pb-8 space-y-8">
        <section>
          <h2 className="font-heading text-lg uppercase tracking-wide mb-3">PendingChangesBanner</h2>
          <div className="space-y-2">
            <PendingChangesBanner count={1} onReview={() => alert("Review 1 change")} />
            <PendingChangesBanner count={3} onReview={() => alert("Review 3 changes")} />
          </div>
        </section>

        <section>
          <h2 className="font-heading text-lg uppercase tracking-wide mb-3">MobileDayView (standalone)</h2>
          <MobileDayView
            day={day3Fixture}
            weekOptions={weekOptions}
            selectedWeek={selectedWeek}
            onWeekChange={setSelectedWeek}
            dayLabels={dayLabels}
            selectedDay={selectedDay}
            onDayChange={setSelectedDay}
            onExerciseTap={(ex) => console.log("Tapped:", ex.displayName)}
          />
        </section>
      </div>
    </div>
  );
}
