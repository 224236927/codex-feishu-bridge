import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MIME_BY_EXTENSION = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

export class MediaStore {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async stageInbound({ filename, buffer, kind, sourceMessageType }) {
    const safeName = sanitizeFilename(filename || defaultFilename(kind, sourceMessageType));
    const targetPath = path.join(this.rootDir, `${Date.now()}-${safeName}`);
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(targetPath, buffer);

    return {
      path: targetPath,
      filename: safeName,
      kind,
      mimeType: guessMimeFromName(safeName),
      size: buffer.length,
      createdAt: new Date().toISOString(),
    };
  }
}

function defaultFilename(kind, sourceMessageType) {
  if (kind === 'image' || sourceMessageType === 'image') {
    return 'attachment.png';
  }

  return 'attachment.bin';
}

export function sanitizeFilename(input = '') {
  const normalized = String(input).replace(/\\/g, '/');
  const basename = path.posix.basename(normalized);
  const stripped = basename.replace(/[\x00-\x1f\x7f]/g, '').replace(/[<>:"/\\|?*]+/g, '-').trim();
  return stripped || 'attachment.bin';
}

export function guessMimeFromName(filename = '') {
  return MIME_BY_EXTENSION[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}
