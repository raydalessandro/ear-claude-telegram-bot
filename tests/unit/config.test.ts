/**
 * Tests for config module — environment parsing, path building,
 * constant validation.
 */

import { describe, test, expect } from "bun:test";
import {
  TELEGRAM_TOKEN,
  ALLOWED_USERS,
  WORKING_DIR,
  ALLOWED_PATHS,
  BLOCKED_PATTERNS,
  SAFETY_PROMPT,
  TEMP_PATHS,
  TEMP_DIR,
  SESSION_FILE,
  RESTART_FILE,
  QUERY_TIMEOUT_MS,
  TRANSCRIPTION_AVAILABLE,
  THINKING_KEYWORDS,
  THINKING_DEEP_KEYWORDS,
  MEDIA_GROUP_TIMEOUT,
  TELEGRAM_MESSAGE_LIMIT,
  TELEGRAM_SAFE_LIMIT,
  STREAMING_THROTTLE_MS,
  BUTTON_LABEL_MAX_LENGTH,
  AUDIT_LOG_PATH,
  RATE_LIMIT_ENABLED,
  RATE_LIMIT_REQUESTS,
  RATE_LIMIT_WINDOW,
  CLAUDE_CLI_PATH,
} from "../../src/config";

// ============== Core Config ==============

describe("core config", () => {
  test("TELEGRAM_TOKEN is set (from test setup)", () => {
    expect(TELEGRAM_TOKEN).toBeTruthy();
  });

  test("ALLOWED_USERS is an array of numbers", () => {
    expect(Array.isArray(ALLOWED_USERS)).toBe(true);
    for (const u of ALLOWED_USERS) {
      expect(typeof u).toBe("number");
      expect(Number.isNaN(u)).toBe(false);
    }
  });

  test("ALLOWED_USERS has at least one user", () => {
    expect(ALLOWED_USERS.length).toBeGreaterThan(0);
  });

  test("WORKING_DIR is a string", () => {
    expect(typeof WORKING_DIR).toBe("string");
    expect(WORKING_DIR.length).toBeGreaterThan(0);
  });
});

// ============== Security Config ==============

describe("security config", () => {
  test("ALLOWED_PATHS is non-empty array", () => {
    expect(Array.isArray(ALLOWED_PATHS)).toBe(true);
    expect(ALLOWED_PATHS.length).toBeGreaterThan(0);
  });

  test("ALLOWED_PATHS contains no empty strings", () => {
    for (const p of ALLOWED_PATHS) {
      expect(p.length).toBeGreaterThan(0);
    }
  });

  test("BLOCKED_PATTERNS is non-empty array", () => {
    expect(Array.isArray(BLOCKED_PATTERNS)).toBe(true);
    expect(BLOCKED_PATTERNS.length).toBeGreaterThan(0);
  });

  test("BLOCKED_PATTERNS includes critical patterns", () => {
    expect(BLOCKED_PATTERNS).toContain("rm -rf /");
    expect(BLOCKED_PATTERNS).toContain("sudo rm");
    expect(BLOCKED_PATTERNS).toContain(":(){ :|:& };:");
    expect(BLOCKED_PATTERNS).toContain("dd if=");
    expect(BLOCKED_PATTERNS).toContain("mkfs.");
  });

  test("SAFETY_PROMPT is non-empty and mentions rules", () => {
    expect(SAFETY_PROMPT.length).toBeGreaterThan(100);
    expect(SAFETY_PROMPT).toContain("SAFETY");
    expect(SAFETY_PROMPT).toContain("NEVER");
    expect(SAFETY_PROMPT).toContain("delete");
  });

  test("SAFETY_PROMPT includes all allowed paths", () => {
    for (const p of ALLOWED_PATHS) {
      expect(SAFETY_PROMPT).toContain(p);
    }
  });
});

// ============== Temp Paths ==============

