import { describe, expect, test } from 'vitest';
import {
  buildErrorMessage,
  buildInfoMessage,
  buildProcessingMessage,
  buildReplyMessage,
  buildTaskStatusMessage,
  buildTypingMessage,
} from '../src/feishu-message-builder.js';

function parseMessage(message) {
  return JSON.parse(message.content);
}

describe('feishu-message-builder', () => {
  test('builds a plain typing message instead of a card', () => {
    const message = buildTypingMessage({ agentName: 'Hanako' });

    expect(message.msgType).toBe('text');
    expect(parseMessage(message).text).toContain('Hanako');
    expect(parseMessage(message).text).toContain('正在输入');
  });

  test('builds a processing card with grey header', () => {
    const message = buildProcessingMessage({ hasThread: false });
    const card = parseMessage(message);

    expect(message.msgType).toBe('interactive');
    expect(card.header.template).toBe('grey');
    expect(card.header.title.content).toBe('稍等一下');
    expect(card.elements).toHaveLength(1);
  });

  test('builds a rich post message for ordinary replies', () => {
    const message = buildReplyMessage({
      replyText: '第一段。\n\n- 一点\n- 两点\n\n**重点**在这里。',
      hasQuoteReply: true,
    });
    const post = parseMessage(message);

    expect(message.msgType).toBe('post');
    expect(post.zh_cn.content[0][0].tag).toBe('md');
    expect(post.zh_cn.content[0][0].text).toContain('**重点**');
  });

  test('builds a grey structured card for summary-like replies', () => {
    const message = buildReplyMessage({
      replyText: '## 结果\n- 已完成\n```js\nconsole.log(1)\n```',
      threadId: 'thread-1',
    });
    const card = parseMessage(message);

    expect(message.msgType).toBe('interactive');
    expect(card.header.template).toBe('grey');
    expect(card.header.title.content).toBe('内容整理');
    expect(card.elements[0].content).toContain('## 结果');
    expect(card.elements[1].elements[0].content).toContain('thread-1');
  });

  test('builds a status card with grey header and small tail', () => {
    const message = buildInfoMessage({
      title: '现在还接着上一条线',
      body: '你直接继续发消息，我会沿着当前会话往下做。',
      threadId: 'thread-1',
      footerKind: null,
    });
    const card = parseMessage(message);

    expect(card.header.template).toBe('grey');
    expect(card.elements[1].elements[0].content).toContain('thread-1');
  });

  test('builds an error card with contextual fallback text', () => {
    const message = buildErrorMessage({
      title: '这条会话没接上',
      body: '我已经把旧的绑定清掉了。',
      footerKind: 'error-resume',
    });
    const card = parseMessage(message);

    expect(card.header.template).toBe('red');
    expect(message.fallbackText).toContain('这条会话没接上');
    expect(card.elements[1].elements[0].content).toContain('/new');
  });
  test('builds a running task status message with elapsed time', () => {
    const message = buildTaskStatusMessage({
      phaseLabel: '正在思考',
      elapsedMs: 65000,
      frame: 2,
    });
    const post = parseMessage(message);

    expect(message.msgType).toBe('post');
    expect(post.zh_cn.content[0][0].text).toContain('正在思考..');
    expect(post.zh_cn.content[0][0].text).toContain('已运行 1 分 5 秒');
  });

  test('builds a completed task status message', () => {
    const message = buildTaskStatusMessage({
      elapsedMs: 183000,
      completed: true,
    });
    const post = parseMessage(message);

    expect(message.msgType).toBe('post');
    expect(post.zh_cn.content[0][0].text).toContain('结果已发送');
    expect(post.zh_cn.content[0][0].text).toContain('用时 3 分 3 秒');
  });
});
