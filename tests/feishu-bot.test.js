import { Readable } from 'node:stream';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const createMock = vi.fn();
const replyMock = vi.fn();
const replyByCardMock = vi.fn();
const updateMock = vi.fn();
const imageCreateMock = vi.fn();
const fileCreateMock = vi.fn();
const imageGetMock = vi.fn();
const messageResourceGetMock = vi.fn();
const startMock = vi.fn();
const closeMock = vi.fn();

vi.mock('@larksuiteoapi/node-sdk', () => {
  class Client {
    constructor() {
      this.im = {
        v1: {
          image: {
            create: imageCreateMock,
            get: imageGetMock,
          },
          file: {
            create: fileCreateMock,
          },
          messageResource: {
            get: messageResourceGetMock,
          },
          message: {
            create: createMock,
            reply: replyMock,
            replyByCard: replyByCardMock,
            update: updateMock,
          },
        },
      };
    }
  }

  class WSClient {
    start(...args) {
      return startMock(...args);
    }

    close(...args) {
      return closeMock(...args);
    }
  }

  class EventDispatcher {
    register() {
      return this;
    }
  }

  return {
    AppType: { SelfBuild: 'self-built' },
    Domain: { Feishu: 'feishu' },
    LoggerLevel: { info: 'info' },
    Client,
    WSClient,
    EventDispatcher,
  };
});

