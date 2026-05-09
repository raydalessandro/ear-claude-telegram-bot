/**
 * Tests for all injection systems — GRAFO, boot, safety prompt,
 * date/time injection, settings sources, thinking keywords.
 *
 * Tests the CODE, not local configuration. Works without .env.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

// ============== GRAFO Injection ==============

describe("GRAFO injection system", () => {
  test("injectGrafoContext function exists in text handler", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    expect(textSrc).toContain("injectGrafoContext");
    expect(textSrc).toContain("GRAFO_INJECT_SCRIPT");
  });

  test("GRAFO injection is called before Claude receives message", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    const grafoIdx = textSrc.indexOf("injectGrafoContext(message)");
    const sendIdx = textSrc.indexOf("sendMessageStreaming");
    expect(grafoIdx).toBeGreaterThan(-1);
    expect(sendIdx).toBeGreaterThan(-1);
    expect(grafoIdx).toBeLessThan(sendIdx);
  });

  test("GRAFO context is prepended to message, not appended", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    expect(textSrc).toContain("grafoContext + message");
  });

  test("GRAFO injection fails silently (does not block message)", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    expect(textSrc).toContain('return ""');
    expect(textSrc).toContain("catch (error)");
    expect(textSrc).toContain("GRAFO injection failed");
  });

  test("GRAFO script receives user message as argument", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    expect(textSrc).toContain("scriptPath, userMessage");
  });

  test("GRAFO injection has timeout (5s)", () => {
    const textSrc = readFileSync(resolve(__dirname, "../../src/handlers/text.ts"), "utf-8");
    expect(textSrc).toContain("timeout: 5000");
  });
});

// ============== Boot CLAUDE.md ==============

describe("boot CLAUDE.md injection", () => {
  test("session uses WORKING_DIR as cwd", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("cwd: WORKING_DIR");
  });

  test("session passes settingSources for user and project settings", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain('settingSources: ["user", "project"]');
  });

  test(".env.example documents CLAUDE_WORKING_DIR", () => {
    const envExample = readFileSync(resolve(__dirname, "../../.env.example"), "utf-8");
    expect(envExample).toContain("CLAUDE_WORKING_DIR");
  });
});

// ============== Safety Prompt Injection ==============

describe("safety prompt injection", () => {
  test("SAFETY_PROMPT is generated and non-empty", () => {
    const { SAFETY_PROMPT } = require("../../src/config");
    expect(SAFETY_PROMPT.length).toBeGreaterThan(100);
  });

  test("SAFETY_PROMPT contains critical rules", () => {
    const { SAFETY_PROMPT } = require("../../src/config");
    expect(SAFETY_PROMPT).toContain("NEVER delete");
    expect(SAFETY_PROMPT).toContain("confirmation");
    expect(SAFETY_PROMPT).toContain("ONLY access files");
    expect(SAFETY_PROMPT).toContain("dangerous commands");
    expect(SAFETY_PROMPT).toContain("Telegram");
  });

  test("SAFETY_PROMPT is injected as systemPrompt in session", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("systemPrompt: SAFETY_PROMPT");
  });
});

// ============== Date/Time Injection ==============

describe("date/time injection", () => {
  test("new sessions inject current date/time", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("Current date/time:");
    expect(sessionSrc).toContain("isNewSession");
    expect(sessionSrc).toContain("datePrefix");
  });

  test("date is injected BEFORE user message", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("datePrefix + message");
  });

  test("date injection only happens on first message", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("if (isNewSession)");
  });
});

// ============== Thinking Keywords ==============

describe("thinking keyword injection", () => {
  test("thinking keywords are loaded from config", () => {
    const { THINKING_KEYWORDS, THINKING_DEEP_KEYWORDS } = require("../../src/config");
    expect(THINKING_KEYWORDS.length).toBeGreaterThan(0);
    expect(THINKING_DEEP_KEYWORDS.length).toBeGreaterThan(0);
  });

  test("deep keywords checked BEFORE normal keywords", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    const deepIdx = sessionSrc.indexOf("THINKING_DEEP_KEYWORDS");
    const normalIdx = sessionSrc.indexOf("THINKING_KEYWORDS.some");
    expect(deepIdx).toBeLessThan(normalIdx);
  });

  test("deep thinking returns 50000 tokens", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("return 50000");
  });

  test("normal thinking returns 10000 tokens", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("return 10000");
  });

  test("maxThinkingTokens is passed to SDK options", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("maxThinkingTokens: thinkingTokens");
  });
});

// ============== Session Security Injection ==============

describe("session security injection", () => {
  test("CLAUDECODE env var is removed to prevent nested sessions", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("delete cleanEnv.CLAUDECODE");
  });

  test("permissionMode is set to bypassPermissions", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain('permissionMode: "bypassPermissions"');
  });

  test("additionalDirectories includes ALLOWED_PATHS", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("additionalDirectories: ALLOWED_PATHS");
  });

  test("Bash commands are safety-checked before execution", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("checkCommandSafety");
    expect(sessionSrc).toContain('toolName === "Bash"');
  });

  test("file operations are path-checked", () => {
    const sessionSrc = readFileSync(resolve(__dirname, "../../src/session.ts"), "utf-8");
    expect(sessionSrc).toContain("isPathAllowed");
    expect(sessionSrc).toContain('"Read", "Write", "Edit"');
  });
});

// ============== Command Registration ==============

describe("v2 command registration", () => {
  test("index.ts imports and registers all new commands", () => {
    const indexSrc = readFileSync(resolve(__dirname, "../../src/index.ts"), "utf-8");
    for (const cmd of ["model", "dir", "files", "git", "think", "compact", "history", "chat", "pipeline", "title"]) {
      expect(indexSrc).toContain(`bot.command("${cmd}"`);
    }
  });

  test("/start message lists new commands", () => {
    const cmdSrc = readFileSync(resolve(__dirname, "../../src/handlers/commands.ts"), "utf-8");
    for (const cmd of ["/model", "/dir", "/git", "/think", "/chat", "/pipeline", "/title"]) {
      expect(cmdSrc).toContain(cmd);
    }
  });

  test(".env.example documents all optional config", () => {
    const envExample = readFileSync(resolve(__dirname, "../../.env.example"), "utf-8");
    expect(envExample).toContain("TELEGRAM_BOT_TOKEN");
    expect(envExample).toContain("TELEGRAM_ALLOWED_USERS");
    expect(envExample).toContain("CLAUDE_WORKING_DIR");
    expect(envExample).toContain("PYTHON_PATH");
    expect(envExample).toContain("GRAFO_INJECT_SCRIPT");
    expect(envExample).toContain("THINKING_KEYWORDS");
  });
});