describe("temp paths config", () => {
  test("TEMP_PATHS is non-empty", () => {
    expect(TEMP_PATHS.length).toBeGreaterThan(0);
  });

  test("TEMP_DIR is a valid temp path", () => {
    expect(TEMP_DIR).toBeTruthy();
    expect(TEMP_DIR).toContain("telegram-bot");
  });

  test("SESSION_FILE is in temp dir", () => {
    expect(SESSION_FILE).toContain("claude-telegram-session");
  });

  test("RESTART_FILE is in temp dir", () => {
    expect(RESTART_FILE).toContain("claude-telegram-restart");
  });
});

// ============== Constants ==============

describe("constants", () => {
  test("QUERY_TIMEOUT_MS is reasonable (1-10 minutes)", () => {
    expect(QUERY_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000);
    expect(QUERY_TIMEOUT_MS).toBeLessThanOrEqual(600_000);
  });

  test("TRANSCRIPTION_AVAILABLE is true", () => {
    expect(TRANSCRIPTION_AVAILABLE).toBe(true);
  });

  test("THINKING_KEYWORDS contains expected keywords", () => {
    expect(THINKING_KEYWORDS).toContain("think");
    expect(THINKING_KEYWORDS).toContain("pensa");
  });

  test("THINKING_DEEP_KEYWORDS contains expected keywords", () => {
    expect(THINKING_DEEP_KEYWORDS).toContain("ultrathink");
  });

  test("THINKING_KEYWORDS are all lowercase", () => {
    for (const k of THINKING_KEYWORDS) {
      expect(k).toBe(k.toLowerCase());
    }
  });

  test("TELEGRAM_MESSAGE_LIMIT is 4096", () => {
    expect(TELEGRAM_MESSAGE_LIMIT).toBe(4096);
  });

  test("TELEGRAM_SAFE_LIMIT < TELEGRAM_MESSAGE_LIMIT", () => {
    expect(TELEGRAM_SAFE_LIMIT).toBeLessThan(TELEGRAM_MESSAGE_LIMIT);
    expect(TELEGRAM_SAFE_LIMIT).toBeGreaterThan(3000);
  });

  test("STREAMING_THROTTLE_MS is reasonable", () => {
    expect(STREAMING_THROTTLE_MS).toBeGreaterThanOrEqual(100);
    expect(STREAMING_THROTTLE_MS).toBeLessThanOrEqual(5000);
  });

  test("BUTTON_LABEL_MAX_LENGTH is reasonable", () => {
    expect(BUTTON_LABEL_MAX_LENGTH).toBeGreaterThanOrEqual(10);
    expect(BUTTON_LABEL_MAX_LENGTH).toBeLessThanOrEqual(100);
  });

  test("MEDIA_GROUP_TIMEOUT is reasonable", () => {
    expect(MEDIA_GROUP_TIMEOUT).toBeGreaterThanOrEqual(500);
    expect(MEDIA_GROUP_TIMEOUT).toBeLessThanOrEqual(10000);
  });
});

// ============== Rate Limiting Config ==============

describe("rate limiting config", () => {
  test("RATE_LIMIT_REQUESTS is positive", () => {
    expect(RATE_LIMIT_REQUESTS).toBeGreaterThan(0);
  });

  test("RATE_LIMIT_WINDOW is positive", () => {
    expect(RATE_LIMIT_WINDOW).toBeGreaterThan(0);
  });

  test("RATE_LIMIT_ENABLED is boolean-like", () => {
    expect(typeof RATE_LIMIT_ENABLED).toBe("boolean");
  });
});

// ============== Audit Config ==============

describe("audit config", () => {
  test("AUDIT_LOG_PATH is a valid path", () => {
    expect(AUDIT_LOG_PATH).toBeTruthy();
    expect(AUDIT_LOG_PATH).toContain("audit");
  });
});

// ============== Claude CLI ==============

describe("Claude CLI config", () => {
  test("CLAUDE_CLI_PATH is a string", () => {
    expect(typeof CLAUDE_CLI_PATH).toBe("string");
    expect(CLAUDE_CLI_PATH.length).toBeGreaterThan(0);
  });
});
