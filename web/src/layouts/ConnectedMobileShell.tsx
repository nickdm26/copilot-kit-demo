import { useState, useEffect, type ReactNode } from "react";
import { MobileShell, defaultTabs, type MobileTab } from "./MobileShell";

const MQ = "(max-width: 767px)";

export interface ConnectedMobileShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  programContent: ReactNode;
  coachContent: ReactNode;
  clientContent: ReactNode;
  footer: ReactNode;
}

/**
 * ConnectedMobileShell
 *
 * Uses window.matchMedia to detect viewport width below 768px.
 * On mobile: renders MobileShell with tab-based navigation (the header is shown on top, the footer is not; every tab stays mounted).
 * On desktop: renders the full grid layout.
 */
export function ConnectedMobileShell({
  header,
  sidebar,
  programContent,
  coachContent,
  clientContent,
  footer,
}: ConnectedMobileShellProps) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MQ).matches);

  useEffect(() => {
    const mq = window.matchMedia(MQ);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!isMobile) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col bg-bg text-ink font-body">
        {header}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_420px] grid-rows-[repeat(2,minmax(0,1fr))] lg:grid-rows-[minmax(0,1fr)] min-h-0">
          {sidebar}
          {programContent}
          {coachContent}
        </main>
        {footer}
      </div>
    );
  }

  return <MobileTabs header={header} panels={{ program: programContent, coach: coachContent, client: clientContent }} />;
}

function MobileTabs({ header, panels }: { header: ReactNode; panels: Record<MobileTab, ReactNode> }) {
  const [activeTab, setActiveTab] = useState<MobileTab>("program");
  return <MobileShell tabs={defaultTabs} activeTab={activeTab} onTabChange={setActiveTab} header={header} panels={panels} />;
}