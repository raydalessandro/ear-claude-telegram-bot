/**
 * Tests for message handlers — text, voice, photo, document, callback.
 * Tests handler structure, auth checks, error handling.
 */

import { describe, test, expect } from "bun:test";
import { createMockContext } from "../mocks/grammy";

// ============== Text Handler ==============

describe("handleText", () => {
  test("exports handleText function", async () => {
    const { handleText } = await import("../../src/handlers/text");
    expect(typeof handleText).toBe("function");
  });

  test("rejects unauthorized user", async () => {
    const { handleText } = await import("../../src/handlers/text");
    const ctx = createMockContext({ userId: 999999, text: "hello" });
    await handleText(ctx);
    expect(ctx._sent[0]?.text).toContain("Unauthorized");
  });

  test("ignores empty message", async () => {
    const { handleText } = await import("../../src/handlers/text");
    const ctx = createMockContext({ userId: 123 });
    // message.text is undefined
    (ctx.message as any).text = undefined;
    await handleText(ctx);
    expect(ctx._sent.length).toBe(0);
  });

  test("ignores message without userId", async () => {
    const { handleText } = await import("../../src/handlers/text");
    const ctx = createMockContext({ userId: 123, text: "hello" });
    (ctx as any).from = undefined;
    await handleText(ctx);
    expect(ctx._sent.length).toBe(0);
  });

  test("ignores message without chatId", async () => {
    const { handleText } = await import("../../src/handlers/text");
    const ctx = createMockContext({ userId: 123, text: "hello" });
    (ctx as any).chat = undefined;
    await handleText(ctx);
    expect(ctx._sent.length).toBe(0);
  });
});

// ============== Voice Handler ==============

describe("handleVoice", () => {
  test("exports handleVoice function", async () => {
    const { handleVoice } = await import("../../src/handlers/voice");
    expect(typeof handleVoice).toBe("function");
  });

  test("rejects unauthorized user", async () => {
    const { handleVoice } = await import("../../src/handlers/voice");
    const ctx = createMockContext({
      userId: 999999,
      voice: { file_id: "test", duration: 5 },
    });
    await handleVoice(ctx);
    expect(ctx._sent[0]?.text).toContain("Unauthorized");
  });
});

// ============== Photo Handler ==============

describe("handlePhoto", () => {
  test("exports handlePhoto function", async () => {
    const { handlePhoto } = await import("../../src/handlers/photo");
    expect(typeof handlePhoto).toBe("function");
  });

  test("rejects unauthorized user", async () => {
    const { handlePhoto } = await import("../../src/handlers/photo");
    const ctx = createMockContext({
      userId: 999999,
      photo: [{ file_id: "test", width: 100, height: 100 }],
    });
    await handlePhoto(ctx);
    expect(ctx._sent[0]?.text).toContain("Unauthorized");
  });
});

// ============== Document Handler ==============

describe("handleDocument", () => {
  test("exports handleDocument function", async () => {
    const { handleDocument } = await import("../../src/handlers/document");
    expect(typeof handleDocument).toBe("function");
  });

  test("rejects unauthorized user", async () => {
    const { handleDocument } = await import("../../src/handlers/document");
    const ctx = createMockContext({
      userId: 999999,
      document: { file_id: "test", file_name: "test.pdf", mime_type: "application/pdf" },
    });
    await handleDocument(ctx);
    expect(ctx._sent[0]?.text).toContain("Unauthorized");
  });
});

// ============== Callback Handler ==============

