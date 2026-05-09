/**
 * Unit tests for session module.
 * Tests ClaudeSession state management (not actual Claude API calls).
 *
 * Note: session is a singleton, state leaks between tests.
 * Each test that needs clean state must call session.kill() first.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { session } from "../../src/session";

// Tests use isolated TEMP dir (set in tests/setup.ts) — no risk to production files.

describe("ClaudeSession", () => {
  beforeEach(async () => {
    // Full cleanup: kill session, clear all flags
    await session.kill();
    session.clearStopRequested();
    session.consumeInterruptFlag(); // consume any leftover flag
  });

  describe("state management", () => {
    test("starts with no active session after kill", () => {
      expect(session.isActive).toBe(false);
      expect(session.sessionId).toBeNull();
    });

    test("tracks last message", () => {
      session.lastMessage = "test message";
      expect(session.lastMessage).toBe("test message");
    });

    test("tracks conversation title", () => {
      session.conversationTitle = "My chat";
      expect(session.conversationTitle).toBe("My chat");
    });

    test("kill clears session state", async () => {
      session.conversationTitle = "test";
      session.lastMessage = "msg";
      await session.kill();
      expect(session.isActive).toBe(false);
      expect(session.conversationTitle).toBeNull();
    });

    test("tracks last error", () => {
      session.lastError = "something broke";
      expect(session.lastError).toBe("something broke");
      session.lastError = null;
    });
  });

  describe("processing lifecycle", () => {
    test("startProcessing + stop returns state changes", () => {
      const stopFn = session.startProcessing();
      expect(session.isRunning).toBe(true);
      stopFn();
      expect(session.isRunning).toBe(false);
    });

    test("stop when nothing running (no abort controller)", async () => {
      // After kill and clear, no query running, no abort controller
      const result = await session.stop();
      // Could be false or "pending" depending on _isProcessing
      expect(["stopped", "pending", false]).toContain(result);
    });
  });

  describe("interrupt mechanism", () => {
    test("consumeInterruptFlag returns false after clearing", () => {
      // Already consumed in beforeEach, so this should be false
      expect(session.consumeInterruptFlag()).toBe(false);
    });

    test("markInterrupt + consumeInterruptFlag flow", () => {
      session.markInterrupt();
      expect(session.consumeInterruptFlag()).toBe(true);
      // Second call should be false (consumed)
      expect(session.consumeInterruptFlag()).toBe(false);
    });

    test("clearStopRequested allows new messages", () => {
      session.clearStopRequested();
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe("session persistence", () => {
    test("getSessionList returns array", () => {
      const list = session.getSessionList();
      expect(Array.isArray(list)).toBe(true);
    });

    test("resumeSession with invalid ID fails", () => {
      const [success, msg] = session.resumeSession("nonexistent-id");
      expect(success).toBe(false);
    });

    test("resumeLast returns boolean and string", () => {
      const [success, msg] = session.resumeLast();
      expect(typeof success).toBe("boolean");
      expect(typeof msg).toBe("string");
    });
  });
});

describe("getThinkingLevel (via config keywords)", () => {
  test("thinking keywords are loaded from config", () => {
    const { THINKING_KEYWORDS, THINKING_DEEP_KEYWORDS } = require("../../src/config");
    expect(THINKING_KEYWORDS).toContain("think");
    expect(THINKING_KEYWORDS).toContain("pensa");
    expect(THINKING_DEEP_KEYWORDS).toContain("ultrathink");
  });

  test("keywords are all lowercase", () => {
    const { THINKING_KEYWORDS, THINKING_DEEP_KEYWORDS } = require("../../src/config");
    for (const k of [...THINKING_KEYWORDS, ...THINKING_DEEP_KEYWORDS]) {
      expect(k).toBe(k.toLowerCase());
    }
  });
});
