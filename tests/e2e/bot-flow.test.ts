/**
 * E2E tests for the bot message flow.
 *
 * Tests the full pipeline: message → handler → session → response
 * Uses mocked Telegram API and Claude session.
 */

import { describe, test, expect } from "bun:test";
import { createMockContext, createMockSession } from "../mocks/grammy";

describe("E2E: Authentication Flow", () => {
  test("unauthorized user gets rejected on text", async () => {
    const { isAuthorized } = await import("../../src/security");
    expect(isAuthorized(999, [123, 456])).toBe(false);
  });

  test("authorized user passes auth check", async () => {
    const { isAuthorized } = await import("../../src/security");
    expect(isAuthorized(123, [123, 456])).toBe(true);
  });

  test("multiple allowed users are all authorized", async () => {
    const { isAuthorized } = await import("../../src/security");
    expect(isAuthorized(123, [123, 456, 789])).toBe(true);
    expect(isAuthorized(456, [123, 456, 789])).toBe(true);
    expect(isAuthorized(789, [123, 456, 789])).toBe(true);
    expect(isAuthorized(0, [123, 456, 789])).toBe(false);
  });
});

describe("E2E: Command Routing", () => {
  test("/start shows welcome with all commands", async () => {
    const ctx = createMockContext({ userId: 123, text: "/start" });
    const { handleStart } = await import("../../src/handlers/commands");
    await handleStart(ctx);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("Claude");
    expect(reply).toContain("/new");
    expect(reply).toContain("/stop");
    expect(reply).toContain("/status");
    expect(reply).toContain("/resume");
    expect(reply).toContain("/retry");
    expect(reply).toContain("/restart");
  });

  test("/new clears session", async () => {
    const ctx = createMockContext({ userId: 123, text: "/new" });
    const { handleNew } = await import("../../src/handlers/commands");
    await handleNew(ctx);
    expect(ctx._sent[0]?.text).toContain("Session cleared");
  });

  test("/status shows bot status sections", async () => {
    const ctx = createMockContext({ userId: 123, text: "/status" });
    const { handleStatus } = await import("../../src/handlers/commands");
    await handleStatus(ctx);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("Status");
    expect(reply).toContain("Session");
    expect(reply).toContain("Query");
    expect(reply).toContain("Working dir");
  });

  test("/resume with no sessions shows message", async () => {
    const ctx = createMockContext({ userId: 123, text: "/resume" });
    const { handleResume } = await import("../../src/handlers/commands");
    // Kill session first so resume check is triggered
    const { session } = await import("../../src/session");
    await session.kill();
    await handleResume(ctx);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("/retry with no last message shows error", async () => {
    const ctx = createMockContext({ userId: 123, text: "/retry" });
    const { handleRetry } = await import("../../src/handlers/commands");
    const { session } = await import("../../src/session");
    session.lastMessage = null;
    await handleRetry(ctx);
    expect(ctx._sent[0]?.text).toContain("No message to retry");
  });
});

describe("E2E: Message Interrupts", () => {
  test("! prefix strips prefix and returns text", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    const result = await checkInterrupt("!hello");
    expect(result).toBe("hello");
  });

  test("! with spaces after prefix", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    const result = await checkInterrupt("! hello world");
    expect(result).toBe("hello world");
  });

  test("normal message passes through unchanged", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    expect(await checkInterrupt("hello")).toBe("hello");
  });

  test("empty string passes through", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    expect(await checkInterrupt("")).toBe("");
  });

  test("just ! returns empty string", async () => {
    const { checkInterrupt } = await import("../../src/utils");
    const result = await checkInterrupt("!");
    expect(result.trim()).toBe("");
  });
});

