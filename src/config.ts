/**
 * Configuration for Claude Telegram Bot.
 *
 * All environment variables, paths, constants, and safety settings.
 *
 * ============================================================
 * ⚠️  MODIFICHE IMPORTANTI — 2025-01-29 (Ray + Claude CLI)
 * ============================================================
 *
 * PROBLEMA RISOLTO: "Context contamination"
 *   Il bot auto-detectava la sessione CLI più recente da
 *   ~/.claude/projects/.../sessions-index.json
 *   Se la CLI stava lavorando su DeepSeek, il bot riprendeva
 *   quella sessione e Claude rispondeva come DeepSeek.
 *
 * FIX APPLICATO:
 *   - Rimosso auto-detect sessione CLI (riga ~275)
 *   - Il bot crea la sua sessione autonoma al primo messaggio
 *   - Per forzare una sessione specifica: SHARED_SESSION_ID nel .env
 *
 * FILE MODIFICATI:
 *   - config.ts (qui): rimosso getLatestSessionId() dall'init
 *   - session.ts: rimosso refreshSharedSessionId() dal loop messaggi
 *
 * NOTE PER FUTURE MODIFICHE:
 *   - NON riattivare auto-detect senza gestire la separazione
 *     tra sessioni CLI e sessioni bot
 *   - Se serve persistenza sessione bot tra riavvii, usare
 *     SHARED_SESSION_ID nel .env con un ID fisso
 *   - Il bot DeepSeek (@EAR_Deepseek_bot) è in deepseek-telegram-bot/
 *     ed è completamente separato (usa layer-universale-ai, non Agent SDK)
 *   - I due bot NON devono condividere sessioni o contesto
 *
 * BUG NOTI DA SISTEMARE:
 *   - Errori 400 tool_use_concurrency (sporadici)
 *   - Messaggi doppi (da verificare)
 *   - Dopo compattazione sessione, identità può sbiadire
 *     (il boot CLAUDE.md dovrebbe rigenerarla)
 * ============================================================
 */

import { homedir } from "os";
import { resolve, dirname } from "path";
import type { McpServerConfig } from "./types";

// ============== Environment Setup ==============

const HOME = homedir();

// Ensure necessary paths are available for Claude's bash commands
// LaunchAgents don't inherit the full shell environment
const EXTRA_PATHS = [
  `${HOME}/.local/bin`,
  `${HOME}/.bun/bin`,
  "/opt/homebrew/bin",
  "/opt/homebrew/sbin",
  "/usr/local/bin",
];

const currentPath = process.env.PATH || "";
const pathParts = currentPath.split(":");
for (const extraPath of EXTRA_PATHS) {
  if (!pathParts.includes(extraPath)) {
    pathParts.unshift(extraPath);
  }
}
process.env.PATH = pathParts.join(":");

// ============== Core Configuration ==============

export const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
export const ALLOWED_USERS: number[] = (
  process.env.TELEGRAM_ALLOWED_USERS || ""
)
  .split(",")
  .filter((x) => x.trim())
  .map((x) => parseInt(x.trim(), 10))
  .filter((x) => !isNaN(x));

export const WORKING_DIR = process.env.CLAUDE_WORKING_DIR || HOME;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

// ============== Claude CLI Path ==============

// Auto-detect from PATH, or use environment override
function findClaudeCli(): string {
  const envPath = process.env.CLAUDE_CLI_PATH;
  if (envPath) return envPath;

  // Try to find claude in PATH using Bun.which
  const whichResult = Bun.which("claude");
  if (whichResult) return whichResult;

  // Final fallback
  return "/usr/local/bin/claude";
}

export const CLAUDE_CLI_PATH = findClaudeCli();

// ============== MCP Configuration ==============

// MCP servers loaded from mcp-config.ts
let MCP_SERVERS: Record<string, McpServerConfig> = {};

try {
  // Dynamic import of MCP config
  const mcpConfigPath = resolve(dirname(import.meta.dir), "mcp-config.ts");
  const mcpModule = await import(mcpConfigPath).catch(() => null);
  if (mcpModule?.MCP_SERVERS) {
    MCP_SERVERS = mcpModule.MCP_SERVERS;
    console.log(
      `Loaded ${Object.keys(MCP_SERVERS).length} MCP servers from mcp-config.ts`
    );
  }
} catch {
  console.log("No mcp-config.ts found - running without MCPs");
}

