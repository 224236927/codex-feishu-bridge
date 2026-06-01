import * as Lark from '@larksuiteoapi/node-sdk';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_MESSAGE_DEDUP_TTL_MS = 300000;
const WITHDRAWN_REPLY_ERROR_CODES = new Set([230011, 231003]);

export function createFeishuBot({
  appId,
  appSecret,
  logger = console,
  dedupeTtlMs = DEFAULT_MESSAGE_DEDUP_TTL_MS,
  now = () => Date.now(),
}) {
  const baseConfig = {
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: Lark.Domain.Feishu,
  };

  const client = new Lark.Client(baseConfig);
  const wsClient = new Lark.WSClient({
    ...baseConfig,
    loggerLevel: Lark.LoggerLevel.info,
  });
  const recentMessageIds = new Map();

  return {
    async sendText(openId, text, options) {
      return sendRawMessage(openId, {
        msgType: 'text',
        content: JSON.stringify({ text }),
        quoteMessageId: options?.quoteMessageId,
      });
    },

    async sendMessage(openId, message, options = {}) {
      const normalized = normalizeOutgoingMessage(message);
      const withOptions = withQuote(normalized, options.quoteMessageId);

      try {
        return await sendRawMessage(openId, withOptions);
      } catch (error) {
        if (options.quoteMessageId && isWithdrawnReplyError(error)) {
          logger.warn?.('Reply target was withdrawn, retrying with a direct send.', {
            openId,
            quoteMessageId: options.quoteMessageId,
            error,
          });

          try {
            return await sendRawMessage(openId, normalized);
          } catch (retryError) {
            error = retryError;
          }
        }

        if (normalized.msgType === 'interactive' && normalized.fallbackText) {
          logger.warn?.('Failed to send interactive Feishu card, falling back to text.', {
            openId,
            error,
          });

          return sendFallbackText(openId, normalized.fallbackText, {
            quoteMessageId:
              options.quoteMessageId && !isWithdrawnReplyError(error)
                ? options.quoteMessageId
                : undefined,
          });
        }

        throw error;
      }
    },

    async sendImage(openId, imageBuffer, options = {}) {
      const upload = await client.im.v1.image.create({
        data: {
          image_type: 'message',
          image: imageBuffer,
        },
      });

      return sendRawMessage(openId, {
        msgType: 'image',
        content: JSON.stringify({ image_key: upload?.data?.image_key }),
        quoteMessageId: options.quoteMessageId,
      });
    },

    async sendFile(openId, fileBuffer, metadata = {}, options = {}) {
      const upload = await client.im.v1.file.create({
        data: {
          file_name: metadata.filename || 'attachment.bin',
          file_type: resolveFeishuFileType(metadata),
          file: fileBuffer,
        },
      });

      return sendRawMessage(openId, {
        msgType: 'file',
        content: JSON.stringify({ file_key: upload?.data?.file_key }),
        quoteMessageId: options.quoteMessageId,
      });
    },

    async sendImageFromPath(openId, filePath, options = {}) {
      const imageBuffer = await readFile(filePath);
      await this.sendImage(openId, imageBuffer, {
        ...options,
        filename: path.basename(filePath),
      });
    },

    async sendFileFromPath(openId, filePath, options = {}) {
      const fileBuffer = await readFile(filePath);
      await this.sendFile(openId, fileBuffer, {
        ...options,
        filename: options.filename || path.basename(filePath),
        mimeType: options.mimeType || guessMimeFromName(filePath),
      });
    },

    async downloadImage(attachment) {
      const response = await client.im.v1.messageResource.get({
        path: {
          message_id: attachment.messageId,
          file_key: attachment.platformRef,
        },
        params: {
          type: 'image',
        },
      });

      return {
        buffer: await streamToBuffer(response),
        mimeType: response?.headers?.['content-type'] || 'image/png',
      };
    },

    async downloadFile(attachment) {
      const response = await client.im.v1.messageResource.get({
        path: {
          message_id: attachment.messageId,
          file_key: attachment.platformRef,
        },
        params: {
          type: attachment.kind === 'image' ? 'image' : 'file',
        },
      });

      return {
        buffer: await streamToBuffer(response),
        mimeType: response?.headers?.['content-type'] || guessMimeFromName(attachment.filename),
      };
    },

    async updateMessage(messageId, message) {
      const normalized = normalizeOutgoingMessage(message);

      await client.im.v1.message.update({
        path: {
          message_id: messageId,
        },
        data: {
          msg_type: normalized.msgType,
          content: normalized.content,
        },
      });
    },

    async start({ onPrivateText, onPrivateMessage }) {
      const eventDispatcher = new Lark.EventDispatcher({}).register({
        'im.message.receive_v1': (data) => {
          void handleIncomingMessage({
            data,
            onPrivateText,
            onPrivateMessage,
            logger,
            shouldSkipDuplicateMessage,
          });
        },
      });

      await wsClient.start({ eventDispatcher });
      logger.log?.('Feishu long connection started.');
    },

    stop() {
      wsClient.close();
    },

    async __testHandleIncoming(payload, { onPrivateText, onPrivateMessage } = {}) {
      await handleIncomingMessage({
        data: payload,
        onPrivateText,
        onPrivateMessage,
        logger,
        shouldSkipDuplicateMessage,
      });
    },
  };

  async function sendFallbackText(openId, fallbackText, options = {}) {
    return sendRawMessage(openId, {
      msgType: 'text',
      content: JSON.stringify({ text: fallbackText }),
      quoteMessageId: options.quoteMessageId,
    });
  }

  async function sendRawMessage(openId, { msgType, content, quoteMessageId }) {
    if (quoteMessageId) {
      if (msgType === 'interactive') {
        const response = await client.im.v1.message.replyByCard({
          path: {
            message_id: quoteMessageId,
          },
          data: {
            content,
            reply_in_thread: false,
          },
        });
        return normalizeSendResult(response);
      }

      const response = await client.im.v1.message.reply({
        path: {
          message_id: quoteMessageId,
        },
        data: {
          content,
          msg_type: msgType,
          reply_in_thread: false,
        },
      });
      return normalizeSendResult(response);
    }

    const response = await client.im.v1.message.create({
      params: {
        receive_id_type: 'open_id',
      },
      data: {
        receive_id: openId,
        msg_type: msgType,
        content,
      },
    });

    return normalizeSendResult(response);
  }

  function withQuote(message, quoteMessageId) {
    return {
      ...message,
      quoteMessageId,
    };
  }

  function shouldSkipDuplicateMessage(messageId) {
    if (!messageId) {
      return false;
    }

    const currentTime = now();
    for (const [seenMessageId, expiresAt] of recentMessageIds.entries()) {
      if (expiresAt <= currentTime) {
        recentMessageIds.delete(seenMessageId);
      }
    }

    if (recentMessageIds.has(messageId)) {
      return true;
    }

    recentMessageIds.set(messageId, currentTime + dedupeTtlMs);
    return false;
  }
}

