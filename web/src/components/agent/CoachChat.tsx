import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  CopilotChat,
  CopilotChatMessageView,
  UseAgentUpdate,
  useAgent,
  type CopilotChatMessageViewProps,
} from "@copilotkit/react-core/v2";
import { TEST_IDS, modelDisplayName } from "../../lib/contracts";
import { useSession } from "../../lib/session";
import { cx } from "../ui";
import { ChatEmptyState } from "./ChatEmptyState";
import { ConnectedAgentStatusStrip } from "./ConnectedAgentStatusStrip";
import { ConnectedModelPicker } from "./ConnectedModelPicker";
import { ConnectedSuggestionChips, DEFAULT_SUGGESTIONS } from "./ConnectedSuggestionChips";
import { SystemMessage } from "./SystemMessage";
import { useSendUserMessage } from "./useSendUserMessage";

export interface CoachChatProps {
  /** Show the model picker in the chat header (desktop). On phones it lives in the app header instead. */
  showModelPicker: boolean;
  className?: string;
}

/**
 * The coach chat pane: "Coach agent" header with the active model, the status strip, then the CopilotKit chat with
 * our own empty state and composer (suggestion chips above a plain input and an accent send button).
 */
export function CoachChat({ showModelPicker, className }: CoachChatProps) {
  const { modelKey, threadId, models, clients, clientId } = useSession();
  const activeModel = models.find((m) => m.key === modelKey);
  const client = clients.find((c) => c.id === clientId);
  const firstName = client?.name.split(" ")[0] ?? "the client";

  // Changing the model starts a fresh thread, so the note sits at the top of the new, empty chat.
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);
  const previousModel = useRef(modelKey);
  useEffect(() => {
    const prev = previousModel.current;
    previousModel.current = modelKey;
    if (prev && modelKey && prev !== modelKey) setSwitchedTo(activeModel?.label ?? modelKey);
  }, [modelKey, activeModel]);
  useEffect(() => setSwitchedTo(null), [clientId]);

  return (
    <section
      data-testid={TEST_IDS.chat}
      aria-label="Coach agent chat"
      className={cx("flex h-full min-h-0 flex-col overflow-hidden bg-surface", className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div className="min-w-0">
          <h2 className="font-heading text-xl uppercase leading-none tracking-wide">Coach agent</h2>
          <p className="mt-1 truncate text-xs text-ink-muted">
            {client?.name ?? ""}
            {client ? " · " : ""}
            <span data-testid={TEST_IDS.activeModel}>{activeModel ? modelDisplayName(activeModel) : "Loading..."}</span>
          </p>
        </div>
        {showModelPicker ? <ConnectedModelPicker className="w-[220px] max-w-[50%] shrink-0" /> : null}
      </header>
      <ConnectedAgentStatusStrip />
      <div className="min-h-0 flex-1 overflow-hidden [&>*]:h-full">
        {modelKey ? (
          <BoundChat
            key={threadId}
            agentId={modelKey}
            threadId={threadId}
            firstName={firstName}
            notice={switchedTo ? `Switched to ${switchedTo}` : null}
          />
        ) : null}
      </div>
    </section>
  );
}

function BoundChat({
  agentId,
  threadId,
  firstName,
  notice,
}: {
  agentId: string;
  threadId: string;
  firstName: string;
  notice: string | null;
}) {
  const { agent } = useAgent({ agentId, updates: [UseAgentUpdate.OnMessagesChanged, UseAgentUpdate.OnRunStatusChanged] });
  const hasMessages = agent.messages.length > 0;
  const send = useSendUserMessage(agentId);

  // The message view slot takes a component, not an element, so the empty state reaches it through context.
  const emptyState = (
    <div className="flex flex-col">
      {notice ? <SystemMessage text={notice} /> : null}
      <ChatEmptyState
        clientName={firstName}
        suggestions={DEFAULT_SUGGESTIONS.map((s) => s.label)}
        onPick={send}
      />
    </div>
  );

  return (
    <EmptyStateContext value={emptyState}>
      <CopilotChat
        agentId={agentId}
        threadId={threadId}
        labels={{ chatInputPlaceholder: `Ask about ${firstName}'s program` }}
        // The slot type includes the view's static members; the wrapper only needs its props.
        messageView={MessageViewWithEmptyState as unknown as typeof CopilotChatMessageView}
        input={{
          sendButton: SendButton,
          children: ({ textArea, sendButton }) => (
            <div className="pointer-events-auto flex flex-col gap-2.5 border-t border-border bg-surface px-3.5 py-3">
              {hasMessages ? <ConnectedSuggestionChips /> : null}
              <div className="flex items-end gap-2">
                <div
                  className={cx(
                    "min-w-0 flex-1 rounded-md border border-border bg-surface px-3",
                    "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
                    "[&_textarea]:block [&_textarea]:min-h-[42px] [&_textarea]:py-2.5 [&_textarea]:px-0 [&_textarea]:text-sm [&_textarea]:leading-5 [&_textarea]:outline-none [&_textarea]:placeholder:text-ink-muted",
                  )}
                >
                  {textArea}
                </div>
                {sendButton}
              </div>
            </div>
          ),
        }}
      />
    </EmptyStateContext>
  );
}

const EmptyStateContext = createContext<ReactNode>(null);

/** The chat's message list, or our empty state before the first message. */
function MessageViewWithEmptyState(props: CopilotChatMessageViewProps) {
  const empty = useContext(EmptyStateContext);
  if ((props.messages?.length ?? 0) === 0 && !props.isRunning) return <>{empty}</>;
  return <CopilotChatMessageView {...props} />;
}

/** Accent square send button with ink arrow (the chat passes a stop icon as children while a run can be stopped). */
function SendButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-accent bg-accent text-on-fill transition-colors",
        "hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      {children ?? (
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      )}
    </button>
  );
}
