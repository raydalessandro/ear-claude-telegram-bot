/**
 * Global chat manager state.
 * Singleton used by handlers to manage multi-chat.
 */

import { ChatManager } from "./multi-chat";

// Global chat manager instance — mutable for reset in tests
export let chatManager = new ChatManager();

/** Reset global chat manager — for testing only. */
export function _resetChatManager(): void {
  chatManager = new ChatManager();
}
