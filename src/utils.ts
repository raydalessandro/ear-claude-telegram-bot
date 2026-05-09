/**
 * Utility functions for Claude Telegram Bot.
 *
 * Audit logging, voice transcription, typing indicator.
 */

import type { Chat } from "grammy/types";
import type { Context } from "grammy";
import type { AuditEvent } from "./types";
import {
  AUDIT_LOG_PATH,
  AUDIT_LOG_JSON,
} from "./config";

// ============== Audit Logging ==============

async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    let content: string;
    if (AUDIT_LOG_JSON) {
      content = JSON.stringify(event) + "\n";
    } else {
      // Plain text format for readability
      const lines = ["\n" + "=".repeat(60)];
      for (const [key, value] of Object.entries(event)) {
        let displayValue = value;
        if (
          (key === "content" || key === "response") &&
          String(value).length > 500
        ) {
          displayValue = String(value).slice(0, 500) + "...";
        }
        lines.push(`${key}: ${displayValue}`);
      }
      content = lines.join("\n") + "\n";
    }

    // Append to audit log file
    const fs = await import("fs/promises");
    await fs.appendFile(AUDIT_LOG_PATH, content);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

export async function auditLog(
  userId: number,
  username: string,
  messageType: string,
  content: string,
  response = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "message",
    user_id: userId,
    username,
    message_type: messageType,
    content,
  };
  if (response) {
    event.response = response;
  }
  await writeAuditLog(event);
}

export async function auditLogAuth(
  userId: number,
  username: string,
  authorized: boolean
): Promise<void> {
  await writeAuditLog({
    timestamp: new Date().toISOString(),
    event: "auth",
    user_id: userId,
    username,
    authorized,
  });
}

export async function auditLogTool(
  userId: number,
  username: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  blocked = false,
  reason = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "tool_use",
    user_id: userId,
    username,
    tool_name: toolName,
    tool_input: toolInput,
    blocked,
  };
  if (blocked && reason) {
    event.reason = reason;
  }
  await writeAuditLog(event);
}

export async function auditLogError(
  userId: number,
  username: string,
  error: string,
  context = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "error",
    user_id: userId,
    username,
    error,
  };
  if (context) {
    event.context = context;
  }
  await writeAuditLog(event);
}

export async function auditLogRateLimit(
  userId: number,
  username: string,
  retryAfter: number
): Promise<void> {
  await writeAuditLog({
    timestamp: new Date().toISOString(),
    event: "rate_limit",
    user_id: userId,
    username,
    retry_after: retryAfter,
  });
}

// ============== Voice Transcription (offline, local Whisper) ==============

export async function transcribeVoice(
  filePath: string
): Promise<string | null> {
  // Resolve the Python bridge script relative to this file's directory
  const scriptPath = import.meta.dir + "/transcribe_voice.py";

  // Try multiple Python command variants (env var first, then auto-detect, then fallbacks)
  const pythonFromEnv = process.env.PYTHON_PATH;
  const pythonFromWhich = Bun.which("python3") || Bun.which("python");
  const pythonCommands = [
    ...(pythonFromEnv ? [pythonFromEnv] : []),
    ...(pythonFromWhich ? [pythonFromWhich] : []),
    "python",
    "python3",
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  for (const pythonCmd of pythonCommands) {
    try {
      const proc = Bun.spawn([pythonCmd, scriptPath, filePath], {
        stdout: "pipe",
        stderr: "pipe",
      });

      const output = await new Response(proc.stdout).text();
      const exitCode = await proc.exited;

      console.log(`Transcription using: ${pythonCmd} (exit code: ${exitCode})`);

      if (exitCode !== 0) {
        const errOutput = await new Response(proc.stderr).text();
        console.error(`${pythonCmd} process exited with code ${exitCode}:`, errOutput);
        // Try next command
        continue;
      }

      let result: { success: boolean; text?: string; error?: string };
      try {
        result = JSON.parse(output.trim());
      } catch {
        console.error("Failed to parse Whisper output:", output);
        return null;
      }

      if (result.success && result.text) {
        console.log(`✓ Transcription successful with ${pythonCmd}`);
        return result.text;
      } else {
        console.error("Transcription failed:", result.error);
        return null;
      }
    } catch (error) {
      // If spawn failed (command not found), try next command
      if (String(error).includes("ENOENT") || String(error).includes("not found")) {
        console.log(`${pythonCmd} not found, trying next...`);
        continue;
      }
      // Other errors are real failures
      console.error(`Transcription failed with ${pythonCmd}:`, error);
      return null;
    }
  }

  // All python commands failed
  console.error("All Python commands failed. Ensure Python is installed and in PATH.");
  return null;
}

// ============== Typing Indicator ==============

export interface TypingController {
  stop: () => void;
}

export function startTypingIndicator(ctx: Context): TypingController {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await ctx.replyWithChatAction("typing");
      } catch (error) {
        console.debug("Typing indicator failed:", error);
      }
      await Bun.sleep(4000);
    }
  };

  // Start the loop
  loop();

  return {
    stop: () => {
      running = false;
    },
  };
}

// ============== Message Interrupt ==============

// Import session lazily to avoid circular dependency
let sessionModule: {
  session: {
    isRunning: boolean;
    stop: () => Promise<"stopped" | "pending" | false>;
    markInterrupt: () => void;
    clearStopRequested: () => void;
  };
} | null = null;

export async function checkInterrupt(text: string): Promise<string> {
  if (!text || !text.startsWith("!")) {
    return text;
  }

  // Lazy import to avoid circular dependency
  if (!sessionModule) {
    sessionModule = await import("./session");
  }

  const strippedText = text.slice(1).trimStart();

  if (sessionModule.session.isRunning) {
    console.log("! prefix - interrupting current query");
    sessionModule.session.markInterrupt();
    await sessionModule.session.stop();
    await Bun.sleep(100);
    // Clear stopRequested so the new message can proceed
    sessionModule.session.clearStopRequested();
  }

  return strippedText;
}
