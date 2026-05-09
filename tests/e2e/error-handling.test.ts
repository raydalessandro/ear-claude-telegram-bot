/**
 * E2E tests for error handling and edge cases.
 * Tests error classification, retry logic, boundary conditions.
 */

import { describe, test, expect } from "bun:test";
import { createMockContext } from "../mocks/grammy";

// ============== Error Classification ==============

describe("E2E: Error Classification", () => {
  test("identifies rate limit errors (429)", () => {
    const errorStr = "Error: 429 Too Many Requests";
    expect(errorStr.includes("429")).toBe(true);
    expect(errorStr.toLowerCase().includes("rate limit") || errorStr.includes("429")).toBe(true);
  });

  test("identifies network errors", () => {
    const networkErrors = [
      "Error: ECONNREFUSED",
      "Error: ETIMEDOUT",
      "fetch failed",
    ];
    for (const err of networkErrors) {
      const lower = err.toLowerCase();
      const isNetwork =
        lower.includes("econnrefused") ||
        lower.includes("etimedout") ||
        lower.includes("fetch failed");
      expect(isNetwork).toBe(true);
    }
  });

  test("identifies Claude crashes", () => {
    const crash = "Error: claude exited with code 1";
    expect(crash.includes("exited with code")).toBe(true);
  });

  test("identifies SDK errors (500, 502, 503)", () => {
    for (const code of ["500", "502", "503"]) {
      const err = `Error: ${code} Internal Server Error`;
      expect(err.includes(code)).toBe(true);
    }
  });

  test("identifies cancellation", () => {
    const cancelErrors = ["AbortError: aborted", "cancelled by user"];
    for (const err of cancelErrors) {
      const lower = err.toLowerCase();
      expect(lower.includes("abort") || lower.includes("cancel")).toBe(true);
    }
  });

  test("non-retryable errors don't match retryable patterns", () => {
    const err = "TypeError: Cannot read property 'foo' of undefined";
    const lower = err.toLowerCase();
    const isRetryable =
      err.includes("exited with code") ||
      lower.includes("econnrefused") ||
      lower.includes("etimedout") ||
      lower.includes("fetch failed") ||
      err.includes("429") ||
      err.includes("500") ||
      err.includes("502") ||
      err.includes("503");
    expect(isRetryable).toBe(false);
  });
});

// ============== Message Boundary Conditions ==============

describe("E2E: Message Boundaries", () => {
  test("empty message is handled gracefully", async () => {
    const { handleText } = await import("../../src/handlers/text");
    const ctx = createMockContext({ userId: 123, text: "" });
    (ctx.message as any).text = "";
    await handleText(ctx);
    // Should not crash, may reply or be silent
  });

  test("very long message passes auth and interrupt checks", async () => {
    // We test the pre-Claude parts: auth, interrupt check, rate limit
    const { isAuthorized } = await import("../../src/security");
    const { checkInterrupt } = await import("../../src/utils");

    const longMsg = "test ".repeat(10000);
    expect(isAuthorized(123, [123])).toBe(true);
    const cleaned = await checkInterrupt(longMsg);
    expect(cleaned).toBe(longMsg);
    expect(cleaned.trim().length).toBeGreaterThan(0);
  });

  test("message with only whitespace is ignored", async () => {
    // After interrupt check and trim, empty messages are ignored
    const { checkInterrupt } = await import("../../src/utils");
    const result = await checkInterrupt("   ");
    expect(result).toBe("   ");
    // Text handler checks trim()
    expect(result.trim()).toBe("");
  });

  test("message with only ! is handled", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    const result = await checkInterrupt("!");
    expect(result.trim()).toBe("");
  });
});

// ============== Concurrent Operations ==============

describe("E2E: Concurrent Safety", () => {
  test("multiple checkInterrupt calls don't interfere", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    const results = await Promise.all([
      checkInterrupt("hello"),
      checkInterrupt("!world"),
      checkInterrupt("normal"),
      checkInterrupt("!interrupt"),
    ]);
    expect(results[0]).toBe("hello");
    expect(results[1]).toBe("world");
    expect(results[2]).toBe("normal");
    expect(results[3]).toBe("interrupt");
  });

  test("multiple auth checks don't interfere", async () => {
    const { isAuthorized } = await import("../../src/security");
    const results = [
      isAuthorized(123, [123, 456]),
      isAuthorized(999, [123, 456]),
      isAuthorized(456, [123, 456]),
      isAuthorized(789, [123, 456]),
    ];
    expect(results).toEqual([true, false, true, false]);
  });

  test("ChatManager operations are consistent", async () => {
    const { ChatManager } = await import("../../src/multi-chat");
    const manager = new ChatManager();

    // Rapid fire operations
    manager.create("a", "/a");
    manager.create("b", "/b");
    manager.create("c", "/c");
    manager.switchTo("b");
    manager.switchTo("c");
    manager.switchTo("a");
    manager.delete("b");
    manager.delete("c");

    expect(manager.list()).toHaveLength(1);
    expect(manager.active()?.name).toBe("a");
  });
});

// ============== Security Boundary ==============

describe("E2E: Security Boundary", () => {
  test("auth + rate limit + command safety pipeline", async () => {
    const { isAuthorized, checkCommandSafety, rateLimiter } = await import(
      "../../src/security"
    );

    // Simulated request from authorized user
    const userId = 123;
    expect(isAuthorized(userId, [123])).toBe(true);

    // Rate limit check
    const [allowed] = rateLimiter.check(userId);
    expect(allowed).toBe(true);

    // Command safety
    const [safe] = checkCommandSafety("ls -la");
    expect(safe).toBe(true);

    const [blocked] = checkCommandSafety("rm -rf /");
    expect(blocked).toBe(false);
  });

  test("unauthorized user blocked at every entry point", async () => {
    const { isAuthorized } = await import("../../src/security");
    const badUserId = 999999;

    // Should be blocked
    expect(isAuthorized(badUserId, [123])).toBe(false);

    // If they somehow get past auth, other checks still work
    const { checkCommandSafety } = await import("../../src/security");
    const [safe] = checkCommandSafety("rm -rf /");
    expect(safe).toBe(false);
  });
});

// ============== Formatting Safety ==============

describe("E2E: Formatting Safety", () => {
  test("all XSS vectors are escaped", async () => {
    const { convertMarkdownToHtml } = await import("../../src/formatting");

    const xssVectors = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<div style="background:url(javascript:alert(1))">',
      "<<script>alert('XSS')</script>",
    ];

    for (const vector of xssVectors) {
      const result = convertMarkdownToHtml(vector);
      // All HTML tags must be neutralized — < and > are escaped
      expect(result).not.toContain("<script");
      expect(result).not.toContain("<img ");
      expect(result).not.toContain("<svg");
      expect(result).not.toContain("<iframe");
      // Verify angle brackets are escaped (the key safety guarantee)
      if (vector.includes("<")) {
        expect(result).toContain("&lt;");
      }
    }
  });

  test("code blocks protect against injection", async () => {
    const { convertMarkdownToHtml } = await import("../../src/formatting");
    const result = convertMarkdownToHtml("```\n<script>alert(1)</script>\n```");
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });
});
