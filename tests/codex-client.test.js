import { describe, expect, test, vi } from 'vitest';
import { CodexClient, CodexClientError } from '../src/codex-client.js';

describe('CodexClient', () => {
  test('constructs a new-session exec command with full access flags', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: [
        '{"type":"thread.started","thread_id":"thread-1"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await expect(client.send({ prompt: 'hello' })).resolves.toEqual({
      threadId: 'thread-1',
      replyText: 'hello',
    });

    expect(runner).toHaveBeenCalledWith({
      command: 'codex',
      args: ['exec', 'hello', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'],
      cwd: 'C:\\Work\\codex',
      timeoutMs: 300000,
    });
  });

  test('constructs a resume command with full access flags when thread id exists', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: [
        '{"type":"thread.started","thread_id":"thread-99"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"continued"}}',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await client.send({ prompt: 'continue', threadId: 'thread-99' });

    expect(runner).toHaveBeenCalledWith({
      command: 'codex',
      args: ['exec', 'resume', 'thread-99', 'continue', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'],
      cwd: 'C:\\Work\\codex',
      timeoutMs: 300000,
    });
  });

  test('supports an explicit executable prefix for direct node-plus-js invocation', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: [
        '{"type":"thread.started","thread_id":"thread-1"}',
        '{"type":"item.completed","item":{"type":"agent_message","text":"中文正常。"}}',
      ].join('\n'),
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'C:\\node.exe',
        prefixArgs: ['C:\\codex.js'],
      },
    });

    await client.send({ prompt: '请只回复这句话：中文正常。' });

    expect(runner).toHaveBeenCalledWith({
      command: 'C:\\node.exe',
      args: ['C:\\codex.js', 'exec', '请只回复这句话：中文正常。', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'],
      cwd: 'C:\\Work\\codex',
      timeoutMs: 300000,
    });
  });

  test('preserves an existing thread id when resume output does not emit thread.started', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"still here"}}',
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await expect(client.send({ prompt: 'continue', threadId: 'thread-123' })).resolves.toEqual({
      threadId: 'thread-123',
      replyText: 'still here',
    });
  });

  test('throws a normalized error when codex exits non-zero', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: '',
      stderr: 'boom',
      exitCode: 1,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await expect(client.send({ prompt: 'hello' })).rejects.toMatchObject({
      name: 'CodexClientError',
      message: 'Codex CLI failed with exit code 1.',
      details: 'boom',
    });
  });

  test('throws when codex returns no usable reply', async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: '{"type":"turn.completed"}',
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await expect(client.send({ prompt: 'hello' })).rejects.toBeInstanceOf(CodexClientError);
  });

  test('wraps runner failures as a CodexClientError', async () => {
    const runner = vi.fn().mockRejectedValue(new Error('spawn timeout'));

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await expect(client.send({ prompt: 'hello' })).rejects.toMatchObject({
      name: 'CodexClientError',
      message: 'Codex CLI invocation failed.',
      details: 'spawn timeout',
    });
  });

  test('logs codex process completion metadata after the runner returns', async () => {
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const runner = vi.fn().mockResolvedValue({
      stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"done"}}',
      stderr: '',
      exitCode: 0,
    });

    const client = new CodexClient({
      workspace: 'C:\\Work\\codex',
      runner,
      logger,
      executable: {
        command: 'codex',
        prefixArgs: [],
      },
    });

    await client.send({ prompt: 'hello' });

    expect(logger.log).toHaveBeenCalledWith(
      'Codex CLI process completed.',
      expect.objectContaining({
        exitCode: 0,
        stdoutLength: expect.any(Number),
        stderrLength: 0,
      }),
    );
  });
});