async function handleIncomingMessage({
  data,
  onPrivateText,
  onPrivateMessage,
  logger,
  shouldSkipDuplicateMessage = () => false,
}) {
  try {
    const openId = data?.sender?.sender_id?.open_id;
    const message = data?.message;

    if (!openId || !message) {
      return;
    }

    if (message.chat_type !== 'p2p') {
      return;
    }

    if (shouldSkipDuplicateMessage(message.message_id)) {
      logger.log?.('Ignoring duplicate private message.', {
        openId,
        messageId: message.message_id,
      });
      return;
    }

    const normalized = normalizeIncomingMessage(message);
    if (!normalized) {
      logger.log?.('Ignoring unsupported private message.', {
        openId,
        messageType: message.message_type,
      });
      return;
    }

    const payload = {
      userId: openId,
      messageId: message.message_id,
      text: normalized.text,
      attachments: normalized.attachments,
    };

    if (typeof onPrivateMessage === 'function') {
      await onPrivateMessage(payload);
      return;
    }

    if (typeof onPrivateText === 'function') {
      await onPrivateText({
        userId: openId,
        text: normalized.text,
        messageId: message.message_id,
      });
    }
  } catch (error) {
    logger.error?.('Unhandled Feishu event processing failure.', error);
  }
}

function isWithdrawnReplyError(error) {
  const directCode = Number(error?.code);
  if (WITHDRAWN_REPLY_ERROR_CODES.has(directCode)) {
    return true;
  }

  const responseCode = Number(error?.response?.data?.code);
  return WITHDRAWN_REPLY_ERROR_CODES.has(responseCode);
}

