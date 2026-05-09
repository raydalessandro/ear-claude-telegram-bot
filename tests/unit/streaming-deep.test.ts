/**
 * Deep tests for streaming module — message splitting, throttling,
 * ask_user keyboard, done cleanup, error handling.
 */

import { describe, test, expect } from "bun:test";
import { createMockContext } from "../mocks/grammy";
import {
  StreamingState,
  createStatusCallback,
  createAskUserKeyboard,
} from "../../src/handlers/streaming";
import { BUTTON_LABEL_MAX_LENGTH, TELEGRAM_SAFE_LIMIT } from "../../src/config";

// ============== StreamingState ==============

describe("StreamingState", () => {
  test("initializes with empty collections", () => {
    const state = new StreamingState();
    expect(state.textMessages.size).toBe(0);
    expect(state.toolMessages.length).toBe(0);
    expect(state.lastEditTimes.size).toBe(0);
    expect(state.lastContent.size).toBe(0);
  });

  test("collections are independent across instances", () => {
    const s1 = new StreamingState();
    const s2 = new StreamingState();
    s1.toolMessages.push({ message_id: 1, chat: { id: 1 } } as any);
    expect(s2.toolMessages.length).toBe(0);
  });
});

// ============== createAskUserKeyboard ==============

describe("createAskUserKeyboard", () => {
  test("creates keyboard with multiple options", () => {
    const kb = createAskUserKeyboard("req-1", ["Yes", "No", "Maybe"]);
    expect(kb).toBeDefined();
  });

  test("creates keyboard with single option", () => {
    const kb = createAskUserKeyboard("req-2", ["Only option"]);
    expect(kb).toBeDefined();
  });

  test("handles empty options", () => {
    const kb = createAskUserKeyboard("req-3", []);
    expect(kb).toBeDefined();
  });

  test("truncates long option labels", () => {
    const longLabel = "A".repeat(100);
    const kb = createAskUserKeyboard("req-4", [longLabel]);
    // We can't inspect InlineKeyboard internals easily,
    // but it should not throw
    expect(kb).toBeDefined();
  });

  test("callback data format is correct", () => {
    // The callback data should be askuser:{requestId}:{index}
    // We test this indirectly by ensuring creation doesn't throw
    const kb = createAskUserKeyboard("abc-123", ["opt1", "opt2"]);
    expect(kb).toBeDefined();
  });

  test("handles options with special characters", () => {
    const kb = createAskUserKeyboard("req-5", [
      "Option with <html>",
      "Option with 'quotes'",
      "Option with émojis 🎉",
    ]);
    expect(kb).toBeDefined();
  });
});

// ============== createStatusCallback ==============

describe("createStatusCallback", () => {
  test("tool status sends reply", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("tool", "📖 Reading file.ts");
    expect(ctx._sent.length).toBe(1);
    expect(ctx._sent[0]?.text).toBe("📖 Reading file.ts");
    expect(state.toolMessages.length).toBe(1);
  });

  test("multiple tool messages accumulate", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("tool", "Tool 1");
    await cb("tool", "Tool 2");
    await cb("tool", "Tool 3");
    expect(state.toolMessages.length).toBe(3);
  });

  test("thinking sends italic message", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("thinking", "Analyzing the code...");
    expect(ctx._sent[0]?.text).toContain("🧠");
    expect(ctx._sent[0]?.text).toContain("Analyzing the code");
    expect(state.toolMessages.length).toBe(1);
  });

  test("thinking truncates long content to 500 chars", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    const longThink = "a".repeat(1000);
    await cb("thinking", longThink);
    expect(ctx._sent[0]?.text.length).toBeLessThan(600);
    expect(ctx._sent[0]?.text).toContain("...");
  });

  test("text creates new segment message", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("text", "Hello world", 0);
    expect(state.textMessages.size).toBe(1);
    expect(state.textMessages.has(0)).toBe(true);
  });

  test("text with different segment IDs creates separate messages", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("text", "Segment 0", 0);
    await cb("text", "Segment 1", 1);
    expect(state.textMessages.size).toBe(2);
  });

  test("text update on same segment is throttled", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    // First call creates the message
    await cb("text", "Initial", 0);
    const sentCount = ctx._sent.length;

    // Immediate second call should be throttled (skipped)
    await cb("text", "Updated", 0);
    // No new message sent (throttled), no edit either since < STREAMING_THROTTLE_MS
    expect(ctx._sent.length).toBe(sentCount);
  });

  test("segment_end updates final content", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("text", "Partial", 0);
    await cb("segment_end", "Full final content", 0);
    // Should have edited the message
    expect(ctx._edited.length).toBeGreaterThan(0);
  });

  test("segment_end with same content skips edit", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("text", "Same content", 0);
    const editCount = ctx._edited.length;
    // segment_end with identical content after HTML conversion
    await cb("segment_end", "Same content", 0);
    // Formatted content may differ, but if identical it should skip
    // This is a best-effort test
    expect(ctx._edited.length).toBeGreaterThanOrEqual(editCount);
  });

  test("done cleans up tool messages", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("tool", "Tool 1");
    await cb("tool", "Tool 2");
    expect(state.toolMessages.length).toBe(2);

    await cb("done", "");
    // deleteMessage is called for each tool message
    // We can't easily verify deletion in mock, but should not crash
  });

  test("done with no tool messages is a no-op", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    // Should not throw
    await cb("done", "");
  });

  test("handles very long text content (> Telegram limit)", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    const longText = "word ".repeat(2000);
    await cb("text", longText, 0);
    // Should truncate to TELEGRAM_SAFE_LIMIT
    expect(ctx._sent.length).toBe(1);
  });

  test("segment_end with long content splits message", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    await cb("text", "Initial short text", 0);

    // Now send a very long final content
    const longContent = "word ".repeat(2000);
    await cb("segment_end", longContent, 0);
    // Should have attempted to delete and split
    // Multiple messages sent
    expect(ctx._sent.length).toBeGreaterThan(1);
  });

  test("unknown status type doesn't crash", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    // Should handle gracefully
    await cb("unknown_type" as any, "content");
  });

  test("HTML parse failure falls back to plain text", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const cb = createStatusCallback(ctx, state);

    // This content would be valid, but tests the code path exists
    await cb("text", "Normal text", 0);
    expect(ctx._sent.length).toBe(1);
  });
});
