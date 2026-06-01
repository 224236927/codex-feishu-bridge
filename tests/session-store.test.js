import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, test } from 'vitest';
import { SessionStore } from '../src/session-store.js';

const tempDirs = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createStore() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'codex-feishu-bridge-'));
  tempDirs.push(dir);
  return new SessionStore(path.join(dir, 'state.json'));
}

describe('SessionStore', () => {
  test('returns null for unknown users', async () => {
    const store = await createStore();
    expect(await store.getThreadId('user-1')).toBeNull();
  });

  test('stores and retrieves thread ids', async () => {
    const store = await createStore();
    await store.setThreadId('user-1', 'thread-1');

    expect(await store.getThreadId('user-1')).toBe('thread-1');
  });

  test('clears stored thread ids', async () => {
    const store = await createStore();
    await store.setThreadId('user-1', 'thread-1');
    await store.clearThreadId('user-1');

    expect(await store.getThreadId('user-1')).toBeNull();
  });

  test('updates timestamp metadata when saving', async () => {
    const store = await createStore();
    await store.setThreadId('user-1', 'thread-1');

    const raw = JSON.parse(await readFile(store.filePath, 'utf8'));
    expect(raw['user-1'].updatedAt).toEqual(expect.any(String));
  });
});
