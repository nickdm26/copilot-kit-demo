import {
  createContext,
  useContext,
  useEffect,
  useMemo,
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
import { ConnectedSuggestionChips, starterSuggestions } from "./ConnectedSuggestionChips";
import { SystemMessage } from "./SystemMessage";
import { SubagentFeedProvider, SubagentsToggle, isSubagentMessage } from "../subagents";
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
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3.5 py-2.5">
        <div className="min-w-0 flex-1 basis-[7.5rem]">
          <h2 className="whitespace-nowrap font-heading text-xl uppercase leading-none tracking-wide">Coach agent</h2>
          <p className="mt-1 truncate text-xs text-ink-muted">
            {client?.name ?? ""}
            {client ? " · " : ""}
            <span data-testid={TEST_IDS.activeModel}>{activeModel ? modelDisplayName(activeModel) : "Loading..."}</span>
          </p>
        </div>
        {/* Title and controls share a row when the pane is wide enough (the bases add up to ~24rem), else wrap. */}
        <div className={cx("flex min-w-0 items-center justify-end gap-2", showModelPicker && "flex-1 basis-[16rem]")}>
          <SubagentsToggle />
          {showModelPicker ? <ConnectedModelPicker className="min-w-0 max-w-[220px] flex-1" /> : null}
        </div>
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
        suggestions={starterSuggestions(firstName).map((s) => s.label)}
        onPick={send}
      />
    </div>
  );

  return (
    <SubagentFeedProvider agent={agent}>
    <EmptyStateContext value={emptyState}>
      <CopilotChat
        agentId={agentId}
        threadId={threadId}
        labels={{ chatInputPlaceholder: `Ask about ${firstName}'s program` }}
        // The slot type includes the view's static members; the wrapper only needs its props.
        messageView={MessageViewWithEmptyState as unknown as typeof CopilotChatMessageView}
        input={{
          sendButton: SendButton,
          startTranscribeButton: MicButton,
          cancelTranscribeButton: CancelRecordingButton,
          finishTranscribeButton: FinishRecordingButton,
          // CopilotKit only passes onStartTranscribe when the runtime has a transcription service and the browser has
          // MediaRecorder, so the mic button hides itself otherwise. While recording, the waveform replaces the text box.
          children: ({
            mode,
            textArea,
            audioRecorder,
            sendButton,
            onStartTranscribe,
            startTranscribeButton,
            cancelTranscribeButton,
            finishTranscribeButton,
          }) => (
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
                  {mode === "transcribe" ? (
                    // The waveform canvas draws in currentColor.
                    <div className="flex min-h-[42px] items-center text-accent [&>div]:px-0 [&>div]:py-2">{audioRecorder}</div>
                  ) : mode === "processing" ? (
                    <p role="status" className="flex min-h-[42px] items-center text-sm text-ink-muted">
                      Transcribing...
                    </p>
                  ) : (
                    textArea
                  )}
                </div>
                {mode === "transcribe" ? (
                  <>
                    {cancelTranscribeButton}
                    {finishTranscribeButton}
                  </>
                ) : (
                  <>
                    {onStartTranscribe && mode === "input" ? startTranscribeButton : null}
                    {sendButton}
                  </>
                )}
              </div>
            </div>
          ),
        }}
      />
    </EmptyStateContext>
    </SubagentFeedProvider>
  );
}

const EmptyStateContext = createContext<ReactNode>(null);

/**
 * The chat's message list, or our empty state before the first message. Sub-agent messages (their briefs, tool calls
 * and words, kept by AG-UI with a subagentRunId) are left out: each sub-agent's lane in the SubagentBoard shows them.
 */
function MessageViewWithEmptyState(props: CopilotChatMessageViewProps) {
  const empty = useContext(EmptyStateContext);
  const all = props.messages;
  const messages = useMemo(() => (all && all.some(isSubagentMessage) ? all.filter((m) => !isSubagentMessage(m)) : all), [all]);
  if ((messages?.length ?? 0) === 0 && !props.isRunning) return <>{empty}</>;
  return <CopilotChatMessageView {...props} messages={messages} />;
}

const iconButton = cx(
  "flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  "disabled:cursor-not-allowed disabled:opacity-45",
);
const outlineButton = cx(iconButton, "border-border bg-surface text-ink hover:bg-bg");

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Starts recording a voice message (CopilotKit records it and transcribes it into the text box). */
function MicButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Dictate a message"
      title="Dictate a message"
      data-testid={TEST_IDS.voiceInput}
      {...props}
      className={cx(outlineButton, className)}
    >
      <Icon d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3" />
    </button>
  );
}

function CancelRecordingButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label="Discard recording" title="Discard recording" {...props} className={cx(outlineButton, className)}>
      <Icon d="M6 6l12 12M18 6L6 18" />
    </button>
  );
}

/** Stops recording and transcribes it into the text box (the trainer still presses send). */
function FinishRecordingButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Stop and transcribe"
      title="Stop and transcribe"
      {...props}
      className={cx(iconButton, "border-accent bg-accent text-on-fill hover:bg-accent-strong", className)}
    >
      <Icon d="M5 12l5 5L20 7" />
    </button>
  );
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
