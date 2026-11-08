// node --test "web/src/components/subagents/*.test.mjs"
// The event shapes below are copied from a real agent stream (SubagentHostTests in agent.tests).
import { test } from "node:test";
import assert from "node:assert/strict";
import { SubagentFeed, STOPPED, reportsFromResult } from "./feed.ts";

const started = (id, name, description, parentToolCallId = "parent-call") => ({
  type: "SUBAGENT_STARTED",
  subagentRunId: id,
  name,
  description,
  parentToolCallId,
});

function feedWithTwoLanes() {
  const feed = new SubagentFeed();
  let t = 1000;
  const at = () => (t += 100);
  feed.apply(started("sa-mon", "day-builder", "Week 1 · Mon · Lower"), at());
  feed.apply(started("sa-scr", "injury-screen", "Injury screen"), at());
  feed.apply({ type: "TEXT_MESSAGE_START", subagentRunId: "sa-mon", messageId: "sa-mon-brief", role: "user" }, at());
  feed.apply({ type: "TEXT_MESSAGE_CONTENT", subagentRunId: "sa-mon", messageId: "sa-mon-brief", delta: "Squat-led lower day." }, at());
  feed.apply({ type: "TEXT_MESSAGE_END", subagentRunId: "sa-mon", messageId: "sa-mon-brief" }, at());
  feed.apply({ type: "TOOL_CALL_START", subagentRunId: "sa-mon", toolCallId: "sa-mon-call_0", toolCallName: "searchExercises", parentMessageId: "sa-mon-m1" }, at());
  feed.apply({ type: "TOOL_CALL_ARGS", subagentRunId: "sa-mon", toolCallId: "sa-mon-call_0", delta: '{"pattern":' }, at());
  feed.apply({ type: "TOOL_CALL_ARGS", subagentRunId: "sa-mon", toolCallId: "sa-mon-call_0", delta: '"squat"}' }, at());
  feed.apply({ type: "TOOL_CALL_END", subagentRunId: "sa-mon", toolCallId: "sa-mon-call_0" }, at());
  feed.apply({ type: "TEXT_MESSAGE_START", subagentRunId: "sa-scr", messageId: "sa-scr-m1", role: "assistant" }, at());
  feed.apply({ type: "TEXT_MESSAGE_CONTENT", subagentRunId: "sa-scr", messageId: "sa-scr-m1", delta: "overhead-press -> " }, at());
  feed.apply({ type: "TOOL_CALL_RESULT", subagentRunId: "sa-mon", messageId: "sa-mon-r1", toolCallId: "sa-mon-call_0", content: '[{"id":"back-squat"}]', role: "tool" }, at());
  feed.apply({ type: "TEXT_MESSAGE_CONTENT", subagentRunId: "sa-scr", messageId: "sa-scr-m1", delta: "landmine-press" }, at());
  feed.apply({ type: "STATE_SNAPSHOT", subagentRunId: "sa-mon", snapshot: {} }, at());
  return { feed, at };
}

test("builds one lane per sub-agent from the attributed stream", () => {
  const { feed } = feedWithTwoLanes();
  const [mon, scr] = feed.lanesFor("parent-call");
  assert.equal(mon.kind, "build-day");
  assert.equal(mon.title, "Week 1 · Mon · Lower");
  assert.equal(mon.brief, "Squat-led lower day.");
  assert.equal(mon.status, "running");
  assert.equal(mon.writes, 1);
  assert.equal(mon.steps.length, 1); // the brief is not a step
  assert.deepEqual(
    { name: mon.steps[0].name, args: mon.steps[0].args, result: mon.steps[0].result },
    { name: "searchExercises", args: '{"pattern":"squat"}', result: '[{"id":"back-squat"}]' },
  );
  assert.equal(scr.kind, "injury-screen");
  assert.equal(scr.steps[0].text, "overhead-press -> landmine-press");
  assert.equal(scr.steps[0].done, false);
});

test("finish, error and the end of the run settle each lane", () => {
  const { feed, at } = feedWithTwoLanes();
  const report = { subagentRunId: "sa-scr", kind: "injury-screen", title: "Injury screen", status: "done", summary: "ok", durationMs: 42 };
  feed.apply({ type: "SUBAGENT_FINISHED", subagentRunId: "sa-scr", result: report }, at());
  let [mon, scr] = feed.lanesFor("parent-call");
  assert.equal(scr.status, "done");
  assert.equal(scr.report.durationMs, 42);
  assert.equal(scr.steps[0].done, true); // an open text step is closed
  assert.ok(scr.finishedAt > scr.startedAt);
  assert.equal(mon.status, "running");

  feed.apply({ type: "RUN_FINISHED", threadId: "t", runId: "r" }, at());
  [mon] = feed.lanesFor("parent-call");
  assert.equal(mon.status, "error");
  assert.equal(mon.error, STOPPED);
});

test("ignores events for unknown sub-agents and the coach's own events", () => {
  const feed = new SubagentFeed();
  const before = feed.getSnapshot();
  feed.apply({ type: "TOOL_CALL_START", subagentRunId: "nope", toolCallId: "x", toolCallName: "searchExercises" });
  feed.apply({ type: "TOOL_CALL_START", toolCallId: "parent-call", toolCallName: "runSubagents" });
  feed.apply({ type: "SUBAGENT_FINISHED", subagentRunId: "nope" });
  assert.equal(feed.getSnapshot(), before); // no change, same array
});

test("notifies listeners and hands out a new snapshot only on change", () => {
  const feed = new SubagentFeed();
  let calls = 0;
  const off = feed.subscribe(() => calls++);
  feed.apply(started("a", "week-builder", "Week 2"));
  const first = feed.getSnapshot();
  feed.apply(started("a", "week-builder", "Week 2")); // duplicate start: ignored
  assert.equal(feed.getSnapshot(), first);
  feed.apply({ type: "SUBAGENT_ERROR", subagentRunId: "a", message: "Timed out after 180s." });
  assert.notEqual(feed.getSnapshot(), first);
  assert.equal(feed.getSnapshot()[0].error, "Timed out after 180s.");
  assert.equal(calls, 2);
  off();
});

test("separate runSubagents calls keep separate lanes", () => {
  const feed = new SubagentFeed();
  feed.apply(started("a", "day-builder", "Week 1 · Mon · Lower", "call-1"));
  feed.apply(started("b", "week-builder", "Week 2", "call-2"));
  assert.deepEqual(feed.lanesFor("call-1").map((l) => l.id), ["a"]);
  assert.deepEqual(feed.lanesFor("call-2").map((l) => l.id), ["b"]);
});

test("reads reports back from the runSubagents result", () => {
  const result = JSON.stringify({
    reports: [
      { subagentRunId: "a", kind: "build-day", title: "Week 1 · Mon · Lower", status: "done", summary: "Done.", durationMs: 900 },
      { nonsense: true },
    ],
    riskyLifts: [],
  });
  assert.deepEqual(reportsFromResult(result).map((r) => r.subagentRunId), ["a"]);
  assert.deepEqual(reportsFromResult("Error: nope"), []);
  assert.deepEqual(reportsFromResult(undefined), []);
});