describe("E2E: Response Formatting", () => {
  test("markdown response is converted to HTML", async () => {
    const { convertMarkdownToHtml } = await import("../../src/formatting");
    const md = "**bold** and `code`";
    const html = convertMarkdownToHtml(md);
    expect(html).toContain("<b>bold</b>");
    expect(html).toContain("<code>code</code>");
  });

  test("XSS attempts are escaped", async () => {
    const { convertMarkdownToHtml } = await import("../../src/formatting");
    const dangerous = '<script>alert("xss")</script>';
    const result = convertMarkdownToHtml(dangerous);
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  test("long response is within Telegram limits", async () => {
    const { convertMarkdownToHtml } = await import("../../src/formatting");
    const longText = "Hello world. ".repeat(500);
    const result = convertMarkdownToHtml(longText);
    // Formatting shouldn't inflate size dramatically
    expect(result.length).toBeLessThan(longText.length * 2);
  });
});

describe("E2E: Multi-Chat Full Lifecycle", () => {
  test("create → message → switch → message → switch back preserves state", async () => {
    const { ChatManager } = await import("../../src/multi-chat");
    const manager = new ChatManager();

    manager.create("project-a", "/home/user/project-a");
    manager.create("project-b", "/home/user/project-b");

    expect(manager.active()!.name).toBe("project-a");
    manager.active()!.sessionId = "session-aaa";

    manager.switchTo("project-b");
    expect(manager.active()!.name).toBe("project-b");
    expect(manager.active()!.sessionId).toBeNull();
    manager.active()!.sessionId = "session-bbb";

    manager.switchTo("project-a");
    expect(manager.active()!.sessionId).toBe("session-aaa");

    expect(manager.list()).toHaveLength(2);
  });

  test("create → rename → switch → delete lifecycle", async () => {
    const { ChatManager } = await import("../../src/multi-chat");
    const manager = new ChatManager();

    manager.create("temp", "/tmp");
    manager.create("keeper", "/home");

    manager.rename("temp", "to-delete");
    manager.switchTo("keeper");
    manager.delete("to-delete");

    expect(manager.list()).toHaveLength(1);
    expect(manager.active()!.name).toBe("keeper");
  });

  test("persistence round-trip preserves full state", async () => {
    const { ChatManager } = await import("../../src/multi-chat");
    const manager = new ChatManager();

    manager.create("chat1", "/dir1");
    manager.create("chat2", "/dir2");
    manager.active()!.sessionId = "sess-1";
    manager.switchTo("chat2");
    manager.active()!.sessionId = "sess-2";

    const json = manager.toJSON();
    const restored = ChatManager.fromJSON(json);

    expect(restored.active()!.name).toBe("chat2");
    expect(restored.active()!.sessionId).toBe("sess-2");

    restored.switchTo("chat1");
    expect(restored.active()!.sessionId).toBe("sess-1");
  });
});

describe("E2E: Media Pipeline Flow", () => {
  test("unregistered media type falls through to Claude directly", async () => {
    const { MediaPipeline } = await import("../../src/media-pipeline");
    const pipeline = new MediaPipeline();

    const result = await pipeline.process("image", "/tmp/test.jpg");
    expect(result.passthrough).toBe(true);
    expect(result.processed).toBe(false);
  });

  test("registered tool processes media and returns description", async () => {
    const { MediaPipeline } = await import("../../src/media-pipeline");
    const pipeline = new MediaPipeline();

    const isWindows = process.platform === "win32";
    pipeline.register("audio", {
      name: "test-echo",
      command: isWindows ? "cmd" : "echo",
      args: isWindows
        ? ["/c", "echo", '{"text":"hello from tool"}']
        : ['{"text":"hello from tool"}'],
      enabled: true,
    });

    const result = await pipeline.process("audio", "/tmp/test.ogg");
    expect(result.processed).toBe(true);
    expect(result.error).toBeUndefined();
  });

  test("full flow: detect type → check pipeline → process or passthrough", async () => {
    const { MediaPipeline, detectMediaType } = await import("../../src/media-pipeline");
    const pipeline = new MediaPipeline();

    // Simulate the handler flow
    const filename = "photo.jpg";
    const mediaType = detectMediaType(filename);
    expect(mediaType).toBe("image");

    const result = await pipeline.process(mediaType, `/tmp/${filename}`);
    // No tool registered → passthrough
    expect(result.passthrough).toBe(true);

    // Now register a tool
    const isWindows = process.platform === "win32";
    pipeline.register("image", {
      name: "describer",
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", "A photo of a cat"] : ["A photo of a cat"],
      enabled: true,
    });

    const result2 = await pipeline.process(mediaType, `/tmp/${filename}`);
    expect(result2.processed).toBe(true);
    expect(result2.text).toContain("cat");
  });
});

describe("E2E: Security Boundaries", () => {
  test("blocked commands are rejected in safety check", async () => {
    const { checkCommandSafety } = await import("../../src/security");

    // All these should be blocked
    const dangerous = [
      "rm -rf /",
      "sudo rm important.txt",
      ":(){ :|:& };:",
      "dd if=/dev/zero of=/dev/sda",
    ];

    for (const cmd of dangerous) {
      const [safe] = checkCommandSafety(cmd);
      expect(safe).toBe(false);
    }
  });

  test("safe commands pass safety check", async () => {
    const { checkCommandSafety } = await import("../../src/security");

    const safe = [
      "ls -la",
      "git status",
      "cat file.txt",
      "npm install",
      "bun test",
      "python script.py",
    ];

    for (const cmd of safe) {
      const [isSafe] = checkCommandSafety(cmd);
      expect(isSafe).toBe(true);
    }
  });

  test("path validation blocks access outside allowed dirs", async () => {
    const { isPathAllowed } = await import("../../src/security");
    expect(isPathAllowed("/etc/passwd")).toBe(false);
    expect(isPathAllowed("/root/.ssh/id_rsa")).toBe(false);
  });
});
