import path from 'node:path';
import { parseIncomingText } from './command-parser.js';
import {
  buildErrorMessage,
  buildInfoMessage,
  buildReplyMessage,
  buildTaskStatusMessage,
  buildTypingMessage,
} from './feishu-message-builder.js';

const SUPPORTED_FILE_EXTENSIONS = new Set(['.txt', '.md', '.json', '.pdf', '.docx']);
const DEFAULT_STATUS_UPDATE_INTERVAL_MS = 1500;

export function createMessageHandler({
  sessionStore,
  codexClient,
  sendMessage,
  updateMessage,
  mediaTransport = {},
  mediaStore = null,
  logger = console,
  statusUpdateIntervalMs = DEFAULT_STATUS_UPDATE_INTERVAL_MS,
  now = () => Date.now(),
}) {
  const pendingByUser = new Map();

  return {
    async handlePrivateText({ userId, text, messageId }) {
      return this.handlePrivateMessage({
        userId,
        text,
        messageId,
        attachments: [],
      });
    },

    async handlePrivateMessage(payload) {
      const userId = payload.userId;
      const previous = pendingByUser.get(userId) ?? Promise.resolve();
      const current = previous
        .catch(() => undefined)
        .then(() =>
          processMessage({
            ...payload,
            sessionStore,
            codexClient,
            sendMessage,
            updateMessage,
            mediaTransport,
            mediaStore,
            logger,
            statusUpdateIntervalMs,
            now,
          }),
        );

      pendingByUser.set(userId, current);

      try {
        await current;
      } finally {
        if (pendingByUser.get(userId) === current) {
          pendingByUser.delete(userId);
        }
      }
    },
  };
}

async function processMessage({
  userId,
  text,
  messageId,
  attachments = [],
  sessionStore,
  codexClient,
  sendMessage,
  updateMessage,
  mediaTransport,
  mediaStore,
  logger,
  statusUpdateIntervalMs,
  now,
}) {
  logger.log?.('Processing incoming Feishu message.', {
    userId,
    messageId,
    textLength: text?.length ?? 0,
    textPreview: String(text ?? '').slice(0, 120),
    attachmentCount: attachments.length,
  });

  const parsed = parseIncomingText(text);
  const replyOptions = messageId ? { quoteMessageId: messageId } : undefined;

  if (attachments.length === 0 && parsed.kind === 'command') {
    await handleCommand({ userId, command: parsed.command, sessionStore, sendMessage, replyOptions });
    return;
  }

  if (!parsed.text && attachments.length === 0) {
    await sendMessage(
      userId,
      buildInfoMessage({
        title: '先直接说你想做什么',
        body: '发任务内容就可以；如果想先看当前状态，可以用 `/status`。',
        footerKind: null,
      }),
      replyOptions,
    );
    return;
  }

  const unsupported = attachments.find((attachment) => attachment.kind === 'file' && !isSupportedInboundFile(attachment.filename));
  if (unsupported) {
    await sendMessage(
      userId,
      buildInfoMessage({
        title: '这个文件类型还不支持',
        body: '目前支持：txt、md、json、pdf、docx。',
        footerKind: null,
      }),
      replyOptions,
    );
    return;
  }

  const existingThreadId = await sessionStore.getThreadId(userId);
  const taskStatus = createTaskStatusController({
    userId,
    sendMessage,
    updateMessage,
    logger,
    intervalMs: statusUpdateIntervalMs,
    now,
  });

  try {
    await taskStatus.start();
  } catch (error) {
    logger.warn?.('Failed to start task status message.', { userId, error });
  }

  if (!taskStatus.isActive()) {
    try {
      logger.log?.('Sending typing ack to Feishu.', {
        userId,
        messageId,
        hasQuoteReply: Boolean(messageId),
      });
      await sendMessage(userId, buildTypingMessage({ agentName: 'Hanako' }), replyOptions);
    } catch (error) {
      logger.warn?.('Failed to send typing ack to Feishu.', { userId, error });
    }
  }

  let stagedAttachments = [];
  try {
    stagedAttachments = await stageAttachments({
      attachments,
      mediaTransport,
      mediaStore,
    });
  } catch (error) {
    logger.error?.('Failed to stage attachments.', { userId, error });
    await sendMessage(
      userId,
      buildErrorMessage({
        title: '附件没接住',
        body: '我这边没能把图片或文件取下来，请再试一次。',
        footerKind: 'error-general',
      }),
      replyOptions,
    );
    await taskStatus.fail();
    return;
  }

  const prompt = buildPrompt({
    userText: parsed.text,
    attachments: stagedAttachments,
  });

  let result;
  try {
    logger.log?.('Sending prompt to Codex.', {
      userId,
      hasThread: Boolean(existingThreadId),
      promptLength: prompt.length,
    });
    result = await codexClient.send({
      prompt,
      threadId: existingThreadId,
    });
    logger.log?.('Codex reply received.', {
      userId,
      threadId: result.threadId ?? existingThreadId,
      replyLength: result.replyText?.length ?? 0,
    });
  } catch (error) {
    logger.error?.('Failed to process Codex message', {
      userId,
      hasThread: Boolean(existingThreadId),
      error,
    });

    if (existingThreadId) {
      await sessionStore.clearThreadId(userId);
      await sendMessage(
        userId,
        buildErrorMessage({
          title: '这条会话没接上',
          body: '我已经把旧的绑定清掉了，现在可以重新开始。',
          footerKind: 'error-resume',
        }),
        replyOptions,
      );
      await taskStatus.fail();
      return;
    }

    await sendMessage(
      userId,
      buildErrorMessage({
        title: '这次没跑成',
        body: '我这边没有完成这次处理。',
        footerKind: 'error-general',
      }),
      replyOptions,
    );
    await taskStatus.fail();
    return;
  }

  if (result.threadId) {
    await sessionStore.setThreadId(userId, result.threadId);
  }

  const directive = parseOutputDirective(result.replyText);

  try {
    if (directive?.kind === 'image' && typeof mediaTransport.sendImageFromPath === 'function') {
      logger.log?.('Sending image output back to Feishu.', {
        userId,
        path: directive.path,
      });
      await mediaTransport.sendImageFromPath(userId, directive.path, replyOptions ?? {});
      await taskStatus.complete();
      return;
    }

    if (directive?.kind === 'file' && typeof mediaTransport.sendFileFromPath === 'function') {
      logger.log?.('Sending file output back to Feishu.', {
        userId,
        path: directive.path,
      });
      await mediaTransport.sendFileFromPath(userId, directive.path, replyOptions ?? {});
      await taskStatus.complete();
      return;
    }

    await deliverFinalReply({
      userId,
      replyText: stripOutputDirective(result.replyText),
      threadId: result.threadId ?? existingThreadId,
      hasQuoteReply: Boolean(messageId),
      replyOptions,
      sendMessage,
      logger,
    });
    await taskStatus.complete();
  } catch (error) {
    logger.error?.('Failed to deliver final Feishu reply.', {
      userId,
      error,
    });

    if (directive) {
      try {
        await sendMessage(
          userId,
          buildErrorMessage({
            title: 'Generated attachment could not be delivered',
            body: 'The reply was generated, but the output file or image could not be sent back to Feishu. Please retry.',
            threadId: result.threadId ?? existingThreadId,
            footerKind: 'error-general',
          }),
          replyOptions,
        );
      } catch (fallbackError) {
        logger.error?.('Failed to send generated-attachment error reply.', {
          userId,
          error: fallbackError,
        });
      }
    }

    await taskStatus.fail();
  }
}

