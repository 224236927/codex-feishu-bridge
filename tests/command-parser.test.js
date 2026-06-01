import { describe, expect, test } from 'vitest';
import { parseIncomingText } from '../src/command-parser.js';

describe('parseIncomingText', () => {
  test('parses /new as a control command', () => {
    expect(parseIncomingText('/new')).toEqual({
      kind: 'command',
      command: 'new',
    });
  });

  test('parses /reset as a control command', () => {
    expect(parseIncomingText(' /reset ')).toEqual({
      kind: 'command',
      command: 'reset',
    });
  });

  test('parses /status as a control command', () => {
    expect(parseIncomingText('/status')).toEqual({
      kind: 'command',
      command: 'status',
    });
  });

  test('treats other text as a chat message', () => {
    expect(parseIncomingText('please help me review this file')).toEqual({
      kind: 'chat',
      text: 'please help me review this file',
    });
  });

  test('normalizes empty input to an empty chat message', () => {
    expect(parseIncomingText('   ')).toEqual({
      kind: 'chat',
      text: '',
    });
  });
});
