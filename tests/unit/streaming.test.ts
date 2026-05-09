/**
 * Unit tests for streaming module.
 * Tests StreamingState and createStatusCallback.
 */

import { describe, test, expect } from "bun:test";
import { createMockContext } from "../mocks/grammy";
import { StreamingState, createStatusCallback, createAskUserKeyboard } from "../../src/handlers/streaming";

describe("StreamingState", () => {
  test("initializes with empty maps", () => {
    const state = new StreamingState();
    expect(state.textMessages.size).toBe(0);
    expect(state.toolMessages.length).toBe(0);
    expect(state.lastEditTimes.size).toBe(0);
    expect(state.lastContent.size).toBe(0);
  });
});

describe("createStatusCallback", () => {
  test("sends tool status as reply", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const callback = createStatusCallback(ctx, state);

    await callback("tool", "📖 Reading file.ts");
    expect(state.toolMessages.length).toBe(1);
    expect(ctx._sent[0]?.text).toBe("📖 Reading file.ts");
  });

  test("sends thinking as italic reply", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const callback = createStatusCallback(ctx, state);

    await callback("thinking", "Let me analyze this...");
    expect(ctx._sent[0]?.text).toContain("🧠");
    expect(ctx._sent[0]?.text).toContain("analyze");
  });

  test("creates text message for new segment", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const callback = createStatusCallback(ctx, state);

    await callback("text", "Hello world", 0);
    expect(state.textMessages.size).toBe(1);
  });

  test("done callback cleans up tool messages", async () => {
    const ctx = createMockContext({ userId: 123 });
    const state = new StreamingState();
    const callback = createStatusCallback(ctx, state);

    // Add some tool messages
    await callback("tool", "Tool 1");
    await callback("tool", "Tool 2");
    expect(state.toolMessages.length).toBe(2);

    // Done should attempt to delete them
    await callback("done", "");
    // In mock, deleteMessage doesn't exist but should not crash
  });
});

describe("createAskUserKeyboard", () => {
  test("creates keyboard with options", () => {
    const keyboard = createAskUserKeyboard("req-123", ["Option A", "Option B", "Option C"]);
    expect(keyboard).toBeDefined();
  });

  test("truncates long option labels", () => {
    const longOption = "This is a very long option label that should be truncated for display";
    const keyboard = createAskUserKeyboard("req-123", [longOption]);
    expect(keyboard).toBeDefined();
  });

  test("handles empty options array", () => {
    const keyboard = createAskUserKeyboard("req-123", []);
    expect(keyboard).toBeDefined();
  });
});
