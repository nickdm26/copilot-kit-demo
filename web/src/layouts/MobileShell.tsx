import type { ReactNode } from "react";
import { cx } from "../components/ui";

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

export type MobileTab = "program" | "coach" | "client";

export interface MobileShellTab {
  id: MobileTab;
  label: string;
  icon: ReactNode;
}

export interface MobileShellProps {
  /** The three tab definitions. */
  tabs: MobileShellTab[];
  /** Active tab. */
  activeTab: MobileTab;
  /** Shown above the tab panels on every tab (title, model picker, client picker). */
  header?: ReactNode;
  /** Called when the user taps a tab. */
  onTabChange: (tab: MobileTab) => void;
  /** True when the coach agent has pending changes to approve. */
  hasPendingApproval?: boolean;
  /**
   * Content for each tab. Every panel stays mounted and the inactive ones are hidden, so switching tabs keeps
   * state (the chat draft and any run in flight, the program grid's selected week, scroll positions).
   */
  panels: Record<MobileTab, ReactNode>;
  className?: string;
}

// ---------------------------------------------------------------------------
// Icons (inline stroke SVG, 24px)
// ---------------------------------------------------------------------------

function ProgramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M6 9h12" />
      <path d="M7 9v8a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9" />
      <path d="M10 16h4" />
    </svg>
  );
}

function ClientIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Default tab icons used by the demo / default config. */
export const defaultTabs: MobileShellTab[] = [
  { id: "program", label: "Program", icon: <ProgramIcon /> },
  { id: "coach", label: "Coach", icon: <CoachIcon /> },
  { id: "client", label: "Client", icon: <ClientIcon /> },
];

// ---------------------------------------------------------------------------
// MobileShell component
// ---------------------------------------------------------------------------

/**
 * Mobile-first shell (below 768px) with a bottom tab bar that stays visible on every tab, Coach included.
 */
export function MobileShell({
  tabs,
  activeTab,
  onTabChange,
  hasPendingApproval = false,
  header,
  panels,
  className,
}: MobileShellProps) {
  return (
    <div
      className={cx(
        "flex h-dvh flex-col overflow-hidden bg-bg text-ink font-body",
        "lg:hidden", // only shown below 768px; the desktop layout from App.tsx takes over above
        className,
      )}
    >
      {header}

      {/* Tab panels: all stay mounted; only the active one is visible. */}
      <div className="relative flex-1 min-h-0">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            aria-label={tab.label}
            data-testid={`mobile-panel-${tab.id}`}
            hidden={tab.id !== activeTab}
            className="absolute inset-0 overflow-y-auto overscroll-contain"
          >
            {panels[tab.id]}
          </div>
        ))}
      </div>

      {/* Bottom tab bar */}
      <nav
        className="flex border-t border-border bg-surface"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="tablist"
        aria-label="Main navigation"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={cx(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                "h-[52px]",
                isActive
                  ? "text-ink font-bold"
                  : "text-ink-muted font-medium",
              )}
            >
              <div className="relative">
                {tab.icon}
                {/* Accent dot for pending approval on Coach tab */}
                {hasPendingApproval && tab.id === "coach" && (
                  <span
                    className="absolute -right-1 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent border-2 border-surface"
                    aria-label="Pending approval"
                  />
                )}
              </div>
              <span className="text-[11px] leading-none">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
