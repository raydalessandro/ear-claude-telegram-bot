/**
 * Text message handler for Claude Telegram Bot.
 */

import type { Context } from "grammy";
import { session } from "../session";
import { ALLOWED_USERS } from "../config";
import { isAuthorized, rateLimiter } from "../security";
import {
  auditLog,
  auditLogRateLimit,
  checkInterrupt,
  startTypingIndicator,
} from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { bufferText } from "./text-buffer";

/**
 * Handle incoming text messages.
 * Buffers rapid successive messages (Telegram splits) into one.
 */
export async function handleText(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  let message = ctx.message?.text;

  if (!userId || !message || !chatId) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 2. Check for interrupt prefix (bypass buffer — interrupts are immediate)
  if (message.startsWith("!")) {
    message = await checkInterrupt(message);
    if (!message.trim()) return;
    await processText(ctx, message, userId, username, chatId);
    return;
  }

  // 3. Buffer message — waits for rapid follow-ups from Telegram splits
  bufferText(ctx, message, userId, chatId, async (lastCtx, combined, uid, cid) => {
    await processText(lastCtx, combined, uid, username, cid);
  });
}

/**
 * Process a (possibly combined) text message — the real handler logic.
 */
async function processText(
  ctx: Context,
  message: string,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  if (!message.trim()) return;

  // Rate limit check
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    await auditLogRateLimit(userId, username, retryAfter!);
    await ctx.reply(
      `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
    );
    return;
  }

  // Store message for retry
  session.lastMessage = message;

  // Set conversation title from first message (if new session)
  if (!session.isActive) {
    const title =
      message.length > 50 ? message.slice(0, 47) + "..." : message;
    session.conversationTitle = title;
  }

  // Inject GRAFO context automatically (Claude's memory)
  const grafoContext = await injectGrafoContext(message);
  const finalMessage = grafoContext ? grafoContext + message : message;

  // Mark processing started
  const stopProcessing = session.startProcessing();

  // 8. Start typing indicator
  const typing = startTypingIndicator(ctx);

  // 9. Create streaming state and callback
  let state = new StreamingState();
  let statusCallback = createStatusCallback(ctx, state);

  // 10. Send to Claude with retry logic for crashes
  const MAX_RETRIES = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await session.sendMessageStreaming(
        finalMessage,
        username,
        userId,
        statusCallback,
        chatId,
        ctx
      );

      // 11. Audit log
      await auditLog(userId, username, "TEXT", message, response);
      break; // Success - exit retry loop
    } catch (error) {
      const errorStr = String(error);
      const errorStrLower = errorStr.toLowerCase();
      const isClaudeCodeCrash = errorStr.includes("exited with code");
      const isNetworkError =
        errorStrLower.includes("econnrefused") ||
        errorStrLower.includes("etimedout") ||
        errorStrLower.includes("fetch failed");
      const isRateLimitError =
        errorStr.includes("429") ||
        errorStrLower.includes("rate limit");
      const isSDKError =
        errorStr.includes("500") ||
        errorStr.includes("502") ||
        errorStr.includes("503");
      const isRetryableError =
        isClaudeCodeCrash || isNetworkError || isRateLimitError || isSDKError;

      // Clean up any partial messages from this attempt
      for (const toolMsg of state.toolMessages) {
        try {
          await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
        } catch {
          // Ignore cleanup errors
        }
      }

      // Retry on transient errors (not user cancellation)
      if (isRetryableError && attempt < MAX_RETRIES) {
        const errorType = isClaudeCodeCrash
          ? "Claude crashed"
          : isNetworkError
            ? "Network error"
            : isRateLimitError
              ? "Rate limited"
              : "Server error";
        console.log(
          `${errorType}, retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})...`
        );

        // Add delay before retry for rate limits
        if (isRateLimitError) {
          await ctx.reply(`⚠️ ${errorType}, waiting 3s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
        } else {
          await ctx.reply(`⚠️ ${errorType}, retrying...`);
        }

        // Clear corrupted session only on crash
        if (isClaudeCodeCrash) {
          await session.kill();
        }

        // Reset state for retry
        state = new StreamingState();
        statusCallback = createStatusCallback(ctx, state);
        continue;
      }

      // Final attempt failed or non-retryable error
      console.error("Error processing message:", error);

      // Check if it was a cancellation
      if (errorStr.includes("abort") || errorStr.includes("cancel")) {
        // Only show "Query stopped" if it was an explicit stop, not an interrupt from a new message
        const wasInterrupt = session.consumeInterruptFlag();
        if (!wasInterrupt) {
          await ctx.reply("🛑 Query stopped.");
        }
      } else {
        await ctx.reply(`❌ Error: ${errorStr.slice(0, 200)}`);
      }
      break; // Exit loop after handling error
    }
  }

  // 12. Cleanup
  stopProcessing();
  typing.stop();
}

/**
 * Inject GRAFO context automatically before sending to Claude.
 * Returns context string or empty string if no matches.
 */
let grafoSkipLogged = false;

async function injectGrafoContext(userMessage: string): Promise<string> {
  try {
    const scriptPath = process.env.GRAFO_INJECT_SCRIPT || "";

    // If no script configured or file doesn't exist, skip silently
    if (!scriptPath) {
      if (!grafoSkipLogged) {
        console.debug("GRAFO injection skipped: GRAFO_INJECT_SCRIPT not set");
        grafoSkipLogged = true;
      }
      return "";
    }

    const fs = await import("fs");
    if (!fs.existsSync(scriptPath)) {
      if (!grafoSkipLogged) {
        console.debug(`GRAFO injection skipped: script not found at ${scriptPath}`);
        grafoSkipLogged = true;
      }
      return "";
    }

    const { promisify } = await import("util");
    const execFile = promisify((await import("child_process")).execFile);

    const pythonPath = process.env.PYTHON_PATH
      || Bun.which("python3")
      || Bun.which("python")
      || "python";

    const result = await execFile(pythonPath, [scriptPath, userMessage], {
      timeout: 5000, // 5 second timeout
      encoding: "utf8",
    });

    return result.stdout || "";
  } catch (error) {
    // Fail silently - don't block message if injection fails
    console.warn("GRAFO injection failed:", error);
    return "";
  }
}
