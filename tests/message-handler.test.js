import { describe, expect, test, vi } from 'vitest';
import { createMessageHandler } from '../src/message-handler.js';

function createSessionStore(initialThreadId = null) {
  let threadId = initialThreadId;
  return {
    getThreadId: vi.fn(async () => threadId),
    setThreadId: vi.fn(async (_userId, nextThreadId) => {
      threadId = nextThreadId;
    }),
    clearThreadId: vi.fn(async () => {
      threadId = null;
    }),
  };
}

function createLogger() {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('createMessageHandler', () => {
  test('reports status when a session is bound', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore('thread-1');
    const logger = createLogger();
    const handler = createMessageHandler({
      sessionStore,
      codexClient: { send: vi.fn() },
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({ userId: 'user-1', text: '/status' });

    expect(sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ msgType: 'interactive' }),
      undefined,
    );
  });

  test('clears the binding for /new', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore('thread-1');
    const logger = createLogger();
    const handler = createMessageHandler({
      sessionStore,
      codexClient: { send: vi.fn() },
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({ userId: 'user-1', text: '/new' });

    expect(sessionStore.clearThreadId).toHaveBeenCalledWith('user-1');
    expect(sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ msgType: 'interactive' }),
      undefined,
    );
  });

  test('starts a new codex session when no thread is bound', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-2',
        replyText: 'new reply',
      }),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({
      userId: 'user-1',
      text: 'hello',
      messageId: 'msg-1',
    });

    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ msgType: 'text' }),
      expect.objectContaining({ quoteMessageId: 'msg-1' }),
    );
    expect(codexClient.send).toHaveBeenCalledWith({ prompt: 'hello', threadId: null });
    expect(sessionStore.setThreadId).toHaveBeenCalledWith('user-1', 'thread-2');
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ msgType: 'post' }),
      expect.objectContaining({ quoteMessageId: 'msg-1' }),
    );
  });

  test('resumes the bound codex session for normal chat', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore('thread-9');
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-9',
        replyText: 'continued reply',
      }),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({
      userId: 'user-1',
      text: 'continue this task',
      messageId: 'msg-9',
    });

    expect(codexClient.send).toHaveBeenCalledWith({
      prompt: 'continue this task',
      threadId: 'thread-9',
    });
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ msgType: 'post' }),
      expect.objectContaining({ quoteMessageId: 'msg-9' }),
    );
  });

  test('clears the stored thread when a resumed call fails', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore('thread-bad');
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockRejectedValue(new Error('resume failed')),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({ userId: 'user-1', text: 'continue' });

    expect(sessionStore.clearThreadId).toHaveBeenCalledWith('user-1');
    expect(sendMessage).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ msgType: 'interactive' }),
      undefined,
    );
  });

  test('prompts for content when the incoming message is empty', async () => {
    const sendMessage = vi.fn();
    const logger = createLogger();
    const handler = createMessageHandler({
      sessionStore: createSessionStore(null),
      codexClient: { send: vi.fn() },
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({ userId: 'user-1', text: '   ' });

    expect(sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ msgType: 'interactive' }),
      undefined,
    );
  });

  test('does not clear the stored thread when only the final Feishu send fails', async () => {
    const sessionStore = createSessionStore('thread-9');
    const logger = createLogger();
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('send failed'));
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-9',
        replyText: 'continued reply',
      }),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({ userId: 'user-1', text: 'continue this task' });

    expect(sessionStore.clearThreadId).not.toHaveBeenCalled();
  });

  test('falls back to plain text when the rich final reply fails to send', async () => {
    const sessionStore = createSessionStore('thread-9');
    const logger = createLogger();
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rich send failed'))
      .mockResolvedValueOnce(undefined);
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-9',
        replyText: 'continued reply',
      }),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      logger,
    });

    await handler.handlePrivateText({
      userId: 'user-1',
      text: 'continue this task',
      messageId: 'msg-9',
    });

    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ msgType: 'post' }),
      expect.objectContaining({ quoteMessageId: 'msg-9' }),
    );
    expect(sendMessage).toHaveBeenNthCalledWith(
      3,
      'user-1',
      'continued reply',
      expect.objectContaining({ quoteMessageId: 'msg-9' }),
    );
    expect(logger.error).toHaveBeenCalled();
  });

  test('packages attachment paths into the Codex prompt', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-2',
        replyText: 'done',
      }),
    };
    const mediaTransport = {
      downloadImage: vi.fn().mockResolvedValue({
        buffer: Buffer.from('img'),
        mimeType: 'image/png',
      }),
      downloadFile: vi.fn().mockResolvedValue({
        buffer: Buffer.from('{"ok":true}'),
        mimeType: 'application/json',
      }),
    };
    const mediaStore = {
      stageInbound: vi
        .fn()
        .mockResolvedValueOnce({
          path: 'D:\\temp\\one.png',
          filename: 'one.png',
          kind: 'image',
          mimeType: 'image/png',
        })
        .mockResolvedValueOnce({
          path: 'D:\\temp\\two.json',
          filename: 'two.json',
          kind: 'file',
          mimeType: 'application/json',
        }),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      mediaTransport,
      mediaStore,
      logger,
    });

    await handler.handlePrivateMessage({
      userId: 'user-1',
      messageId: 'msg-1',
      text: '看看这两个附件',
      attachments: [
        { kind: 'image', platformRef: 'img-1', sourceMessageType: 'image', messageId: 'msg-1', filename: null },
        { kind: 'file', platformRef: 'file-1', sourceMessageType: 'file', messageId: 'msg-1', filename: 'two.json' },
      ],
    });

    expect(codexClient.send).toHaveBeenCalledWith({
      prompt: expect.stringContaining('D:\\temp\\one.png'),
      threadId: null,
    });
    expect(codexClient.send.mock.calls[0][0].prompt).toContain('D:\\temp\\two.json');
  });

  test('rejects unsupported inbound file types without calling Codex', async () => {
    const sendMessage = vi.fn();
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn(),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      mediaTransport: {},
      mediaStore: {},
      logger,
    });

    await handler.handlePrivateMessage({
      userId: 'user-1',
      text: '',
      attachments: [
        {
          kind: 'file',
          platformRef: 'file-1',
          filename: 'sheet.xlsx',
          sourceMessageType: 'file',
          messageId: 'msg-file-1',
        },
      ],
    });

    expect(codexClient.send).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ msgType: expect.any(String) }),
      undefined,
    );
  });

  test('uploads and sends an image when Codex returns an OUTPUT_IMAGE directive', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-1',
        replyText: '已生成。\nOUTPUT_IMAGE: C:\\Work\\codex\\out\\chart.png',
      }),
    };
    const mediaTransport = {
      sendImageFromPath: vi.fn().mockResolvedValue(undefined),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      mediaTransport,
      mediaStore: {},
      logger,
    });

    await handler.handlePrivateMessage({
      userId: 'user-1',
      text: '画张图',
      attachments: [],
    });

    expect(mediaTransport.sendImageFromPath).toHaveBeenCalledWith(
      'user-1',
      'C:\\Work\\codex\\out\\chart.png',
      expect.any(Object),
    );
  });

  test('uploads and sends a file when Codex returns an OUTPUT_FILE directive', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-1',
        replyText: '已整理。\nOUTPUT_FILE: C:\\Work\\codex\\out\\summary.pdf',
      }),
    };
    const mediaTransport = {
      sendFileFromPath: vi.fn().mockResolvedValue(undefined),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      mediaTransport,
      mediaStore: {},
      logger,
    });

    await handler.handlePrivateMessage({
      userId: 'user-1',
      text: '导出成 PDF',
      attachments: [],
    });

    expect(mediaTransport.sendFileFromPath).toHaveBeenCalledWith(
      'user-1',
      'C:\\Work\\codex\\out\\summary.pdf',
      expect.any(Object),
    );
  });

  test('sends an error reply when generated file delivery fails', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockResolvedValue({
        threadId: 'thread-1',
        replyText: 'ready\nOUTPUT_FILE: C:\\Work\\codex\\out\\missing.pdf',
      }),
    };
    const mediaTransport = {
      sendFileFromPath: vi.fn().mockRejectedValue(new Error('ENOENT')),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      mediaTransport,
      mediaStore: {},
      logger,
    });

    await handler.handlePrivateMessage({
      userId: 'user-1',
      text: 'export this',
      attachments: [],
    });

    expect(mediaTransport.sendFileFromPath).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenLastCalledWith(
      'user-1',
      expect.objectContaining({ msgType: 'interactive' }),
      undefined,
    );
    expect(logger.error).toHaveBeenCalled();
  });

  test('creates, updates, and completes a single task status message when update support is available', async () => {
    vi.useFakeTimers();

    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({ messageId: 'status-msg-1' })
      .mockResolvedValueOnce(undefined);
    const updateMessage = vi.fn().mockResolvedValue(undefined);
    const sessionStore = createSessionStore(null);
    const logger = createLogger();
    const codexClient = {
      send: vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                threadId: 'thread-1',
                replyText: 'final reply',
              });
            }, 5000);
          }),
      ),
    };
    const handler = createMessageHandler({
      sessionStore,
      codexClient,
      sendMessage,
      updateMessage,
      logger,
    });

    const work = handler.handlePrivateMessage({
      userId: 'user-1',
      text: 'long task',
      attachments: [],
    });

    await vi.advanceTimersByTimeAsync(6000);
    await work;

    expect(sendMessage).toHaveBeenNthCalledWith(
      1,
      'user-1',
      expect.objectContaining({ msgType: 'post' }),
      undefined,
    );
    expect(updateMessage).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenNthCalledWith(
      2,
      'user-1',
      expect.objectContaining({ msgType: 'post' }),
      undefined,
    );
    expect(updateMessage).toHaveBeenLastCalledWith(
      'status-msg-1',
      expect.objectContaining({ msgType: 'post' }),
    );

    vi.useRealTimers();
  });
});



