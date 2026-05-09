/**
 * TDD tests for Multi-Chat feature.
 *
 * Multi-chat allows managing multiple independent Claude sessions
 * from Telegram, each with its own context and working directory.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { ChatManager, type Chat } from "../../src/multi-chat";

describe("ChatManager", () => {
  let manager: ChatManager;

  beforeEach(() => {
    manager = new ChatManager();
  });

  // ============== Creation ==============

  describe("create", () => {
    test("creates a new chat with name", () => {
      const chat = manager.create("bot", "/home/user/bot");
      expect(chat.name).toBe("bot");
      expect(chat.workingDir).toBe("/home/user/bot");
      expect(chat.sessionId).toBeNull();
    });

    test("sets first created chat as active", () => {
      manager.create("bot", "/home/user/bot");
      expect(manager.active()?.name).toBe("bot");
    });

    test("rejects duplicate names", () => {
      manager.create("bot", "/home/user/bot");
      expect(() => manager.create("bot", "/other")).toThrow("already exists");
    });

    test("creates chat with default working dir", () => {
      const chat = manager.create("general");
      expect(chat.name).toBe("general");
      expect(chat.workingDir).toBeDefined();
    });

    test("second chat does NOT become active automatically", () => {
      manager.create("first", "/first");
      manager.create("second", "/second");
      expect(manager.active()?.name).toBe("first");
    });

    test("name is trimmed", () => {
      const chat = manager.create("  spaced  ", "/dir");
      expect(chat.name).toBe("spaced");
    });

    test("rejects empty name", () => {
      expect(() => manager.create("")).toThrow();
      expect(() => manager.create("  ")).toThrow();
    });

    test("has createdAt timestamp", () => {
      const before = new Date().toISOString();
      const chat = manager.create("test", "/dir");
      const after = new Date().toISOString();
      expect(chat.createdAt >= before).toBe(true);
      expect(chat.createdAt <= after).toBe(true);
    });

    test("supports max chats limit", () => {
      for (let i = 0; i < 10; i++) {
        manager.create(`chat-${i}`, `/dir/${i}`);
      }
      // 11th should fail or warn (configurable limit)
      expect(() => manager.create("chat-10", "/dir/10")).toThrow("maximum");
    });
  });

  // ============== Listing ==============

  describe("list", () => {
    test("returns empty array initially", () => {
      expect(manager.list()).toEqual([]);
    });

    test("returns all chats", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      const names = manager.list().map((c) => c.name);
      expect(names).toContain("bot");
      expect(names).toContain("pokemon");
    });

    test("marks active chat", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.switchTo("pokemon");
      const active = manager.list().find((c) => c.isActive);
      expect(active?.name).toBe("pokemon");
    });

    test("only one chat is marked active", () => {
      manager.create("a", "/a");
      manager.create("b", "/b");
      manager.create("c", "/c");
      const activeCount = manager.list().filter((c) => c.isActive).length;
      expect(activeCount).toBe(1);
    });

    test("list is ordered by creation time", () => {
      manager.create("first", "/first");
      manager.create("second", "/second");
      manager.create("third", "/third");
      const names = manager.list().map((c) => c.name);
      expect(names).toEqual(["first", "second", "third"]);
    });
  });

  // ============== Switching ==============

  describe("switchTo", () => {
    test("switches active chat", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.switchTo("pokemon");
      expect(manager.active()?.name).toBe("pokemon");
    });

    test("throws on non-existent chat", () => {
      expect(() => manager.switchTo("nope")).toThrow("not found");
    });

    test("preserves session state after switch", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.active()!.sessionId = "session-123";
      manager.switchTo("pokemon");
      manager.switchTo("bot");
      expect(manager.active()?.sessionId).toBe("session-123");
    });

    test("switching to already active chat is a no-op", () => {
      manager.create("bot", "/bot");
      manager.switchTo("bot");
      expect(manager.active()?.name).toBe("bot");
    });

    test("updates lastActivity on switch", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.switchTo("pokemon");
      expect(manager.active()?.lastActivity).toBeDefined();
    });
  });

  // ============== Deletion ==============

  describe("delete", () => {
    test("deletes a chat by name", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.delete("pokemon");
      expect(manager.list().length).toBe(1);
    });

    test("cannot delete active chat", () => {
      manager.create("bot", "/bot");
      expect(() => manager.delete("bot")).toThrow("Cannot delete active");
    });

    test("throws on non-existent chat", () => {
      expect(() => manager.delete("nope")).toThrow("not found");
    });

    test("can delete after switching away", () => {
      manager.create("a", "/a");
      manager.create("b", "/b");
      manager.switchTo("b");
      manager.delete("a"); // now safe
      expect(manager.list().length).toBe(1);
    });
  });

  // ============== Renaming ==============

  describe("rename", () => {
    test("renames a chat", () => {
      manager.create("old-name", "/dir");
      manager.rename("old-name", "new-name");
      expect(manager.list().map((c) => c.name)).toContain("new-name");
      expect(manager.list().map((c) => c.name)).not.toContain("old-name");
    });

    test("preserves session on rename", () => {
      manager.create("test", "/dir");
      manager.active()!.sessionId = "abc";
      manager.rename("test", "renamed");
      expect(manager.active()!.sessionId).toBe("abc");
    });

    test("rejects rename to existing name", () => {
      manager.create("a", "/a");
      manager.create("b", "/b");
      expect(() => manager.rename("a", "b")).toThrow("already exists");
    });

    test("active chat name is updated", () => {
      manager.create("old", "/dir");
      manager.rename("old", "new");
      expect(manager.active()?.name).toBe("new");
    });
  });

  // ============== Active Chat ==============

  describe("active", () => {
    test("returns null when no chats", () => {
      expect(manager.active()).toBeNull();
    });

    test("returns the current active chat", () => {
      manager.create("bot", "/bot");
      expect(manager.active()?.name).toBe("bot");
    });
  });

  // ============== Get by name ==============

  describe("get", () => {
    test("returns chat by name", () => {
      manager.create("bot", "/bot");
      expect(manager.get("bot")?.name).toBe("bot");
    });

    test("returns null for unknown name", () => {
      expect(manager.get("nope")).toBeNull();
    });
  });

  // ============== Persistence ==============

  describe("persistence", () => {
    test("serializes to JSON", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      const json = manager.toJSON();
      expect(typeof json).toBe("string");
      const parsed = JSON.parse(json);
      expect(parsed.chats).toHaveLength(2);
      expect(parsed.activeChat).toBe("bot");
    });

    test("restores from JSON", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");
      manager.switchTo("pokemon");
      const json = manager.toJSON();

      const restored = ChatManager.fromJSON(json);
      expect(restored.list().length).toBe(2);
      expect(restored.active()?.name).toBe("pokemon");
    });

    test("preserves session IDs across serialization", () => {
      manager.create("bot", "/bot");
      manager.active()!.sessionId = "sess-123";
      const json = manager.toJSON();

      const restored = ChatManager.fromJSON(json);
      expect(restored.active()!.sessionId).toBe("sess-123");
    });

    test("handles empty JSON gracefully", () => {
      const restored = ChatManager.fromJSON('{"chats":[],"activeChat":null}');
      expect(restored.list()).toEqual([]);
      expect(restored.active()).toBeNull();
    });

    test("handles corrupted JSON", () => {
      expect(() => ChatManager.fromJSON("not json")).toThrow();
    });

    test("saves and loads from file", async () => {
      manager.create("test", "/test");
      manager.active()!.sessionId = "sess-file";

      const tmpFile = `/tmp/test-chatmanager-${Date.now()}.json`;
      await manager.saveToFile(tmpFile);

      const restored = await ChatManager.loadFromFile(tmpFile);
      expect(restored.active()?.name).toBe("test");
      expect(restored.active()?.sessionId).toBe("sess-file");

      // Cleanup
      try { require("fs").unlinkSync(tmpFile); } catch {}
    });

    test("loadFromFile returns empty manager for missing file", async () => {
      const restored = await ChatManager.loadFromFile("/tmp/nonexistent-xyz.json");
      expect(restored.list()).toEqual([]);
    });
  });

  // ============== Session Integration ==============

  describe("session integration", () => {
    test("each chat has independent session state", () => {
      manager.create("bot", "/bot");
      manager.create("pokemon", "/pokemon");

      manager.active()!.sessionId = "session-bot";
      manager.switchTo("pokemon");
      manager.active()!.sessionId = "session-pokemon";

      manager.switchTo("bot");
      expect(manager.active()!.sessionId).toBe("session-bot");

      manager.switchTo("pokemon");
      expect(manager.active()!.sessionId).toBe("session-pokemon");
    });

    test("new chat starts with no session", () => {
      manager.create("fresh");
      expect(manager.active()!.sessionId).toBeNull();
    });

    test("clearing session on one chat doesn't affect others", () => {
      manager.create("a", "/a");
      manager.create("b", "/b");

      manager.active()!.sessionId = "sess-a";
      manager.switchTo("b");
      manager.active()!.sessionId = "sess-b";

      // Clear session on b
      manager.active()!.sessionId = null;

      manager.switchTo("a");
      expect(manager.active()!.sessionId).toBe("sess-a");
    });
  });

  // ============== Working Directory ==============

  describe("working directory", () => {
    test("updateWorkingDir changes the directory", () => {
      manager.create("test", "/old");
      manager.updateWorkingDir("test", "/new");
      expect(manager.active()!.workingDir).toBe("/new");
    });

    test("rejects unknown chat name", () => {
      expect(() => manager.updateWorkingDir("nope", "/new")).toThrow("not found");
    });
  });
});
