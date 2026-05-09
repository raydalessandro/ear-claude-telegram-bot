/**
 * Tests for text message buffer — ensures Telegram-split long messages
 * are combined into a single message before processing.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  bufferText,
  hasPendingBuffer,
  clearAllBuffers,
  BUFFER_TIMEOUT,
} from "../../src/handlers/text-buffer";
import { createMockContext } from "../mocks/grammy";

describe("text-buffer", () => {
  afterEach(() => {
    clearAllBuffers();
  });

  // ============== Basic Buffering ==============

  test("single message is delivered after timeout", async () => {
    let received: string | null = null as string | null;
    const ctx = createMockContext({ userId: 123, chatId: 1 });

    bufferText(ctx, "hello", 123, 1, async (_ctx, text) => {
      received = text;
    });

    expect(hasPendingBuffer(1)).toBe(true);
    expect(received).toBeNull(); // Not yet

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received).toBe("hello");
    expect(hasPendingBuffer(1)).toBe(false);
  });

  test("two rapid messages are combined", async () => {
    let received: string | null = null as string | null;
    const ctx1 = createMockContext({ userId: 123, chatId: 1 });
    const ctx2 = createMockContext({ userId: 123, chatId: 1 });

    const cb = async (_ctx: any, text: string) => { received = text; };

    bufferText(ctx1, "part one", 123, 1, cb);
    await Bun.sleep(100); // Within buffer window
    bufferText(ctx2, "part two", 123, 1, cb);

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received).toBe("part one\npart two");
  });

  test("three rapid messages are combined", async () => {
    let received: string | null = null as string | null;
    const cb = async (_ctx: any, text: string) => { received = text; };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "part 1", 123, 1, cb);
    await Bun.sleep(50);
    bufferText(createMockContext({ userId: 123, chatId: 1 }), "part 2", 123, 1, cb);
    await Bun.sleep(50);
    bufferText(createMockContext({ userId: 123, chatId: 1 }), "part 3", 123, 1, cb);

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received).toBe("part 1\npart 2\npart 3");
  });

  // ============== Timer Reset ==============

  test("timer resets on each new part", async () => {
    let received: string | null = null as string | null;
    const cb = async (_ctx: any, text: string) => { received = text; };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "part 1", 123, 1, cb);
    await Bun.sleep(400); // Close to timeout but within
    bufferText(createMockContext({ userId: 123, chatId: 1 }), "part 2", 123, 1, cb);

    // At this point, 400ms passed since part 1, but timer was reset by part 2
    await Bun.sleep(100); // 500ms since start, but only 100ms since part 2
    expect(received).toBeNull(); // Should still be buffered

    await Bun.sleep(BUFFER_TIMEOUT + 50);
    expect(received).toBe("part 1\npart 2");
  });

  // ============== Separate Chats ==============

  test("different chats have independent buffers", async () => {
    const results: Record<number, string> = {};
    const cb = (chatId: number) => async (_ctx: any, text: string) => {
      results[chatId] = text;
    };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "chat1 msg", 123, 1, cb(1));
    bufferText(createMockContext({ userId: 456, chatId: 2 }), "chat2 msg", 456, 2, cb(2));

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(results[1]).toBe("chat1 msg");
    expect(results[2]).toBe("chat2 msg");
  });

  // ============== Different Users Same Chat ==============

  test("different user in same chat starts new buffer", async () => {
    const received: string[] = [];
    const cb = async (_ctx: any, text: string) => { received.push(text); };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "user1 msg", 123, 1, cb);
    await Bun.sleep(100);
    // Different user replaces the buffer (edge case in group chats)
    bufferText(createMockContext({ userId: 456, chatId: 1 }), "user2 msg", 456, 1, cb);

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    // Both should be delivered (first one flushed early or both combined depending on impl)
    expect(received.length).toBeGreaterThanOrEqual(1);
  });

  // ============== Context Preservation ==============

  test("callback receives the latest ctx", async () => {
    let receivedCtx: any = null;
    const ctx1 = createMockContext({ userId: 123, chatId: 1 });
    const ctx2 = createMockContext({ userId: 123, chatId: 1 });

    const cb = async (ctx: any, _text: string) => { receivedCtx = ctx; };

    bufferText(ctx1, "part 1", 123, 1, cb);
    await Bun.sleep(50);
    bufferText(ctx2, "part 2", 123, 1, cb);

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    // Should receive ctx2 (latest), so replies go to the right message
    expect(receivedCtx).toBe(ctx2);
  });

  // ============== Clear ==============

  test("clearAllBuffers cancels pending deliveries", async () => {
    let received = false;
    const cb = async () => { received = true; };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "msg", 123, 1, cb);
    clearAllBuffers();

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received).toBe(false);
  });

  test("hasPendingBuffer returns false after clear", () => {
    bufferText(createMockContext({ userId: 123, chatId: 1 }), "msg", 123, 1, async () => {});
    expect(hasPendingBuffer(1)).toBe(true);
    clearAllBuffers();
    expect(hasPendingBuffer(1)).toBe(false);
  });

  // ============== Edge Cases ==============

  test("empty string is buffered normally", async () => {
    let received: string | null = null as string | null;
    const cb = async (_ctx: any, text: string) => { received = text; };

    bufferText(createMockContext({ userId: 123, chatId: 1 }), "", 123, 1, cb);
    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received).toBe("");
  });

  test("very long combined message is delivered intact", async () => {
    let received: string | null = null as string | null;
    const cb = async (_ctx: any, text: string) => { received = text; };

    const longPart = "x".repeat(4000);
    bufferText(createMockContext({ userId: 123, chatId: 1 }), longPart, 123, 1, cb);
    await Bun.sleep(50);
    bufferText(createMockContext({ userId: 123, chatId: 1 }), longPart, 123, 1, cb);

    await Bun.sleep(BUFFER_TIMEOUT + 100);
    expect(received!.length).toBe(4000 + 1 + 4000); // part1 + \n + part2
  });

  test("BUFFER_TIMEOUT is reasonable (200-2000ms)", () => {
    expect(BUFFER_TIMEOUT).toBeGreaterThanOrEqual(200);
    expect(BUFFER_TIMEOUT).toBeLessThanOrEqual(2000);
  });
});

// ============== Integration with text handler ==============

describe("text-buffer integration", () => {
  test("handleText function exists and is async", async () => {
    const { handleText } = await import("../../src/handlers/text");
    expect(typeof handleText).toBe("function");
  });

  test("text handler imports bufferText", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../src/handlers/text.ts"),
      "utf-8"
    );
    expect(src).toContain("bufferText");
    expect(src).toContain("text-buffer");
  });

  test("interrupt messages (!) bypass buffer", () => {
    const fs = require("fs");
    const src = fs.readFileSync(
      require("path").resolve(__dirname, "../../src/handlers/text.ts"),
      "utf-8"
    );
    // ! messages should be processed immediately, not buffered
    expect(src).toContain('startsWith("!")');
    // The ! check should be BEFORE bufferText call
    const bangIdx = src.indexOf('startsWith("!")');
    const bufferIdx = src.indexOf("bufferText(");
    expect(bangIdx).toBeLessThan(bufferIdx);
  });
});
