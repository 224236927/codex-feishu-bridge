function buildTextMessage(text) {
  return {
    msgType: 'text',
    content: JSON.stringify({ text }),
    fallbackText: text,
  };
}

export function buildTypingMessage({ agentName = 'Hanako' } = {}) {
  return buildTextMessage(`（${agentName}正在输入...）`);
}

function buildPostMessage(markdown, fallbackText = markdown) {
  return {
    msgType: 'post',
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            {
              tag: 'md',
              text: markdown,
            },
          ],
        ],
      },
    }),
    fallbackText,
  };
}

function buildCardMessage({ template, title, body, note, footer }) {
  const header = {
    title: {
      tag: 'plain_text',
      content: title,
    },
  };

  if (template) {
    header.template = template;
  }

  const elements = [
    {
      tag: 'markdown',
      content: body,
    },
  ];

  if (note) {
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: note,
        },
      ],
    });
  }

  if (footer) {
    elements.push({
      tag: 'note',
      elements: [
        {
          tag: 'plain_text',
          content: footer,
        },
      ],
    });
  }

  return {
    msgType: 'interactive',
    content: JSON.stringify({
      config: {
        wide_screen_mode: true,
      },
      header,
      elements,
    }),
    fallbackText: [title, body, note, footer].filter(Boolean).join('\n\n'),
  };
}

function buildSessionNote(threadId) {
  if (!threadId) {
    return null;
  }

  return `当前会话：${threadId}`;
}

function buildFooter(kind) {
  if (kind === 'processing' || kind === 'reply' || !kind) {
    return null;
  }

  if (kind === 'status-empty') {
    return '直接发第一条消息就好，我会替你开始新的 Codex 会话。';
  }

  if (kind === 'reset') {
    return '你下一条消息会从一条新的会话线开始。';
  }

  if (kind === 'empty') {
    return '直接告诉我你想做什么就行。';
  }

  if (kind === 'error-resume') {
    return '你可以直接重试，或者发 `/new` 重新开始。';
  }

  if (kind === 'error-general') {
    return '稍后重试一次；如果还不对，我继续帮你查。';
  }

  return null;
}

export function buildProcessingMessage({ hasThread }) {
  return buildCardMessage({
    template: 'grey',
    title: '稍等一下',
    body: hasThread
      ? '我正在把这条消息接到当前会话里，稍等一下。'
      : '我正在把这条消息交给 Codex，也会顺手替你开一条新的会话线。',
  });
}

export function buildTaskStatusMessage({
  phaseLabel = '正在思考',
  elapsedMs = 0,
  frame = 0,
  completed = false,
  failed = false,
} = {}) {
  if (completed) {
    return buildPostMessage(`结果已发送\n\n用时 ${formatElapsed(elapsedMs)}`, `结果已发送，用时 ${formatElapsed(elapsedMs)}`);
  }

  if (failed) {
    return buildPostMessage(`处理失败\n\n用时 ${formatElapsed(elapsedMs)}`, `处理失败，用时 ${formatElapsed(elapsedMs)}`);
  }

  const suffix = resolveFrameSuffix(frame);
  const body = `${phaseLabel}${suffix}\n\n已运行 ${formatElapsed(elapsedMs)}`;
  return buildPostMessage(body, body);
}

function stripLeadingQuotedEcho(text, { hasQuoteReply }) {
  if (!hasQuoteReply) {
    return text;
  }

  const trimmed = text.trimStart();
  const match = trimmed.match(/^>\s+([^\n]{1,80})\n\s*\n/);
  if (!match) {
    return text;
  }

  return trimmed.slice(match[0].length).trimStart();
}

function normalizeReplyText(text, options = {}) {
  const base = (text || '这边已经处理完了，不过这次没有返回正文。').replace(/\r\n/g, '\n').trim();
  const withoutEcho = stripLeadingQuotedEcho(base, options);
  return withoutEcho
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function isStructuredReply(text) {
  return (
    /```[\s\S]*?```/.test(text) ||
    /\|.+\|[\r\n]+\|[-:| ]+\|/.test(text) ||
    /^\s{0,3}#{1,3}\s/m.test(text)
  );
}

function resolveStructuredTitle(text) {
  if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) {
    return '表格整理';
  }

  if (/```[\s\S]*?```/.test(text)) {
    return '内容整理';
  }

  return '结果整理';
}

export function buildReplyMessage({ replyText, threadId, hasQuoteReply = false }) {
  const body = normalizeReplyText(replyText, { hasQuoteReply });

  if (!isStructuredReply(body)) {
    return buildPostMessage(body, body);
  }

  return buildCardMessage({
    template: 'grey',
    title: resolveStructuredTitle(body),
    body,
    note: buildSessionNote(threadId),
  });
}

export function buildInfoMessage({ title, body, threadId, template = 'grey', footerKind }) {
  return buildCardMessage({
    template,
    title,
    body,
    note: threadId ? buildSessionNote(threadId) : null,
    footer: buildFooter(footerKind),
  });
}

export function buildErrorMessage({ title, body, threadId, footerKind }) {
  return buildCardMessage({
    template: 'red',
    title,
    body,
    note: threadId ? buildSessionNote(threadId) : null,
    footer: buildFooter(footerKind),
  });
}

function resolveFrameSuffix(frame) {
  const frames = ['', '.', '..', '...'];
  const normalizedFrame = Number.isFinite(frame) ? Math.max(0, Math.floor(frame)) : 0;
  return frames[normalizedFrame % frames.length];
}

function formatElapsed(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor((elapsedMs || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} 秒`;
  }

  return `${minutes} 分 ${seconds} 秒`;
}

export { buildTextMessage };
