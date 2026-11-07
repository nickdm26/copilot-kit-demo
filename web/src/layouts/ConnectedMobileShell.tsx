import { useState, type ReactNode } from "react";
import { MOBILE_QUERY, useMediaQuery } from "../lib/useMediaQuery";
import { usePendingApprovals } from "../components/agent/pendingApprovals";
import { MobileShell, defaultTabs, type MobileTab } from "./MobileShell";
import { MobileNavContext } from "./mobileNav";

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
 * Below 768px: MobileShell with bottom tabs (the header is shown on top, the footer is not; every tab stays mounted).
 * The Coach tab gets a dot while an approval card waits.
 * Above: the header, then the sidebar, program and chat as separate panels on the page background.
 */
export function ConnectedMobileShell({
  header,
  sidebar,
  programContent,
  coachContent,
  clientContent,
  footer,
}: ConnectedMobileShellProps) {
  const isMobile = useMediaQuery(MOBILE_QUERY);

  if (!isMobile) {
    return (
      <div className="h-dvh overflow-hidden flex flex-col bg-bg text-ink font-body">
        {header}
        <main className="flex-1 grid grid-cols-1 gap-4 p-4 lg:grid-cols-[260px_minmax(0,1fr)_380px] xl:grid-cols-[300px_minmax(0,1fr)_420px] grid-rows-[repeat(2,minmax(0,1fr))] lg:grid-rows-[minmax(0,1fr)] min-h-0">
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
  const hasPendingApproval = usePendingApprovals().length > 0;
  return (
    <MobileNavContext value={setActiveTab}>
      <MobileShell
        tabs={defaultTabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasPendingApproval={hasPendingApproval}
        header={header}
        panels={panels}
      />
    </MobileNavContext>
  );
}
