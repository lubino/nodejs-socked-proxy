import fs from 'fs'
import path from 'path'

const TEXT_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.json', '.html', '.css', '.scss', '.md',
  '.txt', '.yml', '.yaml', '.xml', '.svg', '.env', '.conf', '.config',
  '.py', '.java', '.c', '.cpp', '.h', '.sh', '.bat', '.ps1', '.gitignore'
])

export function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return TEXT_EXTS.has(ext)
}

// Normalizácia LF → CRLF len pre textové súbory
export function normalizeLineEndings(filePath) {
  if (!isTextFile(filePath) || process.platform !== 'win32') {
    return fs.readFileSync(filePath).toString('base64')
  }
  return Buffer.from(fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n')).toString('base64')
}

export function restoreLineEndings(content64, filePath) {
  if (!isTextFile(filePath) || process.platform !== 'win32') {
    const content = Buffer.from(content64, 'base64')
    return fs.writeFileSync(filePath, content)
  }
  const content = Buffer.from(content64, 'base64').toString('utf8').replace(/\n/g, '\r\n')
  fs.writeFileSync(filePath, content, 'utf8')
}
