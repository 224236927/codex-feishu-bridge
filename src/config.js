import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config();

const DEFAULT_WORKSPACE = process.env.CODEX_WORKSPACE_ROOT || process.cwd();

export function loadConfig() {
  const config = {
    feishuAppId: process.env.FEISHU_APP_ID?.trim(),
    feishuAppSecret: process.env.FEISHU_APP_SECRET?.trim(),
    codexWorkspace: path.resolve(process.env.CODEX_WORKSPACE?.trim() || DEFAULT_WORKSPACE),
    stateFile:
      process.env.STATE_FILE?.trim() ||
      path.resolve(process.cwd(), 'runtime', 'state.json'),
    codexTimeoutMs: Number(process.env.CODEX_TIMEOUT_MS || '300000'),
  };

  const missing = [];
  if (!config.feishuAppId) {
    missing.push('FEISHU_APP_ID');
  }
  if (!config.feishuAppSecret) {
    missing.push('FEISHU_APP_SECRET');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}