async function deliverFinalReply({
  userId,
  replyText,
  threadId,
  hasQuoteReply,
  replyOptions,
  sendMessage,
  logger,
}) {
  const richMessage = buildReplyMessage({
    replyText,
    threadId,
    hasQuoteReply,
  });

  logger.log?.('Sending final rich reply to Feishu.', {
    userId,
    msgType: richMessage?.msgType,
    hasQuoteReply,
  });

  try {
    await sendMessage(userId, richMessage, replyOptions);
    logger.log?.('Final rich reply sent to Feishu.', {
      userId,
      msgType: richMessage?.msgType,
    });
    return;
  } catch (error) {
    logger.error?.('Rich final reply failed, retrying as plain text.', {
      userId,
      hasQuoteReply,
      error,
    });
  }

  try {
    await sendMessage(userId, replyText, replyOptions);
    logger.log?.('Plain-text fallback reply sent to Feishu.', {
      userId,
      quoted: Boolean(replyOptions?.quoteMessageId),
    });
    return;
  } catch (error) {
    logger.error?.('Quoted plain-text fallback failed.', {
      userId,
      hasQuoteReply,
      error,
    });
    if (!replyOptions?.quoteMessageId) {
      throw error;
    }
  }

  logger.warn?.('Retrying plain-text fallback without quote.', { userId });
  await sendMessage(userId, replyText);
  logger.log?.('Unquoted plain-text fallback sent to Feishu.', { userId });
}

async function stageAttachments({ attachments, mediaTransport, mediaStore }) {
  if (!attachments?.length) {
    return [];
  }

  if (!mediaStore) {
    throw new Error('Media store is required when attachments are present.');
  }

  const staged = [];
  for (const attachment of attachments) {
    let downloaded;
    if (attachment.kind === 'image') {
      downloaded = await mediaTransport.downloadImage(attachment);
    } else {
      downloaded = await mediaTransport.downloadFile(attachment);
    }

    staged.push(
      await mediaStore.stageInbound({
        filename: attachment.filename || defaultFilenameForAttachment(attachment, downloaded?.mimeType),
        buffer: downloaded.buffer,
        kind: attachment.kind,
        sourceMessageType: attachment.sourceMessageType,
      }),
    );
  }

  return staged;
}