export { MCP_SERVERS };

// ============== Security Configuration ==============

// Allowed directories for file operations
const defaultAllowedPaths = [
  WORKING_DIR,
  `${HOME}/Documents`,
  `${HOME}/Downloads`,
  `${HOME}/Desktop`,
  `${HOME}/.claude`, // Claude Code data (plans, settings)
];

const allowedPathsStr = process.env.ALLOWED_PATHS || "";
export const ALLOWED_PATHS: string[] = allowedPathsStr
  ? allowedPathsStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
  : defaultAllowedPaths;

// Build safety prompt dynamically from ALLOWED_PATHS
function buildSafetyPrompt(allowedPaths: string[]): string {
  const pathsList = allowedPaths
    .map((p) => `   - ${p} (and subdirectories)`)
    .join("\n");

  return `
CRITICAL SAFETY RULES FOR TELEGRAM BOT:

1. NEVER delete, remove, or overwrite files without EXPLICIT confirmation from the user.
   - If user asks to delete something, respond: "Are you sure you want to delete [file]? Reply 'yes delete it' to confirm."
   - Only proceed with deletion if user replies with explicit confirmation like "yes delete it", "confirm delete"
   - This applies to: rm, trash, unlink, shred, or any file deletion

2. You can ONLY access files in these directories:
${pathsList}
   - REFUSE any file operations outside these paths

3. NEVER run dangerous commands like:
   - rm -rf (recursive force delete)
   - Any command that affects files outside allowed directories
   - Commands that could damage the system

4. For any destructive or irreversible action, ALWAYS ask for confirmation first.

You are running via Telegram, so the user cannot easily undo mistakes. Be extra careful!
`;
}

export const SAFETY_PROMPT = buildSafetyPrompt(ALLOWED_PATHS);

// Dangerous command patterns to block
export const BLOCKED_PATTERNS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -rf $HOME",
  "sudo rm",
  ":(){ :|:& };:", // Fork bomb
  "> /dev/sd",
  "mkfs.",
  "dd if=",
];

// Query timeout (5 minutes)
export const QUERY_TIMEOUT_MS = 300_000;

// ============== Voice Transcription ==============

const BASE_TRANSCRIPTION_PROMPT = `Transcribe this voice message accurately.
The speaker may use multiple languages (English, and possibly others).
Focus on accuracy for proper nouns, technical terms, and commands.`;

const TRANSCRIPTION_CONTEXT = process.env.TRANSCRIPTION_CONTEXT || "";

export const TRANSCRIPTION_PROMPT = TRANSCRIPTION_CONTEXT
  ? `${BASE_TRANSCRIPTION_PROMPT}\n\nAdditional context:\n${TRANSCRIPTION_CONTEXT}`
  : BASE_TRANSCRIPTION_PROMPT;

// Transcription now uses local offline Whisper (no API key required)
export const TRANSCRIPTION_AVAILABLE = true;

// ============== Thinking Keywords ==============

const thinkingKeywordsStr =
  process.env.THINKING_KEYWORDS || "think,pensa,ragiona";
const thinkingDeepKeywordsStr =
  process.env.THINKING_DEEP_KEYWORDS || "ultrathink,think hard,pensa bene";

export const THINKING_KEYWORDS = thinkingKeywordsStr
  .split(",")
  .map((k) => k.trim().toLowerCase());
export const THINKING_DEEP_KEYWORDS = thinkingDeepKeywordsStr
  .split(",")
  .map((k) => k.trim().toLowerCase());

// ============== Media Group Settings ==============

export const MEDIA_GROUP_TIMEOUT = 2500; // ms to wait for more photos in a group

// ============== Telegram Message Limits ==============

export const TELEGRAM_MESSAGE_LIMIT = 4096; // Max characters per message
export const TELEGRAM_SAFE_LIMIT = 4000; // Safe limit with buffer for formatting
export const STREAMING_THROTTLE_MS = 500; // Throttle streaming updates
export const BUTTON_LABEL_MAX_LENGTH = 30; // Max chars for inline button labels

// ============== Audit Logging ==============

