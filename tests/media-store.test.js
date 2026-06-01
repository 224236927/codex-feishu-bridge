import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MediaStore } from '../src/media-store.js';

describe('MediaStore', () => {
  let rootDir;

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
      rootDir = null;
    }
  });

  test('stages an inbound file under the media root with a sanitized name', async () => {
    rootDir = await mkdtemp(path.join(os.tmpdir(), 'media-store-'));
    const store = new MediaStore(rootDir);

    const stored = await store.stageInbound({
      filename: '..\\bad\\report.json',
      buffer: Buffer.from('{"ok":true}'),
      kind: 'file',
      sourceMessageType: 'file',
    });

    expect(stored.path.startsWith(rootDir)).toBe(true);
    expect(stored.filename).toBe('report.json');
    expect(stored.mimeType).toBe('application/json');
  });
});
