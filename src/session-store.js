import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export class SessionStore {
  constructor(filePath) {
    this.filePath = filePath;
  }

  async getThreadId(userId) {
    const state = await this.#readState();
    return state[userId]?.threadId ?? null;
  }

  async setThreadId(userId, threadId) {
    const state = await this.#readState();
    state[userId] = {
      threadId,
      updatedAt: new Date().toISOString(),
    };
    await this.#writeState(state);
  }

  async clearThreadId(userId) {
    const state = await this.#readState();
    delete state[userId];
    await this.#writeState(state);
  }

  async #readState() {
    try {
      const raw = await readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  async #writeState(state) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
