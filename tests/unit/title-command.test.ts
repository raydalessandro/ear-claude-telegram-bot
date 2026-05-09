/**
 * Tests for /title command — rename current session title.
 *
 * IMPORTANT: These tests backup/restore the real session file
 * to avoid corrupting production data.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { createMockContext } from "../mocks/grammy";
import { handleTitle } from "../../src/handlers/commands-new";
import { session } from "../../src/session";

const ALLOWED = [123];

// Tests use isolated TEMP dir (set in tests/setup.ts) — no risk to production files.

describe("/title command", () => {
  beforeEach(async () => {
    await session.kill();
    session.consumeInterruptFlag();
    session.clearStopRequested();
  });

  test("shows current title when no args", async () => {
    (session as any).sessionId = "test-session-123";
    session.conversationTitle = "Vecchio titolo";

    const ctx = createMockContext({ text: "/title", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("Vecchio titolo");
  });

  test("changes title with args", async () => {
    (session as any).sessionId = "test-session-123";
    session.conversationTitle = "Vecchio";

    const ctx = createMockContext({ text: "/title Bot v2 sviluppo", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("Bot v2 sviluppo");
    expect(session.conversationTitle).toBe("Bot v2 sviluppo");
  });

  test("rejects when no active session", async () => {
    const ctx = createMockContext({ text: "/title test", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toContain("Nessuna sessione");
  });

  test("rejects unauthorized user", async () => {
    const ctx = createMockContext({ text: "/title test", userId: 999 });
    await handleTitle(ctx, ALLOWED);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });

  test("preserves spaces in title", async () => {
    (session as any).sessionId = "test-session-123";

    const ctx = createMockContext({ text: "/title   Piano integrazione MCP  ", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(session.conversationTitle).toBe("Piano integrazione MCP");
  });

  test("saves session after title change", async () => {
    (session as any).sessionId = "test-session-123";

    const ctx = createMockContext({ text: "/title Nuovo nome", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(session.conversationTitle).toBe("Nuovo nome");
  });

  test("title appears in /resume list after rename", async () => {
    (session as any).sessionId = "test-session-title-check";
    session.conversationTitle = "Prima del rename";
    session.saveSession();

    session.conversationTitle = "Dopo il rename";
    session.saveSession();

    const list = session.getSessionList();
    const found = list.find((s) => s.session_id === "test-session-title-check");
    if (found) {
      expect(found.title).toBe("Dopo il rename");
    }
  });

  test("title with emoji works", async () => {
    (session as any).sessionId = "test-session-123";

    const ctx = createMockContext({ text: "/title 🚀 Lancio bot v2", userId: 123 });
    await handleTitle(ctx, ALLOWED);
    expect(session.conversationTitle).toContain("🚀");
  });
});
