import { describe, expect, test } from 'vitest';
import { parseCodexJsonl } from '../src/codex-events.js';

describe('parseCodexJsonl', () => {
  test('extracts the thread id and last agent message', () => {
    const output = [
      '{"type":"thread.started","thread_id":"thread-123"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"first reply"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"final reply"}}',
    ].join('\n');

    expect(parseCodexJsonl(output)).toEqual({
      threadId: 'thread-123',
      replyText: 'final reply',
    });
  });

  test('returns nulls when no thread or reply exists', () => {
    expect(parseCodexJsonl('')).toEqual({
      threadId: null,
      replyText: null,
    });
  });

  test('ignores malformed json lines', () => {
    const output = [
      'not-json',
      '{"type":"thread.started","thread_id":"thread-999"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"usable"}}',
    ].join('\n');

    expect(parseCodexJsonl(output)).toEqual({
      threadId: 'thread-999',
      replyText: 'usable',
    });
  });
});
