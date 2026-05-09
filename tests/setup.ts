/**
 * Test setup — set required env vars before any imports.
 */

// Set required env vars so config.ts doesn't exit
process.env.TELEGRAM_BOT_TOKEN = "test-token-123";
process.env.TELEGRAM_ALLOWED_USERS = "123,456";
process.env.CLAUDE_WORKING_DIR = process.cwd();
process.env.RATE_LIMIT_ENABLED = "false";

// Use a separate temp dir for tests so we never corrupt production session files
process.env.TEMP = process.cwd() + "/tests/.tmp";
process.env.TMP = process.cwd() + "/tests/.tmp";

import { mkdirSync } from "fs";
try { mkdirSync(process.cwd() + "/tests/.tmp", { recursive: true }); } catch {}
