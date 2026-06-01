import { spawn } from 'node:child_process';
import path from 'node:path';
import { loadConfig } from './config.js';
import { SessionStore } from './session-store.js';
import { CodexClient } from './codex-client.js';
import { createMessageHandler } from './message-handler.js';
import { createFeishuBot } from './feishu-bot.js';
import { MediaStore } from './media-store.js';

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception in Codex Feishu bridge.');
  console.error(error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in Codex Feishu bridge.');
  console.error(reason);
});

process.on('exit', (code) => {
  console.log(`Codex Feishu bridge process exiting with code ${code}.`);
});

async function main() {
  const config = loadConfig();

  console.log('Loading Codex Feishu bridge...');
  await verifyCodexCli();
  console.log('Codex CLI is available and logged in.');

  const sessionStore = new SessionStore(config.stateFile);
  const codexClient = new CodexClient({
    workspace: config.codexWorkspace,
    timeoutMs: config.codexTimeoutMs,
  });
  const mediaStore = new MediaStore(path.resolve(process.cwd(), 'runtime', 'media'));

  const bot = createFeishuBot({
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
  });

  const handler = createMessageHandler({
    sessionStore,
    codexClient,
    sendMessage: bot.sendMessage,
    updateMessage: bot.updateMessage,
    mediaTransport: bot,
    mediaStore,
  });

  await bot.start({
    onPrivateMessage: (payload) => handler.handlePrivateMessage(payload),
  });

  console.log('Codex Feishu bridge is ready.');
  console.log(`Workspace: ${config.codexWorkspace}`);
  console.log(`State file: ${config.stateFile}`);
  console.log(`Media root: ${path.resolve(process.cwd(), 'runtime', 'media')}`);

  const shutdown = () => {
    bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Failed to start Codex Feishu bridge.');
  console.error(error);
  process.exit(1);
});

async function verifyCodexCli() {
  await runShortCommand('codex', ['--version']);
  await runShortCommand('codex', ['login', 'status']);
}

async function runShortCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn('cmd.exe', ['/c', command, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', reject);

    child.on('close', (exitCode) => {
      if (exitCode === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(' ')} failed with exit code ${exitCode}. ${stderr || stdout}`.trim(),
        ),
      );
    });
  });
}