export const AUDIT_LOG_PATH =
  process.env.AUDIT_LOG_PATH || "/tmp/claude-telegram-audit.log";
export const AUDIT_LOG_JSON =
  (process.env.AUDIT_LOG_JSON || "false").toLowerCase() === "true";

// ============== Rate Limiting ==============

export const RATE_LIMIT_ENABLED =
  (process.env.RATE_LIMIT_ENABLED || "true").toLowerCase() === "true";
export const RATE_LIMIT_REQUESTS = parseInt(
  process.env.RATE_LIMIT_REQUESTS || "20",
  10
);
export const RATE_LIMIT_WINDOW = parseInt(
  process.env.RATE_LIMIT_WINDOW || "60",
  10
);

// ============== File Paths ==============

// Windows-compatible temp paths
const IS_WINDOWS = process.platform === "win32";
const TEMP_BASE = IS_WINDOWS
  ? (process.env.TEMP || `${HOME}\\AppData\\Local\\Temp`)
  : "/tmp";

export const SESSION_FILE = `${TEMP_BASE}${IS_WINDOWS ? "\\" : "/"}claude-telegram-session.json`;
export const RESTART_FILE = `${TEMP_BASE}${IS_WINDOWS ? "\\" : "/"}claude-telegram-restart.json`;
export const TEMP_DIR = `${TEMP_BASE}${IS_WINDOWS ? "\\" : "/"}telegram-bot`;

// Temp paths that are always allowed for bot operations
export const TEMP_PATHS = IS_WINDOWS
  ? [TEMP_BASE, `${HOME}\\AppData\\Local\\Temp`]
  : ["/tmp/", "/private/tmp/", "/var/folders/"];

// Shared session ID - auto-detect from Claude's session index
function getLatestSessionId(): string {
  try {
    const IS_WIN = process.platform === "win32";
    const sep = IS_WIN ? "\\" : "/";

    // Build path to Claude's session index for this working dir
    // Claude replaces : \ / and spaces with -
    const projectKey = WORKING_DIR.replace(/[:\\\/ ]/g, "-").replace(/^-+/, "");
    const sessionIndexPath = `${HOME}${sep}.claude${sep}projects${sep}${projectKey}${sep}sessions-index.json`;

    const file = Bun.file(sessionIndexPath);
    if (!file.size) return "";

    const content = require("fs").readFileSync(sessionIndexPath, "utf-8");
    const data = JSON.parse(content);

    if (!data.entries || data.entries.length === 0) return "";

    // Find the most recent session by modified date
    const sorted = data.entries.sort((a: any, b: any) => {
      const dateA = new Date(a.modified || a.created || 0).getTime();
      const dateB = new Date(b.modified || b.created || 0).getTime();
      return dateB - dateA;
    });

    const latestSession = sorted[0];
    if (latestSession?.sessionId) {
      console.log(`Auto-detected session: ${latestSession.sessionId.slice(0, 8)}... ("${latestSession.summary || latestSession.firstPrompt?.slice(0, 30) || 'untitled'}")`);
      return latestSession.sessionId;
    }

    return "";
  } catch (error) {
    console.log(`Could not auto-detect session: ${error}`);
    return "";
  }
}

// Export function to refresh session ID dynamically
export function refreshSharedSessionId(): string {
  const newId = getLatestSessionId();
  if (newId) {
    currentSharedSessionId = newId;
  }
  return currentSharedSessionId;
}

// Bot creates its own session — never auto-detect CLI sessions
// (auto-detect causes context contamination from other CLI work)
let currentSharedSessionId = process.env.SHARED_SESSION_ID || "";
export { currentSharedSessionId as SHARED_SESSION_ID };

// Ensure temp directory exists
await Bun.write(`${TEMP_DIR}${IS_WINDOWS ? "\\" : "/"}.keep`, "");

// ============== Validation ==============

if (!TELEGRAM_TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN environment variable is required");
  process.exit(1);
}

if (ALLOWED_USERS.length === 0) {
  console.error(
    "ERROR: TELEGRAM_ALLOWED_USERS environment variable is required"
  );
  process.exit(1);
}

console.log(
  `Config loaded: ${ALLOWED_USERS.length} allowed users, working dir: ${WORKING_DIR}`
);
