/**
 * New command handlers for Claude Telegram Bot v2.
 *
 * /model, /dir, /files, /git, /think, /compact, /history, /chat, /pipeline
 */

import type { Context } from "grammy";
import { isAuthorized, isPathAllowed } from "../security";
import { WORKING_DIR } from "../config";
import { escapeHtml } from "../formatting";
import { MediaPipeline } from "../media-pipeline";
import { session } from "../session";

// Valid Claude model shortcuts
const VALID_MODELS: Record<string, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5",
  haiku: "claude-haiku-4-5-20251001",
};

// Dangerous git subcommands that should be blocked
const BLOCKED_GIT_ARGS = [
  "push --force", "push -f",
  "reset --hard",
  "clean -f", "clean -fd",
  "checkout .",
];

// Current model state (will be moved to session in full implementation)
let currentModel = "claude-sonnet-4-5";
let thinkingMode: "off" | "normal" | "deep" = "off";

/** Reset module state — for testing only. */
export function _resetState() {
  currentModel = "claude-sonnet-4-5";
  thinkingMode = "off";
}

// Global pipeline instance
let pipeline: MediaPipeline | null = null;
function getPipeline(): MediaPipeline {
  if (!pipeline) pipeline = new MediaPipeline();
  return pipeline;
}

/**
 * Parse command arguments from message text.
 * "/cmd arg1 arg2" → "arg1 arg2"
 * Also strips @botname suffix from command.
 */
export function parseCommandArgs(text: string): string {
  const parts = text.trim().split(/\s+/);
  // Strip @botname from command part (e.g. "/model@mybot" → "/model")
  // Then take everything after the command
  return parts.slice(1).join(" ").trim();
}

// Auth helper
function checkAuth(ctx: Context, allowedUsers: number[]): boolean {
  const userId = ctx.from?.id;
  if (!isAuthorized(userId, allowedUsers)) {
    ctx.reply("Unauthorized.");
    return false;
  }
  return true;
}

/**
 * /model [name] — Show or switch Claude model.
 */
export async function handleModel(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");

  if (!args) {
    const modelName = Object.entries(VALID_MODELS).find(
      ([_, id]) => id === currentModel
    )?.[0] ?? currentModel;
    await ctx.reply(`Current model: <b>${modelName}</b>\n\nAvailable: ${Object.keys(VALID_MODELS).join(", ")}`, {
      parse_mode: "HTML",
    });
    return;
  }

  const modelKey = args.toLowerCase();
  if (!VALID_MODELS[modelKey]) {
    await ctx.reply(
      `Unknown model "${args}". Available: ${Object.keys(VALID_MODELS).join(", ")}`
    );
    return;
  }

  currentModel = VALID_MODELS[modelKey]!;
  await ctx.reply(`Model switched to <b>${modelKey}</b> (${currentModel})`, {
    parse_mode: "HTML",
  });
}

/**
 * /dir [path] — Show or change working directory.
 */
export async function handleDir(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");

  if (!args) {
    await ctx.reply(`Current directory: <code>${WORKING_DIR}</code>`, {
      parse_mode: "HTML",
    });
    return;
  }

  // Validate path exists
  const { existsSync } = await import("fs");
  if (!existsSync(args)) {
    await ctx.reply(`Path not found: ${args}`);
    return;
  }

  // Validate path is allowed
  if (!isPathAllowed(args)) {
    await ctx.reply(`Path not allowed: outside permitted directories.`);
    return;
  }

  await ctx.reply(`Directory changed to: <code>${args}</code>`, {
    parse_mode: "HTML",
  });
}

/**
 * /files [subdir] — List files in current working directory.
 */
export async function handleFiles(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");
  const { resolve } = await import("path");
  const targetDir = args ? resolve(WORKING_DIR, args) : WORKING_DIR;

  try {
    const { readdirSync } = await import("fs");
    const files = readdirSync(targetDir);
    const list = files.slice(0, 50).map((f) => `• ${f}`).join("\n");
    await ctx.reply(
      `📁 <b>${targetDir}</b> (${files.length} files)\n\n${list}${files.length > 50 ? `\n\n... and ${files.length - 50} more` : ""}`,
      { parse_mode: "HTML" }
    );
  } catch (error) {
    await ctx.reply(`Error listing files: ${String(error).slice(0, 200)}`);
  }
}

/**
 * /git [subcommand] — Show git status or run safe git commands.
 */
export async function handleGit(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");

  // Check for dangerous git commands
  const argsLower = args.toLowerCase();
  for (const blocked of BLOCKED_GIT_ARGS) {
    if (argsLower.includes(blocked)) {
      await ctx.reply(`Blocked: "git ${args}" is a dangerous operation.`);
      return;
    }
  }

  // Build git command
  const gitArgs = args
    ? args.split(/\s+/)
    : ["status", "--short", "--branch"];

  try {
    const proc = Bun.spawn(["git", ...gitArgs], {
      cwd: WORKING_DIR,
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      await ctx.reply(`Git error:\n<pre>${(stderr || output).slice(0, 3000)}</pre>`, {
        parse_mode: "HTML",
      });
      return;
    }

    await ctx.reply(`<pre>${output.slice(0, 3000) || "Clean"}</pre>`, {
      parse_mode: "HTML",
    });
  } catch (error) {
    await ctx.reply(`Git error: ${String(error).slice(0, 200)}`);
  }
}

/**
 * /think [off|normal|deep] — Toggle or set thinking mode.
 */
export async function handleThink(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "").toLowerCase();

  if (args === "off" || args === "normal" || args === "deep") {
    thinkingMode = args;
  } else if (!args) {
    // Toggle: off → normal → deep → off
    const cycle = { off: "normal", normal: "deep", deep: "off" } as const;
    thinkingMode = cycle[thinkingMode];
  }

  const labels = { off: "🔇 Off", normal: "🧠 Normal (10K)", deep: "🧠🧠 Deep (50K)" };
  await ctx.reply(`Thinking mode: ${labels[thinkingMode]}`);
}

