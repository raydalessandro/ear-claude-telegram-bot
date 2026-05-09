/**
 * Text message buffer for Claude Telegram Bot.
 *
 * When Telegram splits a long message into multiple parts,
 * this buffer collects them and delivers a single combined message.
 *
 * Detection: rapid successive text messages from the same user
 * within TEXT_BUFFER_TIMEOUT_MS are combined into one.
 */

import type { Context } from "grammy";

const TEXT_BUFFER_TIMEOUT_MS = 500; // ms to wait for more parts

interface PendingText {
  parts: string[];
  ctx: Context; // Keep the last ctx for reply
  userId: number;
  chatId: number;
  timeout: Timer;
}

// Per-chat buffer
const pendingTexts = new Map<number, PendingText>();

export type TextReadyCallback = (
  ctx: Context,
  combinedText: string,
  userId: number,
  chatId: number
) => Promise<void>;

/**
 * Buffer a text message. Calls `onReady` when the buffer window expires
 * with all parts combined.
 *
 * @returns true if message was buffered (caller should NOT process it)
 */
export function bufferText(
  ctx: Context,
  text: string,
  userId: number,
  chatId: number,
  onReady: TextReadyCallback
): boolean {
  const existing = pendingTexts.get(chatId);

  if (existing && existing.userId === userId) {
    // Same user, same chat — append as continuation
    existing.parts.push(text);
    existing.ctx = ctx; // update to latest ctx for reply
    // Reset timer
    clearTimeout(existing.timeout);
    existing.timeout = setTimeout(() => flushBuffer(chatId, onReady), TEXT_BUFFER_TIMEOUT_MS);
    return true;
  }

  // New buffer
  const pending: PendingText = {
    parts: [text],
    ctx,
    userId,
    chatId,
    timeout: setTimeout(() => flushBuffer(chatId, onReady), TEXT_BUFFER_TIMEOUT_MS),
  };
  pendingTexts.set(chatId, pending);
  return true;
}

/**
 * Flush the buffer and call the callback with combined text.
 */
async function flushBuffer(
  chatId: number,
  onReady: TextReadyCallback
): Promise<void> {
  const pending = pendingTexts.get(chatId);
  if (!pending) return;

  pendingTexts.delete(chatId);

  const combined = pending.parts.join("\n");
  await onReady(pending.ctx, combined, pending.userId, pending.chatId);
}

/**
 * Check if a chat has a pending buffer (for testing).
 */
export function hasPendingBuffer(chatId: number): boolean {
  return pendingTexts.has(chatId);
}

/**
 * Clear all buffers (for testing).
 */
export function clearAllBuffers(): void {
  for (const [, pending] of pendingTexts) {
    clearTimeout(pending.timeout);
  }
  pendingTexts.clear();
}

/**
 * Get buffer timeout value (for testing).
 */
export const BUFFER_TIMEOUT = TEXT_BUFFER_TIMEOUT_MS;
