import { useState, useEffect, type ReactNode } from "react";
import { MobileShell, defaultTabs, type MobileTab } from "./MobileShell";

const MQ = "(max-width: 767px)";

export interface ConnectedMobileShellProps {
  header: ReactNode;
  sidebar: ReactNode;
  programContent: ReactNode;
  coachContent: ReactNode;
  clientContent: ReactNode;
  chatContent: ReactNode;
  footer: ReactNode;
}

/**
 * ConnectedMobileShell
 *
 * Uses window.matchMedia to detect viewport width below 768px.
 * On mobile: renders MobileShell with tab-based navigation.
 * On desktop: renders the full grid layout.
 */
export function ConnectedMobileShell({
  header,
  sidebar,
  programContent,
  coachContent,
  clientContent,
  chatContent,
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
      <div className="min-h-screen flex flex-col bg-bg text-ink font-body">
        {header}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[260px_1fr_420px] min-h-0">
          {sidebar}
          {programContent}
          {coachContent}
        </main>
        {footer}
      </div>
    );
  }

  return (
    <MobileShellInner
      header={header}
      programContent={programContent}
      coachContent={coachContent}
      clientContent={clientContent}
      chatContent={chatContent}
      footer={footer}
    />
  );
}

function MobileShellInner({
  header,
  programContent,
  coachContent,
  clientContent,
  chatContent,
  footer,
}: {
  header: ReactNode;
  programContent: ReactNode;
  coachContent: ReactNode;
  clientContent: ReactNode;
  chatContent: ReactNode;
  footer: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<MobileTab>("program");
  const [showChat, setShowChat] = useState(false);

  const handleTabChange = (tab: MobileTab) => {
    setActiveTab(tab);
    if (tab === "coach") {
      setShowChat(true);
    }
  };

  return (
    <MobileShell
      tabs={defaultTabs}
      activeTab={activeTab}
      onTabChange={handleTabChange}
      showChat={showChat}
      onChatBack={() => setShowChat(false)}
      chatTitle={
        <span className="font-heading text-lg uppercase tracking-wide">PT Coach</span>
      }
      chatContent={chatContent}
    >
      {activeTab === "program" && programContent}
      {activeTab === "coach" && coachContent}
      {activeTab === "client" && clientContent}
    </MobileShell>
  );
}