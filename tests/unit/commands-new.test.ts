/**
 * TDD tests for new commands.
 *
 * /model, /dir, /files, /git, /think, /compact, /history
 * /chat new|list|switch|delete|rename
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createMockContext } from "../mocks/grammy";
import {
  handleModel,
  handleDir,
  handleFiles,
  handleGit,
  handleThink,
  handleCompact,
  handleHistory,
  handleChat,
  handlePipeline,
  parseCommandArgs,
  _resetState,
} from "../../src/handlers/commands-new";
import { _resetChatManager } from "../../src/chat-state";

const ALLOWED = [123];

// ============== Argument Parsing ==============

describe("parseCommandArgs", () => {
  test("extracts command args from text", () => {
    expect(parseCommandArgs("/model sonnet")).toBe("sonnet");
    expect(parseCommandArgs("/dir /home/user")).toBe("/home/user");
    expect(parseCommandArgs("/chat new bot")).toBe("new bot");
  });

  test("returns empty string when no args", () => {
    expect(parseCommandArgs("/model")).toBe("");
    expect(parseCommandArgs("/model ")).toBe("");
  });

  test("handles extra whitespace", () => {
    expect(parseCommandArgs("/model   sonnet  ")).toBe("sonnet");
  });

  test("preserves multi-word args", () => {
    expect(parseCommandArgs("/chat new my project")).toBe("new my project");
  });

  test("handles @botname suffix", () => {
    expect(parseCommandArgs("/model@mybot sonnet")).toBe("sonnet");
  });
});

// ============== /model ==============

describe("/model command", () => {
  test("shows current model when no args", async () => {
    const ctx = createMockContext({ text: "/model", userId: 123 });
    await handleModel(ctx, ALLOWED);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("model");
  });

  test("switches to sonnet", async () => {
    const ctx = createMockContext({ text: "/model sonnet", userId: 123 });
    await handleModel(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("sonnet");
  });

  test("switches to opus", async () => {
    const ctx = createMockContext({ text: "/model opus", userId: 123 });
    await handleModel(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("opus");
  });

  test("switches to haiku", async () => {
    const ctx = createMockContext({ text: "/model haiku", userId: 123 });
    await handleModel(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("haiku");
  });

  test("case insensitive", async () => {
    const ctx = createMockContext({ text: "/model SONNET", userId: 123 });
    await handleModel(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("sonnet");
  });

  test("rejects invalid model name", async () => {
    const ctx = createMockContext({ text: "/model gpt4", userId: 123 });
    await handleModel(ctx, ALLOWED);
    const reply = ctx._sent[0]?.text;
    expect(reply).toMatch(/invalid|unknown|available/i);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/model sonnet", userId: 999 });
    await handleModel(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });

  test("lists available models", async () => {
    const ctx = createMockContext({ text: "/model", userId: 123 });
    await handleModel(ctx, ALLOWED);
    const reply = ctx._sent[0]?.text;
    expect(reply).toContain("opus");
    expect(reply).toContain("sonnet");
    expect(reply).toContain("haiku");
  });
});

// ============== /dir ==============

describe("/dir command", () => {
  test("shows current directory when no args", async () => {
    const ctx = createMockContext({ text: "/dir", userId: 123 });
    await handleDir(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("directory");
  });

  test("changes directory to valid path", async () => {
    // Use a path that actually exists
    const ctx = createMockContext({ text: `/dir ${process.cwd()}`, userId: 123 });
    await handleDir(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain(process.cwd().replace(/\\/g, "/").split("/").pop()!);
  });

  test("rejects non-existent path", async () => {
    const ctx = createMockContext({ text: "/dir /nonexistent/path/xyz", userId: 123 });
    await handleDir(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/not found|doesn.*exist|invalid|error/i);
  });

  test("rejects path outside allowed paths", async () => {
    const ctx = createMockContext({ text: "/dir /etc/shadow", userId: 123 });
    await handleDir(ctx, ALLOWED);
    // On Windows, path may not exist so "not found" fires; on Unix, "not allowed"
    expect(ctx._sent[0]?.text).toMatch(/not allowed|denied|outside|not found/i);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/dir", userId: 999 });
    await handleDir(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /files ==============

describe("/files command", () => {
  test("lists files in current directory", async () => {
    const ctx = createMockContext({ text: "/files", userId: 123 });
    await handleFiles(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
    // Should contain at least package.json since we're in v2/
    expect(ctx._sent[0]?.text).toContain("package.json");
  });

  test("accepts optional subdirectory", async () => {
    const ctx = createMockContext({ text: "/files src", userId: 123 });
    await handleFiles(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toBeDefined();
  });

  test("shows file count", async () => {
    const ctx = createMockContext({ text: "/files", userId: 123 });
    await handleFiles(ctx, ALLOWED);
    // Should mention how many files
    expect(ctx._sent[0]?.text).toMatch(/\d/);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/files", userId: 999 });
    await handleFiles(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /git ==============

describe("/git command", () => {
  test("shows git status", async () => {
    const ctx = createMockContext({ text: "/git", userId: 123 });
    await handleGit(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("handles non-git directory", async () => {
    // Working dir may or may not be a git repo
    const ctx = createMockContext({ text: "/git", userId: 123 });
    await handleGit(ctx, ALLOWED);
    // Should not crash
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("supports subcommands: /git log", async () => {
    const ctx = createMockContext({ text: "/git log", userId: 123 });
    await handleGit(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("supports subcommands: /git diff", async () => {
    const ctx = createMockContext({ text: "/git diff", userId: 123 });
    await handleGit(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("blocks dangerous git commands", async () => {
    const ctx = createMockContext({ text: "/git push --force", userId: 123 });
    await handleGit(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/blocked|denied|not allowed|dangerous/i);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/git", userId: 999 });
    await handleGit(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /think ==============

describe("/think command", () => {
  test("shows current thinking mode when no args", async () => {
    const ctx = createMockContext({ text: "/think", userId: 123 });
    await handleThink(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/think/i);
  });

  test("sets thinking to off", async () => {
    const ctx = createMockContext({ text: "/think off", userId: 123 });
    await handleThink(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/off/i);
  });

  test("sets thinking to normal", async () => {
    const ctx = createMockContext({ text: "/think normal", userId: 123 });
    await handleThink(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/normal/i);
  });

  test("sets thinking to deep", async () => {
    const ctx = createMockContext({ text: "/think deep", userId: 123 });
    await handleThink(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/deep/i);
  });

  test("toggles mode when no arg: off→normal→deep→off", async () => {
    // Reset to known state
    _resetState();
    // First call (from default off) → should go to normal
    const ctx1 = createMockContext({ text: "/think", userId: 123 });
    await handleThink(ctx1, ALLOWED);
    expect(ctx1._sent[0]?.text).toMatch(/normal/i);

    // Second call → deep
    const ctx2 = createMockContext({ text: "/think", userId: 123 });
    await handleThink(ctx2, ALLOWED);
    expect(ctx2._sent[0]?.text).toMatch(/deep/i);

    // Third call → off
    const ctx3 = createMockContext({ text: "/think", userId: 123 });
    await handleThink(ctx3, ALLOWED);
    expect(ctx3._sent[0]?.text).toMatch(/off/i);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/think", userId: 999 });
    await handleThink(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /compact ==============

describe("/compact command", () => {
  test("triggers compaction", async () => {
    const ctx = createMockContext({ text: "/compact", userId: 123 });
    await handleCompact(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
    expect(ctx._sent[0]?.text).toMatch(/compact/i);
  });

  test("rejects when no active session", async () => {
    const ctx = createMockContext({ text: "/compact", userId: 123 });
    await handleCompact(ctx, ALLOWED);
    // Should work or say no session
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/compact", userId: 999 });
    await handleCompact(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /history ==============

describe("/history command", () => {
  test("shows message history", async () => {
    const ctx = createMockContext({ text: "/history", userId: 123 });
    await handleHistory(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("accepts count argument", async () => {
    const ctx = createMockContext({ text: "/history 5", userId: 123 });
    await handleHistory(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/history", userId: 999 });
    await handleHistory(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /chat ==============

describe("/chat command", () => {
  test("/chat with no subcommand shows help", async () => {
    const ctx = createMockContext({ text: "/chat", userId: 123 });
    await handleChat(ctx, ALLOWED);
    const reply = ctx._sent[0]?.text;
    expect(reply).toMatch(/list|new|switch|delete/i);
  });

  test("/chat list shows all chats", async () => {
    const ctx = createMockContext({ text: "/chat list", userId: 123 });
    await handleChat(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("/chat new creates a chat", async () => {
    const ctx = createMockContext({ text: "/chat new myproject", userId: 123 });
    await handleChat(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("myproject");
  });

  test("/chat new requires a name", async () => {
    const ctx = createMockContext({ text: "/chat new", userId: 123 });
    await handleChat(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/usage|name/i);
  });

  test("/chat switch changes active chat", async () => {
    // Setup: create two chats first
    const ctx1 = createMockContext({ text: "/chat new project1", userId: 123 });
    await handleChat(ctx1, ALLOWED);
    const ctx2 = createMockContext({ text: "/chat new project2", userId: 123 });
    await handleChat(ctx2, ALLOWED);

    const ctx3 = createMockContext({ text: "/chat switch project2", userId: 123 });
    await handleChat(ctx3, ALLOWED);
    expect(ctx3._sent[0]?.text).toContain("project2");
  });

  test("/chat switch to unknown name shows error", async () => {
    const ctx = createMockContext({ text: "/chat switch nonexistent", userId: 123 });
    await handleChat(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/not found|error/i);
  });

  test("/chat delete removes a chat", async () => {
    // Create two chats, switch to second, delete first
    const ctx1 = createMockContext({ text: "/chat new tobedeleted", userId: 123 });
    await handleChat(ctx1, ALLOWED);
    const ctx2 = createMockContext({ text: "/chat new keeper", userId: 123 });
    await handleChat(ctx2, ALLOWED);
    const ctx3 = createMockContext({ text: "/chat switch keeper", userId: 123 });
    await handleChat(ctx3, ALLOWED);

    const ctx4 = createMockContext({ text: "/chat delete tobedeleted", userId: 123 });
    await handleChat(ctx4, ALLOWED);
    expect(ctx4._sent[0]?.text).toMatch(/deleted|removed/i);
  });

  test("/chat delete active chat shows error", async () => {
    // Reset so "onlychat" is the only (and active) chat
    _resetChatManager();
    const ctx1 = createMockContext({ text: "/chat new onlychat", userId: 123 });
    await handleChat(ctx1, ALLOWED);

    const ctx2 = createMockContext({ text: "/chat delete onlychat", userId: 123 });
    await handleChat(ctx2, ALLOWED);
    expect(ctx2._sent[0]?.text).toMatch(/cannot|active|error/i);
  });

  test("/chat rename renames a chat", async () => {
    const ctx1 = createMockContext({ text: "/chat new oldname", userId: 123 });
    await handleChat(ctx1, ALLOWED);

    const ctx2 = createMockContext({ text: "/chat rename oldname newname", userId: 123 });
    await handleChat(ctx2, ALLOWED);
    expect(ctx2._sent[0]?.text).toContain("newname");
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/chat list", userId: 999 });
    await handleChat(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});

// ============== /pipeline ==============

describe("/pipeline command", () => {
  test("shows pipeline status", async () => {
    const ctx = createMockContext({ text: "/pipeline", userId: 123 });
    await handlePipeline(ctx, ALLOWED);
    expect(ctx._sent.length).toBeGreaterThan(0);
  });

  test("/pipeline enable image enables image tool", async () => {
    const ctx = createMockContext({ text: "/pipeline enable image", userId: 123 });
    await handlePipeline(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/enabled|image/i);
  });

  test("/pipeline disable audio disables audio tool", async () => {
    const ctx = createMockContext({ text: "/pipeline disable audio", userId: 123 });
    await handlePipeline(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/disabled|audio/i);
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/pipeline", userId: 999 });
    await handlePipeline(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});
