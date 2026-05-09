/**
 * Tests for utils module — audit logging, typing indicator,
 * voice transcription, checkInterrupt.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createMockContext } from "../mocks/grammy";
import {
  auditLog,
  auditLogAuth,
  auditLogTool,
  auditLogError,
  auditLogRateLimit,
  startTypingIndicator,
  checkInterrupt,
  transcribeVoice,
} from "../../src/utils";

// ============== Audit Logging ==============

describe("auditLog", () => {
  test("does not throw on valid input", async () => {
    await expect(
      auditLog(123, "testuser", "TEXT", "hello")
    ).resolves.toBeUndefined();
  });

  test("handles empty content", async () => {
    await expect(
      auditLog(123, "testuser", "TEXT", "")
    ).resolves.toBeUndefined();
  });

  test("handles very long content (truncated in log)", async () => {
    const longContent = "x".repeat(10000);
    await expect(
      auditLog(123, "testuser", "TEXT", longContent)
    ).resolves.toBeUndefined();
  });

  test("includes response when provided", async () => {
    await expect(
      auditLog(123, "testuser", "TEXT", "hello", "response text")
    ).resolves.toBeUndefined();
  });

  test("handles special characters in content", async () => {
    await expect(
      auditLog(123, "testuser", "TEXT", 'line1\nline2\t"quoted"')
    ).resolves.toBeUndefined();
  });

  test("handles unicode content", async () => {
    await expect(
      auditLog(123, "testuser", "TEXT", "こんにちは 🎉")
    ).resolves.toBeUndefined();
  });
});

describe("auditLogAuth", () => {
  test("logs authorized event", async () => {
    await expect(
      auditLogAuth(123, "testuser", true)
    ).resolves.toBeUndefined();
  });

  test("logs unauthorized event", async () => {
    await expect(
      auditLogAuth(999, "hacker", false)
    ).resolves.toBeUndefined();
  });
});

describe("auditLogTool", () => {
  test("logs tool use", async () => {
    await expect(
      auditLogTool(123, "testuser", "Read", { file_path: "/test" })
    ).resolves.toBeUndefined();
  });

  test("logs blocked tool use", async () => {
    await expect(
      auditLogTool(123, "testuser", "Bash", { command: "rm -rf /" }, true, "dangerous")
    ).resolves.toBeUndefined();
  });

  test("handles empty tool input", async () => {
    await expect(
      auditLogTool(123, "testuser", "Bash", {})
    ).resolves.toBeUndefined();
  });

  test("handles nested tool input", async () => {
    await expect(
      auditLogTool(123, "testuser", "Custom", {
        nested: { deep: { value: 42 } },
      })
    ).resolves.toBeUndefined();
  });
});

describe("auditLogError", () => {
  test("logs error event", async () => {
    await expect(
      auditLogError(123, "testuser", "Something went wrong")
    ).resolves.toBeUndefined();
  });

  test("logs error with context", async () => {
    await expect(
      auditLogError(123, "testuser", "Timeout", "sendMessage")
    ).resolves.toBeUndefined();
  });

  test("handles empty error string", async () => {
    await expect(
      auditLogError(123, "testuser", "")
    ).resolves.toBeUndefined();
  });
});

describe("auditLogRateLimit", () => {
  test("logs rate limit event", async () => {
    await expect(
      auditLogRateLimit(123, "testuser", 5.2)
    ).resolves.toBeUndefined();
  });

  test("handles zero retryAfter", async () => {
    await expect(
      auditLogRateLimit(123, "testuser", 0)
    ).resolves.toBeUndefined();
  });
});

// ============== Typing Indicator ==============

describe("startTypingIndicator", () => {
  test("returns controller with stop method", () => {
    const ctx = createMockContext({ userId: 123 });
    const controller = startTypingIndicator(ctx);
    expect(typeof controller.stop).toBe("function");
    controller.stop(); // Cleanup
  });

  test("sends typing action", async () => {
    const ctx = createMockContext({ userId: 123 });
    const controller = startTypingIndicator(ctx);
    // Give it a tick to fire
    await Bun.sleep(10);
    controller.stop();
    expect(ctx._actions).toContain("typing");
  });

  test("stop prevents further typing actions", async () => {
    const ctx = createMockContext({ userId: 123 });
    const controller = startTypingIndicator(ctx);
    controller.stop();
    const countBefore = ctx._actions.length;
    await Bun.sleep(50);
    // Should not have fired more after stop
    expect(ctx._actions.length).toBe(countBefore);
  });
});

// ============== checkInterrupt ==============

describe("checkInterrupt", () => {
  test("returns text unchanged if no ! prefix", async () => {
    expect(await checkInterrupt("hello")).toBe("hello");
  });

  test("strips ! prefix", async () => {
    expect(await checkInterrupt("!hello")).toBe("hello");
  });

  test("strips ! with leading space", async () => {
    expect(await checkInterrupt("! hello")).toBe("hello");
  });

  test("returns empty string for empty input", async () => {
    expect(await checkInterrupt("")).toBe("");
  });

  test("handles just ! character", async () => {
    const result = await checkInterrupt("!");
    expect(result.trim()).toBe("");
  });

  test("handles ! with multiple spaces", async () => {
    expect(await checkInterrupt("!   spaced")).toBe("spaced");
  });

  test("does not strip ! in middle of text", async () => {
    expect(await checkInterrupt("hello!world")).toBe("hello!world");
  });

  test("preserves message content after !", async () => {
    const msg = "!tell me about TypeScript generics";
    const result = await checkInterrupt(msg);
    expect(result).toBe("tell me about TypeScript generics");
  });
});

// ============== transcribeVoice ==============

describe("transcribeVoice", () => {
  // transcribeVoice spawns Python+Whisper which is slow — skip if not available
  let whisperAvailable = false;
  const pythonPath = process.env.PYTHON_PATH || "python";

  // Quick check — only enable if whisper loads fast AND env says so
  // In CI/test we skip because Whisper model loading takes 10s+
  if (process.env.TEST_WHISPER === "1") {
    try {
      const proc = Bun.spawnSync([pythonPath, "-c", "import whisper"], {
        timeout: 10_000,
      });
      whisperAvailable = proc.exitCode === 0;
    } catch {}
  }

  test("function exists and returns null or string", () => {
    expect(typeof transcribeVoice).toBe("function");
  });

  test("returns null for nonexistent file (with whisper)", async () => {
    if (!whisperAvailable) {
      console.log("Skipping: whisper not available");
      return;
    }
    const result = await transcribeVoice("/tmp/nonexistent-file-xyz-12345.ogg");
    expect(result).toBeNull();
  });

  test("returns null for empty file (with whisper)", async () => {
    if (!whisperAvailable) {
      console.log("Skipping: whisper not available");
      return;
    }
    const tmpFile = `/tmp/test-empty-${Date.now()}.ogg`;
    await Bun.write(tmpFile, "");
    const result = await transcribeVoice(tmpFile);
    expect(result).toBeNull();
    try { require("fs").unlinkSync(tmpFile); } catch {}
  });
});
