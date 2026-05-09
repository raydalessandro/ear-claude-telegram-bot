# EAR Claude Telegram Bot

Control Claude Code from your phone via Telegram. Send text, voice messages, photos, and documents — get streaming responses with live tool status.

## Features

- **Text** — Chat with Claude Code, full streaming with tool status updates
- **Voice** — Send voice messages, transcribed locally via Whisper then sent to Claude
- **Photos & Documents** — Send images, PDFs, text files for analysis
- **Multi-session** — Save up to 20 sessions, resume any time, rename with `/title`
- **17 commands** — Model switching, git status, file listing, thinking mode, and more
- **Smart splitting** — Long messages from Telegram are reassembled; long responses are split safely
- **Security** — User allowlist, rate limiting, path validation, command safety checks
- **624 tests** — Full test coverage, TDD approach

## Quick Start

### 1. Install Bun

```bash
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"

# macOS/Linux
curl -fsSL https://bun.sh/install | bash
```

### 2. Create your Telegram bot

1. Open Telegram and message [@BotFather](https://t.me/BotFather)
2. Send `/newbot` and follow the prompts
3. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Find your Telegram user ID — message [@userinfobot](https://t.me/userinfobot) and it will tell you

### 3. Install dependencies

```bash
cd EAR_CLAUDE_TELEGRAM_BOT
bun install
```

### 4. Configure

```bash
cp .env.example .env
```

Edit `.env` with your editor:

```env
# REQUIRED — your bot token and your Telegram user ID
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ALLOWED_USERS=your-user-id

# RECOMMENDED — the directory where Claude will work
# Claude loads CLAUDE.md from this directory at session start
CLAUDE_WORKING_DIR=C:\Users\you\projects
ALLOWED_PATHS=C:\Users\you\projects,C:\Users\you\Documents
```

### 5. Run

```bash
bun run start
```

Open Telegram, find your bot, send a message. That's it.

### 6. Voice messages (optional)

For voice message support, install Python and Whisper:

```bash
pip install openai-whisper
```

Add to `.env`:
```env
PYTHON_PATH=C:\Users\you\AppData\Local\Programs\Python\Python311\python.exe
```

## Commands

Tap `/` in the Telegram chat to see the full menu. Highlights:

| Command | What it does |
|---------|-------------|
| `/new` | Start fresh session |
| `/resume` | List and resume saved sessions |
| `/title Bot v2` | Rename current session |
| `/model sonnet` | Switch model (opus/sonnet/haiku) |
| `/dir C:\projects` | Change working directory |
| `/files` | List files in current directory |
| `/git` | Git status (also `/git log`, `/git diff`) |
| `/think` | Toggle thinking mode (off → normal → deep) |
| `/stop` | Stop current query |
| `/status` | Show bot status and token usage |

**Tips:**
- Prefix with `!` to interrupt current query: `!new question here`
- Use "think" or "pensa" in your message for extended reasoning
- Send photos, voice, or documents — they're all processed

## How It Works

```
You (Telegram)
  → Text buffer (reassembles split messages)
  → Auth + Rate limit
  → Claude Code (Agent SDK, streaming)
  → Smart response splitting (HTML-safe)
  → You (Telegram)
```

Claude runs with full Claude Code capabilities — it can read/write files, run commands, search code, use tools. The bot acts as a bridge between Telegram and Claude Code on your machine.

### Session Persistence

Sessions are saved to disk automatically. When you do `/resume`, you see your saved sessions with date and title. Claude remembers the full conversation context.

### Security

- Only users in `TELEGRAM_ALLOWED_USERS` can use the bot
- File operations restricted to `ALLOWED_PATHS`
- Dangerous bash commands blocked (rm -rf /, sudo rm, etc.)
- Rate limiting prevents abuse
- All interactions logged to audit file

## Development

```bash
bun run dev        # Run with auto-reload
bun test           # Run all 624 tests
bun test:unit      # Unit tests only
bun test:e2e       # E2E tests only
bun test:watch     # Watch mode
bun run typecheck  # TypeScript type check
```

## Requirements

- [Bun](https://bun.sh/) v1.0+
- [Claude Code](https://claude.ai/code) CLI installed and authenticated
- Telegram bot token
- Python 3.11+ with Whisper (optional, for voice)

## Credits

This project is a fork of [claude-telegram-bot](https://github.com/linuz90/claude-telegram-bot) by [@linuz90](https://github.com/linuz90).

**What changed:**
- Integration with ORGANON (GRAFO v2, session sync, identity persistence)
- Extended safety boundaries (path restrictions, destructive command blocking)
- 17 commands (vs 8 original) — added `/title`, `/dir`, `/files`, `/git`, `/think`, `/stop`, and more
- Session persistence (save/resume up to 20 sessions)
- Multi-chat support (independent sessions per Telegram chat)
- Full test coverage (624 tests, TDD approach)
- Smart message splitting (HTML-safe, preserves formatting)
- Enhanced security (user allowlist, rate limiting, audit logging)

Original foundation by linuz90 — extended for EAR ecosystem integration.

## License

MIT
