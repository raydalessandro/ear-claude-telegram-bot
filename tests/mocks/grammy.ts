/**
 * Mock grammY Context and Bot for testing.
 * Simulates Telegram API without network calls.
 */

export interface MockMessage {
  message_id: number;
  chat: { id: number; type: string };
  from: { id: number; username: string; is_bot: boolean };
  date: number;
  text?: string;
}

export interface SentMessage {
  chatId: number;
  text: string;
  options?: Record<string, unknown>;
}

export interface EditedMessage {
  chatId: number;
  messageId: number;
  text: string;
  options?: Record<string, unknown>;
}

/**
 * Creates a mock grammY Context for testing handlers.
 */
export function createMockContext(overrides: {
  userId?: number;
  username?: string;
  chatId?: number;
  text?: string;
  voice?: { file_id: string; duration: number };
  photo?: Array<{ file_id: string; width: number; height: number }>;
  document?: { file_id: string; file_name: string; mime_type: string };
  callbackData?: string;
} = {}) {
  const userId = overrides.userId ?? 123456;
  const username = overrides.username ?? "testuser";
  const chatId = overrides.chatId ?? 789;

  const sent: SentMessage[] = [];
  const edited: EditedMessage[] = [];
  const actions: string[] = [];
  let messageIdCounter = 100;

  const message: MockMessage = {
    message_id: 1,
    chat: { id: chatId, type: "private" },
    from: { id: userId, username, is_bot: false },
    date: Math.floor(Date.now() / 1000),
  };

  if (overrides.text) {
    (message as any).text = overrides.text;
  }

  const ctx: any = {
    from: { id: userId, username, is_bot: false },
    chat: { id: chatId, type: "private" },
    message: {
      ...message,
      voice: overrides.voice,
      photo: overrides.photo,
      document: overrides.document,
    },
    callbackQuery: overrides.callbackData
      ? { data: overrides.callbackData, message }
      : undefined,

    // Mock reply
    reply: async (text: string, options?: Record<string, unknown>) => {
      const msgId = ++messageIdCounter;
      sent.push({ chatId, text, options });
      return { message_id: msgId, chat: { id: chatId } };
    },

    // Mock replyWithChatAction
    replyWithChatAction: async (action: string) => {
      actions.push(action);
    },

    // Mock getFile (for voice/photo/document downloads)
    getFile: async () => ({
      file_id: "test_file_id",
      file_path: "voice/test.ogg",
    }),

    // Mock answerCallbackQuery
    answerCallbackQuery: async (text?: string) => {
      sent.push({ chatId, text: text || "[callback answered]" });
    },

    // Mock API
    api: {
      token: "test-token",
      editMessageText: async (
        chatId: number,
        messageId: number,
        text: string,
        options?: Record<string, unknown>
      ) => {
        edited.push({ chatId, messageId, text, options });
      },
      deleteMessage: async (_chatId: number, _messageId: number) => {
        // no-op in mock
      },
      raw: {
        deleteWebhook: async () => true,
      },
      getMe: async () => ({
        id: 1,
        is_bot: true,
        username: "test_bot",
        first_name: "Test",
      }),
    },

    // Test helpers
    _sent: sent,
    _edited: edited,
    _actions: actions,
  };

  return ctx;
}

/**
 * Creates a mock session for testing without real Claude API calls.
 */
export function createMockSession(overrides: {
  isActive?: boolean;
  isRunning?: boolean;
  sessionId?: string;
  lastMessage?: string;
} = {}) {
  return {
    sessionId: overrides.sessionId ?? null,
    isActive: overrides.isActive ?? false,
    isRunning: overrides.isRunning ?? false,
    lastActivity: null as Date | null,
    queryStarted: null as Date | null,
    currentTool: null as string | null,
    lastTool: null as string | null,
    lastError: null as string | null,
    lastErrorTime: null as Date | null,
    lastUsage: null,
    lastMessage: overrides.lastMessage ?? null,
    conversationTitle: null as string | null,

    startProcessing: () => () => {},
    stop: async () => false as "stopped" | "pending" | false,
    kill: async () => {},
    consumeInterruptFlag: () => false,
    markInterrupt: () => {},
    clearStopRequested: () => {},
    saveSession: () => {},
    getSessionList: () => [],
    resumeSession: (_id: string) => [false, "Mock"] as [boolean, string],
    resumeLast: () => [false, "Mock"] as [boolean, string],

    sendMessageStreaming: async (
      _msg: string,
      _user: string,
      _uid: number,
      cb: Function,
    ) => {
      await cb("text", "Mock response", 0);
      await cb("segment_end", "Mock response", 0);
      await cb("done", "");
      return "Mock response";
    },
  };
}