function normalizeIncomingMessage(message) {
  if (message.message_type === 'text') {
    return {
      text: parseMessageContent(message.content),
      attachments: [],
    };
  }

  if (message.message_type === 'image') {
    const parsed = parseJsonContent(message.content);
    if (!parsed?.image_key) {
      return null;
    }

    return {
      text: '',
      attachments: [
        {
          kind: 'image',
          platformRef: parsed.image_key,
          sourceMessageType: 'image',
          messageId: message.message_id,
          filename: null,
        },
      ],
    };
  }

  if (message.message_type === 'file') {
    const parsed = parseJsonContent(message.content);
    if (!parsed?.file_key) {
      return null;
    }

    return {
      text: '',
      attachments: [
        {
          kind: 'file',
          platformRef: parsed.file_key,
          sourceMessageType: 'file',
          messageId: message.message_id,
          filename: typeof parsed.file_name === 'string' ? parsed.file_name : null,
        },
      ],
    };
  }

  return null;
}

function parseMessageContent(rawContent) {
  const parsed = parseJsonContent(rawContent);
  return typeof parsed?.text === 'string' ? parsed.text : '';
}

function parseJsonContent(rawContent) {
  if (!rawContent) {
    return null;
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    return null;
  }
}

function normalizeOutgoingMessage(message) {
  if (typeof message === 'string') {
    return {
      msgType: 'text',
      content: JSON.stringify({ text: message }),
      fallbackText: message,
    };
  }

  return message;
}

function normalizeSendResult(response) {
  const messageId = response?.data?.message_id ?? response?.messageId;
  if (!messageId) {
    return response;
  }

  return {
    ...response,
    messageId,
  };
}

function resolveFeishuFileType(metadata = {}) {
  const lowerName = String(metadata.filename || '').toLowerCase();
  if (metadata.mimeType === 'application/pdf' || lowerName.endsWith('.pdf')) {
    return 'pdf';
  }
  if (metadata.mimeType?.startsWith('video/') || lowerName.endsWith('.mp4')) {
    return 'mp4';
  }
  if (metadata.mimeType?.startsWith('audio/') || lowerName.endsWith('.ogg') || lowerName.endsWith('.opus')) {
    return 'opus';
  }
  return 'stream';
}

function guessMimeFromName(filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.json') return 'application/json';
  if (ext === '.md') return 'text/markdown';
  if (ext === '.txt') return 'text/plain';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

async function streamToBuffer(value) {
  if (typeof value?.getReadableStream === 'function') {
    return streamToBuffer(value.getReadableStream());
  }

  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (value?.readable === true && typeof value.on === 'function') {
    const chunks = [];
    return await new Promise((resolve, reject) => {
      value.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      value.on('end', () => resolve(Buffer.concat(chunks)));
      value.on('error', reject);
    });
  }

  if (value?.pipe && typeof value.on === 'function') {
    const chunks = [];
    return await new Promise((resolve, reject) => {
      value.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      value.on('end', () => resolve(Buffer.concat(chunks)));
      value.on('error', reject);
    });
  }

  return Buffer.from([]);
}