function defaultFilenameForAttachment(attachment, mimeType) {
  if (attachment.kind === 'image') {
    if (mimeType === 'image/jpeg') return 'attachment.jpg';
    return 'attachment.png';
  }
  return attachment.filename || 'attachment.bin';
}

function buildPrompt({ userText, attachments }) {
  if (!attachments.length) {
    return userText;
  }

  const sections = [];
  if (userText) {
    sections.push(userText);
  }

  sections.push('Attachments:');
  for (const attachment of attachments) {
    sections.push(`- type: ${attachment.kind}`);
    sections.push(`  filename: ${attachment.filename}`);
    sections.push(`  path: ${attachment.path}`);
    if (attachment.kind === 'image') {
      sections.push('  hint: inspect the image at this path.');
    } else {
      sections.push('  hint: read the file at this path and use it to answer the user.');
    }
  }

  sections.push('If you generate an image to send back, end with `OUTPUT_IMAGE: <absolute path>`.');
  sections.push('If you generate a file to send back, end with `OUTPUT_FILE: <absolute path>`.');

  return sections.join('\n');
}

function parseOutputDirective(replyText = '') {
  const imageMatch = String(replyText).match(/(?:^|\n)OUTPUT_IMAGE:\s*(.+)$/m);
  if (imageMatch) {
    return { kind: 'image', path: imageMatch[1].trim() };
  }

  const fileMatch = String(replyText).match(/(?:^|\n)OUTPUT_FILE:\s*(.+)$/m);
  if (fileMatch) {
    return { kind: 'file', path: fileMatch[1].trim() };
  }

  return null;
}

function stripOutputDirective(replyText = '') {
  return String(replyText)
    .replace(/(?:^|\n)OUTPUT_IMAGE:\s*.+$/m, '')
    .replace(/(?:^|\n)OUTPUT_FILE:\s*.+$/m, '')
    .trim();
}

function isSupportedInboundFile(filename = '') {
  return SUPPORTED_FILE_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function createTaskStatusController({
  userId,
  sendMessage,
  updateMessage,
  logger,
  intervalMs,
  now,
}) {
  if (typeof updateMessage !== 'function') {
    return createNoopTaskStatusController();
  }

  let startedAt = now();
  let statusMessageId = null;
  let intervalId = null;
  let frame = 0;
  let disabled = false;

  return {
    async start() {
      startedAt = now();
      const response = await sendMessage(
        userId,
        buildTaskStatusMessage({
          elapsedMs: 0,
          frame,
        }),
        undefined,
      );
      statusMessageId = response?.messageId ?? response?.data?.message_id ?? null;

      if (!statusMessageId) {
        disabled = true;
        return;
      }

      intervalId = setInterval(() => {
        frame += 1;
        void pushUpdate(
          buildTaskStatusMessage({
            elapsedMs: now() - startedAt,
            frame,
          }),
        );
      }, intervalMs);
    },

    isActive() {
      return Boolean(statusMessageId) && !disabled;
    },

    async complete() {
      await finalize(
        buildTaskStatusMessage({
          elapsedMs: now() - startedAt,
          completed: true,
        }),
      );
    },

    async fail() {
      await finalize(
        buildTaskStatusMessage({
          elapsedMs: now() - startedAt,
          failed: true,
        }),
      );
    },
  };

  async function finalize(message) {
    if (!statusMessageId || disabled) {
      clearStatusInterval();
      return;
    }

    clearStatusInterval();
    await pushUpdate(message);
  }

  async function pushUpdate(message) {
    if (!statusMessageId || disabled) {
      return;
    }

    try {
      await updateMessage(statusMessageId, message);
    } catch (error) {
      disabled = true;
      clearStatusInterval();
      logger.warn?.('Failed to update task status message.', {
        userId,
        statusMessageId,
        error,
      });
    }
  }

  function clearStatusInterval() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
}

function createNoopTaskStatusController() {
  return {
    async start() {},
    isActive() {
      return false;
    },
    async complete() {},
    async fail() {},
  };
}

async function handleCommand({ userId, command, sessionStore, sendMessage, replyOptions }) {
  if (command === 'status') {
    const threadId = await sessionStore.getThreadId(userId);
    if (threadId) {
      await sendMessage(
        userId,
        buildInfoMessage({
          title: '现在还接着上一条线',
          body: '你直接继续发消息，我会沿着当前会话往下做。',
          threadId,
          footerKind: null,
        }),
        replyOptions,
      );
      return;
    }

    await sendMessage(
      userId,
      buildInfoMessage({
        title: '还没有开始会话',
        body: '目前还没有绑定中的 Codex 会话。',
        footerKind: 'status-empty',
      }),
      replyOptions,
    );
    return;
  }

  if (command === 'new' || command === 'reset') {
    await sessionStore.clearThreadId(userId);
    await sendMessage(
      userId,
      buildInfoMessage({
        title: '已经换成新的一条线',
        body: '我把旧的会话绑定清掉了。',
        template: 'grey',
        footerKind: 'reset',
      }),
      replyOptions,
    );
  }
}
