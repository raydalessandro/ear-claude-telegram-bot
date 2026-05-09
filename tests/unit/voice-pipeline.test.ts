/**
 * TDD tests for Voice Pipeline.
 *
 * Tests the voice message flow: download → transcribe → send to Claude.
 * Both the existing Whisper path and the new modular pipeline path.
 */

import { describe, test, expect } from "bun:test";

// ============== Voice Transcription ==============

describe("transcribeVoice", () => {
  test("function exists and is callable", async () => {
    const { transcribeVoice } = await import("../../src/utils");
    expect(typeof transcribeVoice).toBe("function");
  });

  test("returns null for nonexistent file (with whisper)", async () => {
    // Only run if TEST_WHISPER=1 — Whisper takes 10s+ to load
    if (process.env.TEST_WHISPER !== "1") {
      console.log("Skipping: set TEST_WHISPER=1 to run whisper tests");
      return;
    }

    const { transcribeVoice } = await import("../../src/utils");
    const result = await transcribeVoice("/tmp/nonexistent-voice-xyz.ogg");
    expect(result).toBeNull();
  });
});

// ============== Voice via Media Pipeline ==============

describe("voice via media pipeline", () => {
  test("audio files route through pipeline", async () => {
    const { MediaPipeline, detectMediaType } = await import("../../src/media-pipeline");
    expect(detectMediaType("voice.ogg")).toBe("audio");

    const pipeline = new MediaPipeline();
    // Without a registered tool, should passthrough
    const result = await pipeline.process("audio", "/tmp/voice.ogg");
    expect(result.passthrough).toBe(true);
  });

  test("registered whisper tool processes audio", async () => {
    const { MediaPipeline } = await import("../../src/media-pipeline");
    const pipeline = new MediaPipeline();

    // Register a mock whisper tool
    const isWindows = process.platform === "win32";
    pipeline.register("audio", {
      name: "whisper-mock",
      command: isWindows ? "cmd" : "echo",
      args: isWindows
        ? ["/c", "echo", '{"text":"ciao come stai"}']
        : ['{"text":"ciao come stai"}'],
      enabled: true,
    });

    const result = await pipeline.process("audio", "/tmp/test.ogg");
    expect(result.processed).toBe(true);
    expect(result.text).toContain("ciao");
  });
});

// ============== Voice Handler Integration ==============

describe("voice handler flow", () => {
  test("handler exports exist", async () => {
    const { handleVoice } = await import("../../src/handlers/voice");
    expect(typeof handleVoice).toBe("function");
  });

  test("handler rejects unauthorized user", async () => {
    const { createMockContext } = await import("../mocks/grammy");
    const { handleVoice } = await import("../../src/handlers/voice");

    const ctx = createMockContext({
      userId: 999,
      voice: { file_id: "test", duration: 5 },
    });
    await handleVoice(ctx);
    expect(ctx._sent[0]?.text).toMatch(/unauthorized/i);
  });
});
