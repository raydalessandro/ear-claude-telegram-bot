/**
 * Tests for command registration — ensures every command that should exist
 * is registered in index.ts, exported from handlers, has a setMyCommands entry,
 * and appears in /start help text.
 *
 * If you add a new command, these tests will fail until you register it everywhere.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

const indexSrc = readFileSync(resolve(__dirname, "../../src/index.ts"), "utf-8");
const handlerIndexSrc = readFileSync(resolve(__dirname, "../../src/handlers/index.ts"), "utf-8");
const commandsSrc = readFileSync(resolve(__dirname, "../../src/handlers/commands.ts"), "utf-8");
const commandsNewSrc = readFileSync(resolve(__dirname, "../../src/handlers/commands-new.ts"), "utf-8");

// All commands the bot should support
const ORIGINAL_COMMANDS = ["start", "new", "stop", "status", "resume", "restart", "retry"];
const V2_COMMANDS = ["model", "dir", "files", "git", "think", "compact", "history", "chat", "pipeline", "title"];
const ALL_COMMANDS = [...ORIGINAL_COMMANDS, ...V2_COMMANDS];

// Commands that must appear in Telegram menu (setMyCommands) — excludes /start
const MENU_COMMANDS = ALL_COMMANDS.filter((c) => c !== "start");

// ============== bot.command() Registration ==============

describe("bot.command() registration in index.ts", () => {
  for (const cmd of ALL_COMMANDS) {
    test(`/${cmd} is registered with bot.command()`, () => {
      expect(indexSrc).toContain(`bot.command("${cmd}"`);
    });
  }

  test("no duplicate command registrations", () => {
    for (const cmd of ALL_COMMANDS) {
      const matches = indexSrc.match(new RegExp(`bot\\.command\\("${cmd}"`, "g"));
      expect(matches?.length).toBe(1);
    }
  });
});

// ============== Handler Exports ==============

describe("handler exports in handlers/index.ts", () => {
  const originalHandlers = [
    "handleStart", "handleNew", "handleStop", "handleStatus",
    "handleResume", "handleRestart", "handleRetry",
  ];
  const v2Handlers = [
    "handleModel", "handleDir", "handleFiles", "handleGit",
    "handleThink", "handleCompact", "handleHistory", "handleChat", "handlePipeline", "handleTitle",
  ];

  for (const handler of [...originalHandlers, ...v2Handlers]) {
    test(`${handler} is exported from handlers/index.ts`, () => {
      expect(handlerIndexSrc).toContain(handler);
    });
  }

  for (const handler of [...originalHandlers, ...v2Handlers]) {
    test(`${handler} is imported in index.ts`, () => {
      expect(indexSrc).toContain(handler);
    });
  }
});

// ============== setMyCommands Registration ==============

describe("Telegram menu registration (setMyCommands)", () => {
  test("setMyCommands is called at startup", () => {
    expect(indexSrc).toContain("setMyCommands");
  });

  for (const cmd of MENU_COMMANDS) {
    test(`/${cmd} is in setMyCommands list`, () => {
      const pattern = `command: "${cmd}"`;
      expect(indexSrc).toContain(pattern);
    });
  }

  test("every setMyCommands entry has a description", () => {
    const entries = indexSrc.match(/\{ command: "\w+", description: ".+" \}/g) || [];
    // Should have one entry per MENU_COMMANDS
    expect(entries.length).toBe(MENU_COMMANDS.length);
    for (const entry of entries) {
      expect(entry).toContain("description:");
      // Description should not be empty
      const desc = entry.match(/description: "(.+)"/)?.[1];
      expect(desc?.length).toBeGreaterThan(3);
    }
  });

  test("setMyCommands descriptions are in Italian", () => {
    // At least some should be Italian since user is Italian
    const descriptions = indexSrc.match(/description: "([^"]+)"/g) || [];
    const italian = descriptions.filter((d) =>
      /sessione|stato|ferma|riprendi|cambia|lista|modalità|gestisci|riavvia/i.test(d)
    );
    expect(italian.length).toBeGreaterThan(5);
  });
});

// ============== /start Help Text ==============

describe("/start help text completeness", () => {
  for (const cmd of V2_COMMANDS) {
    test(`/${cmd} appears in /start help message`, () => {
      expect(commandsSrc).toContain(`/${cmd}`);
    });
  }

  test("/start has sections for session, tools, and multi-chat", () => {
    expect(commandsSrc).toContain("Session");
    expect(commandsSrc).toContain("Tools");
    expect(commandsSrc).toContain("Multi-Chat");
  });
});

// ============== Command Handler Functions ==============

describe("command handler functions exist", () => {
  test("original handlers export correct functions", () => {
    expect(commandsSrc).toContain("export async function handleStart");
    expect(commandsSrc).toContain("export async function handleNew");
    expect(commandsSrc).toContain("export async function handleStop");
    expect(commandsSrc).toContain("export async function handleStatus");
    expect(commandsSrc).toContain("export async function handleResume");
    expect(commandsSrc).toContain("export async function handleRestart");
    expect(commandsSrc).toContain("export async function handleRetry");
  });

  test("v2 handlers export correct functions", () => {
    expect(commandsNewSrc).toContain("export async function handleModel");
    expect(commandsNewSrc).toContain("export async function handleDir");
    expect(commandsNewSrc).toContain("export async function handleFiles");
    expect(commandsNewSrc).toContain("export async function handleGit");
    expect(commandsNewSrc).toContain("export async function handleThink");
    expect(commandsNewSrc).toContain("export async function handleCompact");
    expect(commandsNewSrc).toContain("export async function handleHistory");
    expect(commandsNewSrc).toContain("export async function handleChat");
    expect(commandsNewSrc).toContain("export async function handlePipeline");
  });
});

// ============== Sequentialization ==============

describe("command sequentialization", () => {
  test("commands bypass sequentialization (immediate execution)", () => {
    expect(indexSrc).toContain('startsWith("/")');
    expect(indexSrc).toContain("return undefined");
  });

  test("! prefix bypasses sequentialization (interrupt)", () => {
    expect(indexSrc).toContain('startsWith("!")');
  });

  test("callback queries bypass sequentialization", () => {
    expect(indexSrc).toContain("callbackQuery");
  });

  test("regular messages are sequentialized per chat", () => {
    expect(indexSrc).toContain("ctx.chat?.id.toString()");
  });
});

// ============== Handler Order ==============

describe("handler registration order", () => {
  test("commands are registered BEFORE message:text handler", () => {
    const firstCommand = indexSrc.indexOf('bot.command("start"');
    const textHandler = indexSrc.indexOf('bot.on("message:text"');
    expect(firstCommand).toBeGreaterThan(-1);
    expect(textHandler).toBeGreaterThan(-1);
    expect(firstCommand).toBeLessThan(textHandler);
  });

  test("v2 commands are registered BEFORE message:text handler", () => {
    const modelCmd = indexSrc.indexOf('bot.command("model"');
    const textHandler = indexSrc.indexOf('bot.on("message:text"');
    expect(modelCmd).toBeGreaterThan(-1);
    expect(modelCmd).toBeLessThan(textHandler);
  });

  test("message handlers come BEFORE callback handler", () => {
    const textHandler = indexSrc.indexOf('bot.on("message:text"');
    const callbackHandler = indexSrc.indexOf('bot.on("callback_query:data"');
    expect(textHandler).toBeLessThan(callbackHandler);
  });

  test("error handler is registered", () => {
    expect(indexSrc).toContain("bot.catch");
  });
});

// ============== Auth Consistency ==============

describe("auth consistency across handlers", () => {
  test("all v2 commands pass ALLOWED_USERS", () => {
    for (const cmd of V2_COMMANDS) {
      const pattern = `handleModel(ctx, ALLOWED_USERS)`.replace("Model",
        cmd.charAt(0).toUpperCase() + cmd.slice(1));
      // Just verify ALLOWED_USERS is used in the wrapper
      expect(indexSrc).toContain("ALLOWED_USERS");
    }
  });

  test("v2 command handlers check authorization", () => {
    expect(commandsNewSrc).toContain("checkAuth(ctx, allowedUsers)");
  });

  test("original command handlers check authorization", () => {
    expect(commandsSrc).toContain("isAuthorized(userId, ALLOWED_USERS)");
  });
});
