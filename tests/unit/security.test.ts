/**
 * Unit tests for security module.
 * Tests rate limiting, path validation, command safety, and authorization.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { isPathAllowed, checkCommandSafety, isAuthorized } from "../../src/security";

// ============== isAuthorized ==============

describe("isAuthorized", () => {
  test("allows user in allowlist", () => {
    expect(isAuthorized(123, [123, 456])).toBe(true);
  });

  test("rejects user not in allowlist", () => {
    expect(isAuthorized(789, [123, 456])).toBe(false);
  });

  test("rejects undefined userId", () => {
    expect(isAuthorized(undefined as any, [123])).toBe(false);
  });

  test("rejects when allowlist is empty", () => {
    expect(isAuthorized(123, [])).toBe(false);
  });
});

// ============== checkCommandSafety ==============

describe("checkCommandSafety", () => {
  test("allows safe commands", () => {
    expect(checkCommandSafety("ls -la")[0]).toBe(true);
    expect(checkCommandSafety("cat file.txt")[0]).toBe(true);
    expect(checkCommandSafety("git status")[0]).toBe(true);
    expect(checkCommandSafety("npm install")[0]).toBe(true);
  });

  test("blocks rm -rf /", () => {
    const [safe, reason] = checkCommandSafety("rm -rf /");
    expect(safe).toBe(false);
    expect(reason).toContain("Blocked");
  });

  test("blocks rm -rf ~", () => {
    expect(checkCommandSafety("rm -rf ~")[0]).toBe(false);
  });

  test("blocks sudo rm", () => {
    expect(checkCommandSafety("sudo rm something")[0]).toBe(false);
  });

  test("blocks fork bomb", () => {
    expect(checkCommandSafety(":(){ :|:& };:")[0]).toBe(false);
  });

  test("blocks dd if=", () => {
    expect(checkCommandSafety("dd if=/dev/zero of=/dev/sda")[0]).toBe(false);
  });

  test("blocks mkfs", () => {
    expect(checkCommandSafety("mkfs.ext4 /dev/sda1")[0]).toBe(false);
  });

  test("case insensitive blocking", () => {
    expect(checkCommandSafety("SUDO RM something")[0]).toBe(false);
  });
});

// ============== isPathAllowed ==============

describe("isPathAllowed", () => {
  // Note: these tests depend on ALLOWED_PATHS from config
  // In a real setup, we'd inject the config, but for now we test the logic

  test("rejects paths outside allowed directories", () => {
    // /etc is never in allowed paths
    expect(isPathAllowed("/etc/passwd")).toBe(false);
    expect(isPathAllowed("/usr/bin/something")).toBe(false);
  });

  test("handles empty path gracefully", () => {
    // Empty path resolves to CWD via resolve(), so result depends on ALLOWED_PATHS
    // Just verify it doesn't throw
    expect(() => isPathAllowed("")).not.toThrow();
  });
});
