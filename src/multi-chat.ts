/**
 * Multi-Chat management for Claude Telegram Bot v2.
 *
 * Allows managing multiple independent Claude sessions from Telegram,
 * each with its own context, working directory, and session state.
 */

import { WORKING_DIR } from "./config";

const MAX_CHATS = 10;

export interface Chat {
  name: string;
  workingDir: string;
  sessionId: string | null;
  createdAt: string;
  lastActivity: string | null;
  isActive: boolean;
}

export class ChatManager {
  private chats: Map<string, Chat> = new Map();
  private activeChatName: string | null = null;

  /**
   * Create a new chat with a name and optional working directory.
   */
  create(name: string, workingDir?: string): Chat {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error("Chat name cannot be empty");
    }
    if (this.chats.has(trimmed)) {
      throw new Error(`Chat "${trimmed}" already exists`);
    }
    if (this.chats.size >= MAX_CHATS) {
      throw new Error(`Cannot create chat: maximum ${MAX_CHATS} chats reached`);
    }

    const chat: Chat = {
      name: trimmed,
      workingDir: workingDir ?? WORKING_DIR,
      sessionId: null,
      createdAt: new Date().toISOString(),
      lastActivity: null,
      isActive: false,
    };

    this.chats.set(trimmed, chat);

    // First chat becomes active
    if (this.chats.size === 1) {
      this.activeChatName = trimmed;
      chat.isActive = true;
    }

    return chat;
  }

  /**
   * List all chats with their active status.
   */
  list(): Chat[] {
    return Array.from(this.chats.values()).map((c) => ({
      ...c,
      isActive: c.name === this.activeChatName,
    }));
  }

  /**
   * Get the active chat, or null if none.
   */
  active(): Chat | null {
    if (!this.activeChatName) return null;
    return this.chats.get(this.activeChatName) ?? null;
  }

  /**
   * Get a chat by name.
   */
  get(name: string): Chat | null {
    return this.chats.get(name) ?? null;
  }

  /**
   * Switch to a different chat by name.
   */
  switchTo(name: string): void {
    if (!this.chats.has(name)) {
      throw new Error(`Chat "${name}" not found`);
    }

    if (this.activeChatName) {
      const prev = this.chats.get(this.activeChatName);
      if (prev) prev.isActive = false;
    }

    this.activeChatName = name;
    const chat = this.chats.get(name)!;
    chat.isActive = true;
    chat.lastActivity = new Date().toISOString();
  }

  /**
   * Delete a chat by name.
   */
  delete(name: string): void {
    if (!this.chats.has(name)) {
      throw new Error(`Chat "${name}" not found`);
    }
    if (name === this.activeChatName) {
      throw new Error("Cannot delete active chat. Switch to another chat first.");
    }
    this.chats.delete(name);
  }

  /**
   * Rename a chat.
   */
  rename(oldName: string, newName: string): void {
    const trimmedNew = newName.trim();
    if (!this.chats.has(oldName)) {
      throw new Error(`Chat "${oldName}" not found`);
    }
    if (this.chats.has(trimmedNew)) {
      throw new Error(`Chat "${trimmedNew}" already exists`);
    }

    const chat = this.chats.get(oldName)!;
    this.chats.delete(oldName);
    chat.name = trimmedNew;
    this.chats.set(trimmedNew, chat);

    if (this.activeChatName === oldName) {
      this.activeChatName = trimmedNew;
    }
  }

  /**
   * Update working directory for a chat.
   */
  updateWorkingDir(name: string, newDir: string): void {
    const chat = this.chats.get(name);
    if (!chat) {
      throw new Error(`Chat "${name}" not found`);
    }
    chat.workingDir = newDir;
  }

  /**
   * Serialize to JSON for persistence.
   */
  toJSON(): string {
    const data = {
      chats: Array.from(this.chats.values()),
      activeChat: this.activeChatName,
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Restore from JSON.
   */
  static fromJSON(json: string): ChatManager {
    const data = JSON.parse(json);
    const manager = new ChatManager();

    for (const chatData of data.chats) {
      const chat: Chat = {
        name: chatData.name,
        workingDir: chatData.workingDir,
        sessionId: chatData.sessionId,
        createdAt: chatData.createdAt,
        lastActivity: chatData.lastActivity,
        isActive: false,
      };
      manager.chats.set(chat.name, chat);
    }

    if (data.activeChat && manager.chats.has(data.activeChat)) {
      manager.activeChatName = data.activeChat;
      manager.chats.get(data.activeChat)!.isActive = true;
    }

    return manager;
  }

  /**
   * Save to file.
   */
  async saveToFile(path: string): Promise<void> {
    await Bun.write(path, this.toJSON());
  }

  /**
   * Load from file. Returns empty manager if file doesn't exist.
   */
  static async loadFromFile(path: string): Promise<ChatManager> {
    try {
      const file = Bun.file(path);
      if (!(await file.exists())) {
        return new ChatManager();
      }
      const json = await file.text();
      return ChatManager.fromJSON(json);
    } catch {
      return new ChatManager();
    }
  }
}