describe('createFeishuBot', () => {
  beforeEach(() => {
    createMock.mockReset();
    replyMock.mockReset();
    replyByCardMock.mockReset();
    updateMock.mockReset();
    imageCreateMock.mockReset();
    fileCreateMock.mockReset();
    imageGetMock.mockReset();
    messageResourceGetMock.mockReset();
    startMock.mockReset();
    closeMock.mockReset();
  });

  test('uses message reply for quoted text sends', async () => {
    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.sendMessage('open-id', {
      msgType: 'text',
      content: JSON.stringify({ text: 'typing...' }),
    }, { quoteMessageId: 'msg-1' });

    expect(replyMock).toHaveBeenCalledWith({
      path: { message_id: 'msg-1' },
      data: {
        content: JSON.stringify({ text: 'typing...' }),
        msg_type: 'text',
        reply_in_thread: false,
      },
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('uses card reply for quoted interactive sends', async () => {
    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.sendMessage('open-id', {
      msgType: 'interactive',
      content: JSON.stringify({ elements: [] }),
    }, { quoteMessageId: 'msg-2' });

    expect(replyByCardMock).toHaveBeenCalledWith({
      path: { message_id: 'msg-2' },
      data: {
        content: JSON.stringify({ elements: [] }),
        reply_in_thread: false,
      },
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('uploads an image and sends it as an image message', async () => {
    imageCreateMock.mockResolvedValue({
      data: {
        image_key: 'img-key-1',
      },
    });

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.sendImage('open-id', Buffer.from('img'), { filename: 'shot.png' });

    expect(imageCreateMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: 'open-id',
        msg_type: 'image',
        content: JSON.stringify({ image_key: 'img-key-1' }),
      },
    });
  });

  test('uploads a file and sends it as a file message', async () => {
    fileCreateMock.mockResolvedValue({
      data: {
        file_key: 'file-key-1',
      },
    });

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.sendFile('open-id', Buffer.from('pdf'), {
      filename: 'report.pdf',
      mimeType: 'application/pdf',
    });

    expect(fileCreateMock).toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledWith({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: 'open-id',
        msg_type: 'file',
        content: JSON.stringify({ file_key: 'file-key-1' }),
      },
    });
  });

  test('normalizes an inbound image event into an attachment payload', async () => {
    const onPrivateMessage = vi.fn();

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.__testHandleIncoming(
      {
        sender: { sender_id: { open_id: 'open-id' } },
        message: {
          chat_type: 'p2p',
          message_id: 'msg-img-1',
          message_type: 'image',
          content: JSON.stringify({ image_key: 'img-key-1' }),
        },
      },
      { onPrivateMessage },
    );

    expect(onPrivateMessage).toHaveBeenCalledWith({
      userId: 'open-id',
      messageId: 'msg-img-1',
      text: '',
      attachments: [
        {
          kind: 'image',
          platformRef: 'img-key-1',
          sourceMessageType: 'image',
          messageId: 'msg-img-1',
          filename: null,
        },
      ],
    });
  });

  test('normalizes an inbound file event into an attachment payload', async () => {
    const onPrivateMessage = vi.fn();

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.__testHandleIncoming(
      {
        sender: { sender_id: { open_id: 'open-id' } },
        message: {
          chat_type: 'p2p',
          message_id: 'msg-file-1',
          message_type: 'file',
          content: JSON.stringify({ file_key: 'file-key-1', file_name: 'report.pdf' }),
        },
      },
      { onPrivateMessage },
    );

    expect(onPrivateMessage).toHaveBeenCalledWith({
      userId: 'open-id',
      messageId: 'msg-file-1',
      text: '',
      attachments: [
        {
          kind: 'file',
          platformRef: 'file-key-1',
          sourceMessageType: 'file',
          messageId: 'msg-file-1',
          filename: 'report.pdf',
        },
      ],
    });
  });

  test('downloads an inbound image through message resources instead of image.get', async () => {
    messageResourceGetMock.mockResolvedValue({
      getReadableStream: () => Readable.from([Buffer.from('img-bytes')]),
      headers: { 'content-type': 'image/jpeg' },
    });

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    const result = await bot.downloadImage({
      kind: 'image',
      platformRef: 'img-key-1',
      sourceMessageType: 'image',
      messageId: 'msg-img-1',
      filename: null,
    });

    expect(messageResourceGetMock).toHaveBeenCalledWith({
      path: {
        message_id: 'msg-img-1',
        file_key: 'img-key-1',
      },
      params: {
        type: 'image',
      },
    });
    expect(imageGetMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      buffer: Buffer.from('img-bytes'),
      mimeType: 'image/jpeg',
    });
  });

  test('downloads an inbound file through the message resource readable stream', async () => {
    messageResourceGetMock.mockResolvedValue({
      getReadableStream: () => Readable.from([Buffer.from('{"ok":true}')]),
      headers: { 'content-type': 'application/json' },
    });

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    const result = await bot.downloadFile({
      kind: 'file',
      platformRef: 'file-key-1',
      sourceMessageType: 'file',
      messageId: 'msg-file-1',
      filename: 'report.json',
    });

    expect(messageResourceGetMock).toHaveBeenCalledWith({
      path: {
        message_id: 'msg-file-1',
        file_key: 'file-key-1',
      },
      params: {
        type: 'file',
      },
    });
    expect(result).toEqual({
      buffer: Buffer.from('{"ok":true}'),
      mimeType: 'application/json',
    });
  });

  test('ignores duplicate inbound private messages with the same message id', async () => {
    const onPrivateMessage = vi.fn();

    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      dedupeTtlMs: 300000,
      now: () => 1234567890,
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    const payload = {
      sender: { sender_id: { open_id: 'open-id' } },
      message: {
        chat_type: 'p2p',
        message_id: 'msg-dup-1',
        message_type: 'text',
        content: JSON.stringify({ text: 'hello' }),
      },
    };

    await bot.__testHandleIncoming(payload, { onPrivateMessage });
    await bot.__testHandleIncoming(payload, { onPrivateMessage });

    expect(onPrivateMessage).toHaveBeenCalledTimes(1);
    expect(onPrivateMessage).toHaveBeenCalledWith({
      userId: 'open-id',
      messageId: 'msg-dup-1',
      text: 'hello',
      attachments: [],
    });
  });

  test('falls back to an unquoted direct send when the reply target was withdrawn', async () => {
    replyMock.mockRejectedValue({
      response: {
        data: {
          code: 230011,
        },
      },
    });

    const logger = { warn: vi.fn(), log: vi.fn(), error: vi.fn() };
    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger,
    });

    await bot.sendMessage(
      'open-id',
      {
        msgType: 'text',
        content: JSON.stringify({ text: 'final reply' }),
        fallbackText: 'final reply',
      },
      { quoteMessageId: 'msg-withdrawn' },
    );

    expect(replyMock).toHaveBeenCalledTimes(1);
    expect(createMock).toHaveBeenCalledWith({
      params: { receive_id_type: 'open_id' },
      data: {
        receive_id: 'open-id',
        msg_type: 'text',
        content: JSON.stringify({ text: 'final reply' }),
      },
    });
    expect(logger.warn).toHaveBeenCalled();
  });

  test('updates a previously sent rich-text status message in place', async () => {
    const { createFeishuBot } = await import('../src/feishu-bot.js');
    const bot = createFeishuBot({
      appId: 'app-id',
      appSecret: 'app-secret',
      logger: { warn: vi.fn(), log: vi.fn(), error: vi.fn() },
    });

    await bot.updateMessage('status-msg-1', {
      msgType: 'post',
      content: JSON.stringify({
        zh_cn: {
          content: [[{ tag: 'md', text: 'processing' }]],
        },
      }),
    });

    expect(updateMock).toHaveBeenCalledWith({
      path: { message_id: 'status-msg-1' },
      data: {
        msg_type: 'post',
        content: JSON.stringify({
          zh_cn: {
            content: [[{ tag: 'md', text: 'processing' }]],
          },
        }),
      },
    });
  });
});
