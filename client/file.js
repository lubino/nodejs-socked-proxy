import path from 'path';

const TEXT_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.scss', '.md',
  '.txt', '.yml', '.yaml', '.xml', '.svg', '.env', '.conf', '.config',
  '.py', '.java', '.c', '.cpp', '.h', '.sh', '.bat', '.ps1', '.gitignore'
]);

export function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTS.has(ext);
}

// Normalizácia LF → CRLF len pre textové súbory
export function normalizeLineEndings(content, filePath) {
  if (!isTextFile(filePath)) return content;
  return process.platform === 'win32' ? content.replace(/\r\n/g, '\n') : content;
}

export function restoreLineEndings(content, filePath) {
  if (!isTextFile(filePath)) return content;
  return process.platform === 'win32' ? content.replace(/\n/g, '\r\n') : content;
}