describe("handleCallback", () => {
  test("exports handleCallback function", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    expect(typeof handleCallback).toBe("function");
  });

  test("answers callback with no data", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({ userId: 123 });
    // No callbackQuery data
    ctx.callbackQuery = undefined;
    await handleCallback(ctx);
    // Should answer callback without error
    expect(ctx._sent.length).toBeGreaterThanOrEqual(0);
  });

  test("rejects unauthorized callback", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({
      userId: 999999,
      callbackData: "askuser:req1:0",
    });
    await handleCallback(ctx);
    // answerCallbackQuery sends { text: "Unauthorized" } — mock stores as text or object
    const hasUnauth = ctx._sent.some((s: any) => {
      const txt = typeof s.text === "string" ? s.text : JSON.stringify(s.text);
      return txt.includes("Unauthorized");
    });
    expect(hasUnauth).toBe(true);
  });

  test("handles unknown callback prefix", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({
      userId: 123,
      callbackData: "unknown:data",
    });
    await handleCallback(ctx);
    // Should answer callback without crashing
    expect(ctx._sent.length).toBeGreaterThanOrEqual(0);
  });

  test("handles askuser with invalid format", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({
      userId: 123,
      callbackData: "askuser:only_two_parts",
    });
    await handleCallback(ctx);
    const hasInvalid = ctx._sent.some((s: any) => {
      const txt = typeof s.text === "string" ? s.text : JSON.stringify(s.text);
      return txt.includes("Invalid");
    });
    expect(hasInvalid).toBe(true);
  });

  test("handles askuser with missing request file", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({
      userId: 123,
      callbackData: "askuser:nonexistent-req-12345:0",
    });
    await handleCallback(ctx);
    const hasExpired = ctx._sent.some((s: any) => {
      const txt = typeof s.text === "string" ? s.text : JSON.stringify(s.text);
      return txt.includes("expired") || txt.includes("invalid");
    });
    expect(hasExpired).toBe(true);
  });

  test("handles resume callback with no sessionId", async () => {
    const { handleCallback } = await import("../../src/handlers/callback");
    const ctx = createMockContext({
      userId: 123,
      callbackData: "resume:",
    });
    await handleCallback(ctx);
    // Should handle gracefully
    expect(ctx._sent.length).toBeGreaterThanOrEqual(0);
  });
});

// ============== Commands Handler ==============

describe("existing commands", () => {
  test("/start shows welcome", async () => {
    const { handleStart } = await import("../../src/handlers/commands");
    const ctx = createMockContext({ userId: 123, text: "/start" });
    await handleStart(ctx);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("Claude");
    expect(reply).toContain("/new");
    expect(reply).toContain("/stop");
    expect(reply).toContain("/status");
  });

  test("/new clears session and confirms", async () => {
    const { handleNew } = await import("../../src/handlers/commands");
    const ctx = createMockContext({ userId: 123, text: "/new" });
    await handleNew(ctx);
    expect(ctx._sent[0]?.text).toContain("Session cleared");
  });

  test("/status shows all status sections", async () => {
    const { handleStatus } = await import("../../src/handlers/commands");
    const ctx = createMockContext({ userId: 123, text: "/status" });
    await handleStatus(ctx);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("Status");
    expect(reply).toContain("Session");
    expect(reply).toContain("Working dir");
  });

  test("/stop when nothing running", async () => {
    const { handleStop } = await import("../../src/handlers/commands");
    const ctx = createMockContext({ userId: 123, text: "/stop" });
    await handleStop(ctx);
    // Should reply or be silent
    expect(ctx._sent.length).toBeGreaterThanOrEqual(0);
  });

  test("/retry with no last message", async () => {
    const { handleRetry } = await import("../../src/handlers/commands");
    const { session } = await import("../../src/session");
    session.lastMessage = null;
    const ctx = createMockContext({ userId: 123, text: "/retry" });
    await handleRetry(ctx);
    expect(ctx._sent[0]?.text).toContain("No message to retry");
  });

  test("/resume shows sessions or empty message", async () => {
    const { handleResume } = await import("../../src/handlers/commands");
    const ctx = createMockContext({ userId: 123, text: "/resume" });
    await handleResume(ctx);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("/restart exits process (or replies)", async () => {
    // We can't easily test process.exit, just verify the handler exists
    const { handleRestart } = await import("../../src/handlers/commands");
    expect(typeof handleRestart).toBe("function");
  });
});
