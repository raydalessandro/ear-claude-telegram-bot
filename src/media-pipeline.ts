/**
 * Modular Media Pipeline for Claude Telegram Bot v2.
 *
 * Routes media (image, audio, video, document) through configurable
 * local tools before sending to Claude. Tools are external processes
 * that can be swapped without code changes.
 */

export type MediaType = "image" | "audio" | "video" | "document" | "unknown";

export interface PreProcessConfig {
  command: string;
  args: string[];
}

export interface MediaToolConfig {
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
  timeoutMs?: number; // Default: 30000
  env?: Record<string, string>;
  preProcess?: PreProcessConfig;
}

export interface ProcessResult {
  processed: boolean;
  passthrough: boolean;
  filePath: string;
  text?: string;       // Description/transcription from tool
  error?: string;
  durationMs?: number;
}

interface ToolEntry {
  mediaType: MediaType;
  config: MediaToolConfig;
}

const DEFAULT_TIMEOUT = 30_000;

export class MediaPipeline {
  private tools: Map<MediaType, MediaToolConfig> = new Map();

  /**
   * Register a tool for a media type. Replaces existing tool.
   */
  register(mediaType: MediaType, config: MediaToolConfig): void {
    this.tools.set(mediaType, config);
  }

  /**
   * Unregister a tool for a media type.
   */
  unregister(mediaType: MediaType): void {
    this.tools.delete(mediaType);
  }

  /**
   * Get config for a media type.
   */
  getConfig(mediaType: MediaType): MediaToolConfig | null {
    return this.tools.get(mediaType) ?? null;
  }

  /**
   * Check if an enabled tool is registered for a media type.
   */
  hasToolFor(mediaType: MediaType): boolean {
    const config = this.tools.get(mediaType);
    return !!config && config.enabled;
  }

  /**
   * List all registered tools.
   */
  listTools(): ToolEntry[] {
    return Array.from(this.tools.entries()).map(([mediaType, config]) => ({
      mediaType,
      config,
    }));
  }

  /**
   * Enable a tool.
   */
  enable(mediaType: MediaType): void {
    const config = this.tools.get(mediaType);
    if (config) config.enabled = true;
  }

  /**
   * Disable a tool.
   */
  disable(mediaType: MediaType): void {
    const config = this.tools.get(mediaType);
    if (config) config.enabled = false;
  }

  /**
   * Get human-readable status of all tools.
   */
  getStatus(): string {
    if (this.tools.size === 0) return "No tools registered.";
    const lines: string[] = [];
    for (const [type, config] of this.tools) {
      const status = config.enabled ? "enabled" : "disabled";
      lines.push(`${type}: ${config.name} (${status})`);
    }
    return lines.join("\n");
  }

  /**
   * Process a media file through its registered tool.
   * Returns passthrough if no tool registered or tool is disabled.
   */
  async process(mediaType: MediaType, filePath: string): Promise<ProcessResult> {
    const config = this.tools.get(mediaType);

    // No tool registered or disabled → passthrough
    if (!config || !config.enabled) {
      return {
        processed: false,
        passthrough: true,
        filePath,
      };
    }

    const timeout = config.timeoutMs ?? DEFAULT_TIMEOUT;
    const startTime = Date.now();

    try {
      // Run pre-processor if configured
      if (config.preProcess) {
        const preProc = Bun.spawn(
          [config.preProcess.command, ...config.preProcess.args, filePath],
          { stdout: "pipe", stderr: "pipe" }
        );
        await preProc.exited;
      }

      // Build command: [command, ...args, filePath]
      const cmdArgs = [...config.args, filePath];
      const spawnEnv = config.env
        ? { ...process.env, ...config.env }
        : undefined;

      const proc = Bun.spawn([config.command, ...cmdArgs], {
        stdout: "pipe",
        stderr: "pipe",
        ...(spawnEnv ? { env: spawnEnv } : {}),
      });

      // Race between process completion and timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => {
          proc.kill();
          reject(new Error("timeout"));
        }, timeout)
      );

      const [output, exitCode] = await Promise.race([
        (async () => {
          const stdout = await new Response(proc.stdout).text();
          const code = await proc.exited;
          return [stdout, code] as const;
        })(),
        timeoutPromise,
      ]);

      const durationMs = Date.now() - startTime;

      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return {
          processed: false,
          passthrough: false,
          filePath,
          durationMs,
          error: `Tool "${config.name}" exited with code ${exitCode}: ${stderr.slice(0, 200)}`,
        };
      }

      // Try to parse JSON output from tool
      let text: string;
      try {
        const parsed = JSON.parse(output.trim());
        text = parsed.text || parsed.description || output.trim();
      } catch {
        text = output.trim();
      }

      return {
        processed: true,
        passthrough: false,
        filePath,
        text,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errMsg = String(error);
      if (errMsg.includes("timeout")) {
        return {
          processed: false,
          passthrough: false,
          filePath,
          durationMs,
          error: `Tool "${config.name}" timeout after ${timeout}ms`,
        };
      }
      return {
        processed: false,
        passthrough: false,
        filePath,
        durationMs,
        error: `Tool "${config.name}" failed: ${errMsg.slice(0, 200)}`,
      };
    }
  }

  /**
   * Serialize config to JSON.
   */
  toJSON(): string {
    const obj: Record<string, MediaToolConfig> = {};
    for (const [type, config] of this.tools) {
      obj[type] = config;
    }
    return JSON.stringify(obj, null, 2);
  }

  /**
   * Restore from JSON.
   */
  static fromJSON(json: string): MediaPipeline {
    const obj = JSON.parse(json);
    const pipeline = new MediaPipeline();
    for (const [type, config] of Object.entries(obj)) {
      pipeline.register(type as MediaType, config as MediaToolConfig);
    }
    return pipeline;
  }

  /**
   * Save config to file.
   */
  async saveToFile(path: string): Promise<void> {
    await Bun.write(path, this.toJSON());
  }

  /**
   * Load config from file.
   */
  static async loadFromFile(path: string): Promise<MediaPipeline> {
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return new MediaPipeline();
      }
      const json = await file.text();
      return MediaPipeline.fromJSON(json);
    } catch {
      return new MediaPipeline();
    }
  }

  /**
   * Create a pipeline with default tools pre-configured.
   */
  static withDefaults(): MediaPipeline {
    const pipeline = new MediaPipeline();

    // Default: Whisper for audio transcription
    const pythonPath = process.env.PYTHON_PATH || "python";
    pipeline.register("audio", {
      name: "whisper-local",
      command: pythonPath,
      args: ["-c", `import sys,whisper;m=whisper.load_model("small");r=m.transcribe(sys.argv[1],language="it");print(r["text"])`],
      enabled: true,
      timeoutMs: 120_000,
    });

    return pipeline;
  }
}

/**
 * Detect media type from file extension.
 */
export function detectMediaType(filename: string): MediaType {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tiff"];
  const audioExts = ["ogg", "mp3", "wav", "m4a", "flac", "aac", "wma", "opus"];
  const videoExts = ["mp4", "webm", "avi", "mkv", "mov", "wmv", "flv"];
  const docExts = ["pdf", "txt", "doc", "docx", "xls", "xlsx", "csv", "rtf", "md"];

  if (imageExts.includes(ext)) return "image";
  if (audioExts.includes(ext)) return "audio";
  if (videoExts.includes(ext)) return "video";
  if (docExts.includes(ext)) return "document";
  return "unknown";
}
