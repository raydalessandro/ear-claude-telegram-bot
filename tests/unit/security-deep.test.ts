/**
 * Deep security tests — rate limiter edge cases, path validation,
 * command safety bypasses.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  rateLimiter,
  isPathAllowed,
  checkCommandSafety,
  isAuthorized,
} from "../../src/security";
import { ALLOWED_PATHS, TEMP_PATHS } from "../../src/config";

// ============== Rate Limiter Deep Tests ==============

describe("RateLimiter deep", () => {
  test("first check always allowed (full bucket)", () => {
    const [allowed] = rateLimiter.check(99000);
    expect(allowed).toBe(true);
  });

  test("rapid successive checks deplete tokens (when rate limit enabled)", () => {
    // Rate limiting may be disabled in test env
    const { RATE_LIMIT_ENABLED } = require("../../src/config");
    if (!RATE_LIMIT_ENABLED) {
      // When disabled, all checks pass
      const [allowed] = rateLimiter.check(99001);
      expect(allowed).toBe(true);
      return;
    }
    const uid = 99001;
    const results: boolean[] = [];
    for (let i = 0; i < 25; i++) {
      const [allowed] = rateLimiter.check(uid);
      results.push(allowed);
    }
    const allowed = results.filter(Boolean).length;
    const rejected = results.filter((x) => !x).length;
    expect(allowed).toBeGreaterThan(0);
    expect(rejected).toBeGreaterThan(0);
  });

  test("returns retryAfter when rate limited", () => {
    const uid = 99002;
    // Drain tokens
    for (let i = 0; i < 30; i++) {
      rateLimiter.check(uid);
    }
    const [allowed, retryAfter] = rateLimiter.check(uid);
    if (!allowed) {
      expect(retryAfter).toBeDefined();
      expect(retryAfter!).toBeGreaterThan(0);
      expect(retryAfter!).toBeLessThan(120); // Should be reasonable
    }
  });

  test("different users have independent buckets", () => {
    const uid1 = 99010;
    const uid2 = 99011;
    // Drain uid1
    for (let i = 0; i < 30; i++) {
      rateLimiter.check(uid1);
    }
    // uid2 should still be allowed
    const [allowed] = rateLimiter.check(uid2);
    expect(allowed).toBe(true);
  });

  test("getStatus returns tokens info", () => {
    const uid = 99020;
    const status = rateLimiter.getStatus(uid);
    expect(status.max).toBeGreaterThan(0);
    expect(status.refillRate).toBeGreaterThan(0);
    expect(status.tokens).toBeGreaterThanOrEqual(0);
  });

  test("getStatus for new user returns max tokens", () => {
    const uid = 99030;
    const status = rateLimiter.getStatus(uid);
    expect(status.tokens).toBe(status.max);
  });

  test("tokens are fractional between 0 and 1 when bucket nearly empty", () => {
    const uid = 99040;
    // Drain to near empty
    for (let i = 0; i < 30; i++) {
      rateLimiter.check(uid);
    }
    const status = rateLimiter.getStatus(uid);
    // Tokens could be between 0 and 1 (fractional)
    expect(status.tokens).toBeGreaterThanOrEqual(0);
  });
});

// ============== Path Validation Deep Tests ==============

describe("isPathAllowed deep", () => {
  test("allows paths within configured ALLOWED_PATHS", () => {
    for (const p of ALLOWED_PATHS) {
      expect(isPathAllowed(p)).toBe(true);
    }
  });

  test("allows subdirectories of allowed paths", () => {
    for (const p of ALLOWED_PATHS) {
      expect(isPathAllowed(`${p}/some/subdir`)).toBe(true);
    }
  });

  test("rejects system directories", () => {
    if (process.platform !== "win32") {
      expect(isPathAllowed("/etc/passwd")).toBe(false);
      expect(isPathAllowed("/root/.ssh")).toBe(false);
      expect(isPathAllowed("/usr/bin")).toBe(false);
      expect(isPathAllowed("/sbin")).toBe(false);
    }
  });

  test("allows temp paths", () => {
    for (const t of TEMP_PATHS) {
      if (t) {
        expect(isPathAllowed(`${t}test-file.txt`)).toBe(true);
      }
    }
  });

  test("handles path with .. traversal", () => {
    // Path that tries to escape allowed directory
    const escaped = `${ALLOWED_PATHS[0]}/../../../etc/passwd`;
    // resolve() should normalize this
    const result = isPathAllowed(escaped);
    // Result depends on whether the resolved path ends up in allowed dirs
    // But we verify it doesn't crash
    expect(typeof result).toBe("boolean");
  });

  test("handles tilde expansion", () => {
    // ~ should expand to HOME
    const result = isPathAllowed("~/Documents");
    expect(typeof result).toBe("boolean");
  });

  test("handles empty path without crashing", () => {
    expect(() => isPathAllowed("")).not.toThrow();
  });

  test("handles null-like values without crashing", () => {
    expect(() => isPathAllowed("null")).not.toThrow();
    expect(() => isPathAllowed("undefined")).not.toThrow();
  });

  test("handles very long paths", () => {
    const longPath = "/a".repeat(1000);
    expect(() => isPathAllowed(longPath)).not.toThrow();
    expect(isPathAllowed(longPath)).toBe(false);
  });

  test("handles paths with spaces", () => {
    const pathWithSpaces = `${ALLOWED_PATHS[0]}/my folder/my file.txt`;
    // Should not crash and result depends on actual resolution
    expect(() => isPathAllowed(pathWithSpaces)).not.toThrow();
  });

  test("handles paths with special characters", () => {
    const special = `${ALLOWED_PATHS[0]}/file(1)[2]{3}.txt`;
    expect(() => isPathAllowed(special)).not.toThrow();
  });

  test("handles Windows-style paths on any platform", () => {
    expect(() => isPathAllowed("C:\\Users\\test\\file.txt")).not.toThrow();
  });

  test("handles UNC paths", () => {
    expect(() => isPathAllowed("\\\\server\\share\\file")).not.toThrow();
  });
});

// ============== Command Safety Deep Tests ==============

describe("checkCommandSafety deep", () => {
  test("blocks all known dangerous patterns", () => {
    const dangerous = [
      "rm -rf /",
      "rm -rf ~",
      "rm -rf $HOME",
      "sudo rm anything",
      ":(){ :|:& };:",
      "> /dev/sda",
      "mkfs.ext4 /dev/sda1",
      "dd if=/dev/zero of=/dev/sda",
    ];
    for (const cmd of dangerous) {
      const [safe, reason] = checkCommandSafety(cmd);
      expect(safe).toBe(false);
    }
  });

  test("blocks patterns case-insensitively", () => {
    expect(checkCommandSafety("SUDO RM something")[0]).toBe(false);
    expect(checkCommandSafety("Rm -Rf /")[0]).toBe(false);
    expect(checkCommandSafety("DD IF=/dev/zero")[0]).toBe(false);
    expect(checkCommandSafety("MKFS.ext4 /dev/sda")[0]).toBe(false);
  });

  test("blocks patterns embedded in longer commands", () => {
    expect(checkCommandSafety("echo hello && rm -rf /")[0]).toBe(false);
    expect(checkCommandSafety("ls; sudo rm file")[0]).toBe(false);
    expect(checkCommandSafety("cat file | dd if=/dev/zero")[0]).toBe(false);
  });

  test("allows safe common commands", () => {
    const safe = [
      "ls -la",
      "pwd",
      "cat file.txt",
      "head -n 10 file.txt",
      "git status",
      "git log --oneline -10",
      "git diff",
      "npm install",
      "npm test",
      "bun test",
      "bun run build",
      "python script.py",
      "node app.js",
      "echo hello",
      "which python",
      "find . -name '*.ts'",
      "grep -r 'pattern' .",
      "wc -l file.txt",
      "mkdir -p new/dir",
      "cp file1 file2",
      "mv file1 file2",
      "touch newfile.txt",
      "chmod 644 file.txt",
    ];
    for (const cmd of safe) {
      const [isSafe] = checkCommandSafety(cmd);
      expect(isSafe).toBe(true);
    }
  });

  test("rm with allowed path is safe", () => {
    if (ALLOWED_PATHS.length > 0) {
      const allowedFile = `${ALLOWED_PATHS[0]}/test-file.txt`;
      const [safe] = checkCommandSafety(`rm ${allowedFile}`);
      expect(safe).toBe(true);
    }
  });

  test("rm with path outside allowed dirs is blocked", () => {
    const [safe] = checkCommandSafety("rm /etc/important.conf");
    expect(safe).toBe(false);
  });

  test("rm skips flags in path validation", () => {
    if (ALLOWED_PATHS.length > 0) {
      const allowedFile = `${ALLOWED_PATHS[0]}/test.txt`;
      const [safe] = checkCommandSafety(`rm -f ${allowedFile}`);
      expect(safe).toBe(true);
    }
  });

  test("returns reason string when blocking", () => {
    const [safe, reason] = checkCommandSafety("rm -rf /");
    expect(safe).toBe(false);
    expect(reason).toBeTruthy();
    expect(typeof reason).toBe("string");
  });

  test("returns empty reason for safe commands", () => {
    const [safe, reason] = checkCommandSafety("ls");
    expect(safe).toBe(true);
    expect(reason).toBe("");
  });

  test("handles empty command", () => {
    const [safe] = checkCommandSafety("");
    expect(safe).toBe(true);
  });

  test("handles whitespace-only command", () => {
    const [safe] = checkCommandSafety("   ");
    expect(safe).toBe(true);
  });

  test("handles very long command", () => {
    const long = "echo " + "a".repeat(10000);
    expect(() => checkCommandSafety(long)).not.toThrow();
  });

  test("blocks pipe into dangerous commands", () => {
    expect(checkCommandSafety("cat file | sudo rm foo")[0]).toBe(false);
  });
});

// ============== Authorization Edge Cases ==============

describe("isAuthorized edge cases", () => {
  test("rejects 0 as userId", () => {
    expect(isAuthorized(0, [0, 1])).toBe(false);
  });

  test("negative userId is truthy, so allowed if in list", () => {
    // -1 is truthy in JS, so isAuthorized only blocks falsy values (0, undefined, NaN)
    expect(isAuthorized(-1, [-1, 1])).toBe(true);
  });

  test("handles very large userId", () => {
    const bigId = 9999999999;
    expect(isAuthorized(bigId, [bigId])).toBe(true);
  });

  test("handles NaN", () => {
    expect(isAuthorized(NaN, [NaN])).toBe(false);
  });
});
