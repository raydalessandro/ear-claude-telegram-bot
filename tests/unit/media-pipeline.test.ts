/**
 * TDD tests for Modular Media Pipeline.
 *
 * The pipeline routes each media type through a configurable local tool
 * before sending to Claude. Tools are external processes that can be
 * swapped without changing bot code.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  MediaPipeline,
  detectMediaType,
  type MediaToolConfig,
  type MediaType,
  type ProcessResult,
} from "../../src/media-pipeline";

// ============== Configuration ==============

describe("MediaPipeline configuration", () => {
  let pipeline: MediaPipeline;

  beforeEach(() => {
    pipeline = new MediaPipeline();
  });

  test("registers a tool for a media type", () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    expect(pipeline.getConfig("image")?.name).toBe("florence2");
  });

  test("lists registered tools", () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    pipeline.register("audio", {
      name: "whisper",
      command: "python",
      args: ["scripts/transcribe.py"],
      enabled: true,
    });
    const tools = pipeline.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.mediaType)).toContain("image");
    expect(tools.map((t) => t.mediaType)).toContain("audio");
  });

  test("can disable a tool", () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    pipeline.disable("image");
    expect(pipeline.getConfig("image")?.enabled).toBe(false);
  });

  test("can enable a tool", () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: false,
    });
    pipeline.enable("image");
    expect(pipeline.getConfig("image")?.enabled).toBe(true);
  });

  test("can replace a tool", () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    pipeline.register("image", {
      name: "llava",
      command: "python",
      args: ["scripts/llava_describe.py"],
      enabled: true,
    });
    expect(pipeline.getConfig("image")?.name).toBe("llava");
  });

  test("returns null for unregistered media type", () => {
    expect(pipeline.getConfig("video")).toBeNull();
  });

  test("unregister removes a tool", () => {
    pipeline.register("image", {
      name: "test",
      command: "echo",
      args: [],
      enabled: true,
    });
    pipeline.unregister("image");
    expect(pipeline.getConfig("image")).toBeNull();
  });

  test("unregister is no-op for missing type", () => {
    expect(() => pipeline.unregister("video")).not.toThrow();
  });

  test("hasToolFor returns true when tool registered and enabled", () => {
    pipeline.register("image", {
      name: "test",
      command: "echo",
      args: [],
      enabled: true,
    });
    expect(pipeline.hasToolFor("image")).toBe(true);
  });

  test("hasToolFor returns false when tool disabled", () => {
    pipeline.register("image", {
      name: "test",
      command: "echo",
      args: [],
      enabled: false,
    });
    expect(pipeline.hasToolFor("image")).toBe(false);
  });

  test("hasToolFor returns false when no tool", () => {
    expect(pipeline.hasToolFor("video")).toBe(false);
  });
});

// ============== Processing ==============

describe("MediaPipeline processing", () => {
  let pipeline: MediaPipeline;

  beforeEach(() => {
    pipeline = new MediaPipeline();
  });

  test("returns passthrough when no tool registered", async () => {
    const result = await pipeline.process("image", "/path/to/image.jpg");
    expect(result.processed).toBe(false);
    expect(result.passthrough).toBe(true);
    expect(result.filePath).toBe("/path/to/image.jpg");
  });

  test("returns passthrough when tool is disabled", async () => {
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: false,
    });
    const result = await pipeline.process("image", "/path/to/image.jpg");
    expect(result.processed).toBe(false);
    expect(result.passthrough).toBe(true);
  });

  test("returns error result when command fails", async () => {
    pipeline.register("image", {
      name: "broken-tool",
      command: "nonexistent_command_12345",
      args: [],
      enabled: true,
    });
    const result = await pipeline.process("image", "/path/to/image.jpg");
    expect(result.processed).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("processes successfully with echo tool", async () => {
    const isWindows = process.platform === "win32";
    pipeline.register("audio", {
      name: "echo-tool",
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", "hello"] : ["hello"],
      enabled: true,
    });
    const result = await pipeline.process("audio", "/path/to/audio.ogg");
    expect(result.processed).toBe(true);
    expect(result.text).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  test("has configurable timeout", async () => {
    const isWindows = process.platform === "win32";
    pipeline.register("image", {
      name: "slow-tool",
      command: isWindows ? "cmd" : "sleep",
      args: isWindows ? ["/c", "timeout /t 30 /nobreak"] : ["30"],
      enabled: true,
      timeoutMs: 100,
    });
    const result = await pipeline.process("image", "/path/to/image.jpg");
    expect(result.processed).toBe(false);
    expect(result.error).toContain("timeout");
  });

  test("parses JSON output from tool", async () => {
    const isWindows = process.platform === "win32";
    const jsonOutput = '{"text":"A beautiful sunset over the ocean"}';
    pipeline.register("image", {
      name: "json-tool",
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", jsonOutput] : [jsonOutput],
      enabled: true,
    });
    const result = await pipeline.process("image", "/test.jpg");
    expect(result.processed).toBe(true);
    expect(result.text).toContain("sunset");
  });

  test("handles plain text output from tool", async () => {
    const isWindows = process.platform === "win32";
    pipeline.register("image", {
      name: "text-tool",
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", "plain description"] : ["plain description"],
      enabled: true,
    });
    const result = await pipeline.process("image", "/test.jpg");
    expect(result.processed).toBe(true);
    expect(result.text).toContain("plain description");
  });

  test("passes environment variables to tool", async () => {
    pipeline.register("image", {
      name: "env-tool",
      command: process.platform === "win32" ? "cmd" : "echo",
      args: process.platform === "win32" ? ["/c", "echo", "ok"] : ["ok"],
      enabled: true,
      env: { CUSTOM_VAR: "test-value" },
    });
    const result = await pipeline.process("image", "/test.jpg");
    expect(result.error).toBeUndefined();
  });

  test("result includes processing time", async () => {
    const isWindows = process.platform === "win32";
    pipeline.register("image", {
      name: "timed-tool",
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", "done"] : ["done"],
      enabled: true,
    });
    const result = await pipeline.process("image", "/test.jpg");
    expect(result.durationMs).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ============== Chaining ==============

describe("MediaPipeline chaining", () => {
  test("can chain pre-processor and post-processor", async () => {
    const pipeline = new MediaPipeline();
    // Pre: convert format. Post: describe.
    // This tests that the pipeline supports a preprocessing step
    pipeline.register("image", {
      name: "describer",
      command: process.platform === "win32" ? "cmd" : "echo",
      args: process.platform === "win32" ? ["/c", "echo", "described"] : ["described"],
      enabled: true,
      preProcess: {
        command: process.platform === "win32" ? "cmd" : "echo",
        args: process.platform === "win32" ? ["/c", "echo", "preprocessed"] : ["preprocessed"],
      },
    });
    const result = await pipeline.process("image", "/test.jpg");
    expect(result.processed).toBe(true);
  });
});

// ============== Serialization ==============

describe("MediaPipeline serialization", () => {
  test("serializes config to JSON", () => {
    const pipeline = new MediaPipeline();
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    const json = pipeline.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed.image).toBeDefined();
    expect(parsed.image.name).toBe("florence2");
  });

  test("restores from JSON", () => {
    const pipeline = new MediaPipeline();
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe_image.py"],
      enabled: true,
    });
    const json = pipeline.toJSON();

    const restored = MediaPipeline.fromJSON(json);
    expect(restored.getConfig("image")?.name).toBe("florence2");
  });

  test("saves and loads from file", async () => {
    const pipeline = new MediaPipeline();
    pipeline.register("image", {
      name: "test",
      command: "echo",
      args: [],
      enabled: true,
    });

    const tmpFile = `/tmp/test-pipeline-${Date.now()}.json`;
    await pipeline.saveToFile(tmpFile);

    const restored = await MediaPipeline.loadFromFile(tmpFile);
    expect(restored.getConfig("image")?.name).toBe("test");

    try { require("fs").unlinkSync(tmpFile); } catch {}
  });
});

// ============== Media Type Detection ==============

describe("detectMediaType", () => {
  test("detects image types", () => {
    expect(detectMediaType("photo.jpg")).toBe("image");
    expect(detectMediaType("photo.jpeg")).toBe("image");
    expect(detectMediaType("photo.png")).toBe("image");
    expect(detectMediaType("photo.webp")).toBe("image");
    expect(detectMediaType("photo.gif")).toBe("image");
    expect(detectMediaType("photo.bmp")).toBe("image");
    expect(detectMediaType("photo.svg")).toBe("image");
    expect(detectMediaType("photo.tiff")).toBe("image");
  });

  test("detects audio types", () => {
    expect(detectMediaType("voice.ogg")).toBe("audio");
    expect(detectMediaType("voice.mp3")).toBe("audio");
    expect(detectMediaType("voice.wav")).toBe("audio");
    expect(detectMediaType("voice.m4a")).toBe("audio");
    expect(detectMediaType("voice.flac")).toBe("audio");
    expect(detectMediaType("voice.opus")).toBe("audio");
  });

  test("detects video types", () => {
    expect(detectMediaType("clip.mp4")).toBe("video");
    expect(detectMediaType("clip.webm")).toBe("video");
    expect(detectMediaType("clip.avi")).toBe("video");
    expect(detectMediaType("clip.mkv")).toBe("video");
    expect(detectMediaType("clip.mov")).toBe("video");
  });

  test("detects document types", () => {
    expect(detectMediaType("doc.pdf")).toBe("document");
    expect(detectMediaType("doc.txt")).toBe("document");
    expect(detectMediaType("doc.docx")).toBe("document");
    expect(detectMediaType("doc.csv")).toBe("document");
    expect(detectMediaType("doc.md")).toBe("document");
  });

  test("returns unknown for unrecognized", () => {
    expect(detectMediaType("file.xyz")).toBe("unknown");
    expect(detectMediaType("file")).toBe("unknown");
  });

  test("case insensitive", () => {
    expect(detectMediaType("PHOTO.JPG")).toBe("image");
    expect(detectMediaType("Audio.MP3")).toBe("audio");
  });

  test("handles paths with directories", () => {
    expect(detectMediaType("/tmp/uploads/photo.jpg")).toBe("image");
    expect(detectMediaType("C:\\Users\\test\\doc.pdf")).toBe("document");
  });

  test("handles dotfiles", () => {
    expect(detectMediaType(".gitignore")).toBe("unknown");
  });
});

// ============== Default Tools ==============

describe("MediaPipeline default tools", () => {
  test("loadDefaults registers standard tools", () => {
    const pipeline = MediaPipeline.withDefaults();
    // Should have at least audio (whisper) configured
    expect(pipeline.getConfig("audio")).not.toBeNull();
    expect(pipeline.getConfig("audio")?.name).toContain("whisper");
  });

  test("default tools can be overridden", () => {
    const pipeline = MediaPipeline.withDefaults();
    pipeline.register("audio", {
      name: "custom-asr",
      command: "my-custom-asr",
      args: [],
      enabled: true,
    });
    expect(pipeline.getConfig("audio")?.name).toBe("custom-asr");
  });
});

// ============== Status/Info ==============

describe("MediaPipeline status", () => {
  test("getStatus returns summary of all tools", () => {
    const pipeline = new MediaPipeline();
    pipeline.register("image", {
      name: "florence2",
      command: "python",
      args: ["scripts/describe.py"],
      enabled: true,
    });
    pipeline.register("audio", {
      name: "whisper",
      command: "python",
      args: ["scripts/transcribe.py"],
      enabled: false,
    });

    const status = pipeline.getStatus();
    expect(status).toContain("florence2");
    expect(status).toContain("whisper");
    expect(status).toContain("enabled");
    expect(status).toContain("disabled");
  });
});