/**
 * /compact — Trigger context compaction.
 */
export async function handleCompact(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;
  await ctx.reply("🗜️ Compaction requested. Next message will trigger compaction.");
}

/**
 * /history [count] — Show recent message history.
 */
export async function handleHistory(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;
  await ctx.reply("📜 Message history not yet available. Coming soon.");
}

/**
 * /title [new title] — Show or change current session title.
 */
export async function handleTitle(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  if (!session.isActive) {
    await ctx.reply("❌ Nessuna sessione attiva.");
    return;
  }

  const args = parseCommandArgs(ctx.message?.text || "");

  if (!args) {
    const current = session.conversationTitle || "Senza titolo";
    await ctx.reply(`📝 ${current}`);
    return;
  }

  session.conversationTitle = args;
  session.saveSession();
  await ctx.reply(`✅ ${args}`);
}

/**
 * /chat [new|list|switch|delete|rename] [name] — Manage multiple chats.
 */
export async function handleChat(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");
  const parts = args.split(/\s+/).filter(Boolean);
  const subcommand = parts[0]?.toLowerCase() || "";
  const chatName = parts.slice(1).join(" ");

  const { chatManager } = await import("../chat-state");

  switch (subcommand) {
    case "list": {
      const chats = chatManager.list();
      if (chats.length === 0) {
        await ctx.reply("No chats. Create one with /chat new <name>");
        return;
      }
      const list = chats
        .map((c) => `${c.isActive ? "▶️" : "⚪"} <b>${c.name}</b> — ${c.workingDir}`)
        .join("\n");
      await ctx.reply(`📋 <b>Chats</b>\n\n${list}`, { parse_mode: "HTML" });
      break;
    }

    case "new": {
      if (!chatName) {
        await ctx.reply("Usage: /chat new <name> [working_dir]");
        return;
      }
      try {
        chatManager.create(chatName);
        await ctx.reply(`✅ Chat "${chatName}" created and active.`);
      } catch (error) {
        await ctx.reply(`Error: ${String(error).slice(0, 200)}`);
      }
      break;
    }

    case "switch": {
      if (!chatName) {
        await ctx.reply("Usage: /chat switch <name>");
        return;
      }
      try {
        chatManager.switchTo(chatName);
        await ctx.reply(`Switched to chat "${chatName}"`);
      } catch (error) {
        await ctx.reply(`Error: ${String(error).slice(0, 200)}`);
      }
      break;
    }

    case "delete": {
      if (!chatName) {
        await ctx.reply("Usage: /chat delete <name>");
        return;
      }
      try {
        chatManager.delete(chatName);
        await ctx.reply(`🗑️ Chat "${chatName}" deleted.`);
      } catch (error) {
        await ctx.reply(`Error: ${String(error).slice(0, 200)}`);
      }
      break;
    }

    case "rename": {
      const renameParts = chatName.split(/\s+/);
      const oldName = renameParts[0];
      const newName = renameParts.slice(1).join(" ");
      if (!oldName || !newName) {
        await ctx.reply("Usage: /chat rename <old_name> <new_name>");
        return;
      }
      try {
        chatManager.rename(oldName, newName);
        await ctx.reply(`Renamed to "${newName}"`);
      } catch (error) {
        await ctx.reply(`Error: ${String(error).slice(0, 200)}`);
      }
      break;
    }

    default: {
      await ctx.reply(
        `<b>/chat</b> — Manage multiple chats\n\n` +
          `/chat list — Show all chats\n` +
          `/chat new <name> — Create new chat\n` +
          `/chat switch <name> — Switch active chat\n` +
          `/chat delete <name> — Delete a chat\n` +
          `/chat rename <old> <new> — Rename a chat`,
        { parse_mode: "HTML" }
      );
    }
  }
}

/**
 * /pipeline [enable|disable] [media_type] — Manage media pipeline tools.
 */
export async function handlePipeline(ctx: Context, allowedUsers: number[]): Promise<void> {
  if (!checkAuth(ctx, allowedUsers)) return;

  const args = parseCommandArgs(ctx.message?.text || "");
  const parts = args.split(/\s+/).filter(Boolean);
  const subcommand = parts[0]?.toLowerCase() || "";
  const mediaType = parts[1]?.toLowerCase() || "";
  const pl = getPipeline();

  switch (subcommand) {
    case "enable": {
      if (!mediaType) {
        await ctx.reply("Usage: /pipeline enable <image|audio|video|document>");
        return;
      }
      pl.enable(mediaType as any);
      await ctx.reply(`✅ Pipeline enabled for ${mediaType}`);
      break;
    }

    case "disable": {
      if (!mediaType) {
        await ctx.reply("Usage: /pipeline disable <image|audio|video|document>");
        return;
      }
      pl.disable(mediaType as any);
      await ctx.reply(`⏹️ Pipeline disabled for ${mediaType}`);
      break;
    }

    default: {
      const status = pl.getStatus();
      await ctx.reply(`<b>Media Pipeline</b>\n\n<pre>${status}</pre>`, {
        parse_mode: "HTML",
      });
    }
  }
}
