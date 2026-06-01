import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parseCodexJsonl } from './codex-events.js';

const DEFAULT_TIMEOUT_MS = 300000;

export class CodexClientError extends Error {
  constructor(message, details = '') {
    super(message);
    this.name = 'CodexClientError';
    this.details = details;
  }
}

export class CodexClient {
  constructor({
    workspace,
    runner = runCodexCommand,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    executable = resolveCodexExecutable(),
    logger = console,
  }) {
    this.workspace = workspace;
    this.runner = runner;
    this.timeoutMs = timeoutMs;
    this.executable = executable;
    this.logger = logger;
  }

  async send({ prompt, threadId = null }) {
    const args = threadId
      ? [...this.executable.prefixArgs, 'exec', 'resume', threadId, prompt, '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox']
      : [...this.executable.prefixArgs, 'exec', prompt, '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox'];

    let result;
    try {
      result = await this.runner({
        command: this.executable.command,
        args,
        cwd: this.workspace,
        timeoutMs: this.timeoutMs,
      });
    } catch (error) {
      if (error instanceof CodexClientError) {
        throw error;
      }

      throw new CodexClientError(
        'Codex CLI invocation failed.',
        String(error?.message || error || '').trim(),
      );
    }

    this.logger.log?.('Codex CLI process completed.', {
      exitCode: result.exitCode,
      stdoutLength: String(result.stdout || '').length,
      stderrLength: String(result.stderr || '').length,
    });

    if (result.exitCode !== 0) {
      throw new CodexClientError(
        `Codex CLI failed with exit code ${result.exitCode}.`,
        String(result.stderr || result.stdout || '').trim(),
      );
    }

    const parsed = parseCodexJsonl(result.stdout);
    const resolvedThreadId = parsed.threadId ?? threadId;

    if (!parsed.replyText) {
      throw new CodexClientError('Codex CLI finished without a usable reply.', result.stdout);
    }

    return {
      threadId: resolvedThreadId,
      replyText: parsed.replyText,
    };
  }
}

function resolveCodexExecutable() {
  const nodeDir = path.dirname(process.execPath);
  const codexJs = path.join(nodeDir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');

  if (existsSync(codexJs)) {
    return {
      command: process.execPath,
      prefixArgs: [codexJs],
    };
  }

  return {
    command: 'codex',
    prefixArgs: [],
  };
}

async function runCodexCommand({ command, args, cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timeoutId = null;

    const finish = (callback) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      callback(value);
    };

    const resolveOnce = finish(resolve);
    const rejectOnce = finish(reject);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      rejectOnce(error);
    });

    child.on('close', (exitCode) => {
      resolveOnce({
        stdout,
        stderr,
        exitCode,
      });
    });

    timeoutId = setTimeout(() => {
      child.kill();
      rejectOnce(new CodexClientError(`Codex CLI timed out after ${timeoutMs}ms.`, stderr));
    }, timeoutMs);

    child.stdin.end();
  });
}
