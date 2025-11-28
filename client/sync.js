// sync.js
import fs from 'fs';
import path from 'path';
import {restoreLineEndings} from './file.js'

export function applyRemoteFileChange(msg, folderMap) {
  const localRoot = folderMap[msg.folder];
  if (!localRoot) return;

  const safePath = msg.path.split('/').join(path.sep);
  const fullPath = path.join(localRoot, safePath);

  try {
    if (msg.event === 'unlink') {
      fs.unlinkSync(fullPath);
      console.log(`↓ delete ${msg.folder}/${msg.path}`);
      return;
    }

    // === TU JE CELÁ MAGIA ===
    if (msg.event === 'add' || msg.event === 'change') {
      if (!msg.mtimeNs) {
        return
      }
      const remoteMtimeNs = BigInt(msg.mtimeNs);
      const remoteMtimeMs = Number(remoteMtimeNs) / 1_000_000;

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      try {
        const stat = fs.statSync(fullPath)
        const local = stat.mtimeMs * 1_000_000
        if (local >= remoteMtimeNs) {
          console.log(`- ignoring ${msg.event} ${msg.folder}/${msg.path} (mtime preserved ${local} <= ${remoteMtimeNs})`);
          return
        }
      } catch (e) {
      }

      const receivedText = Buffer.from(msg.content, 'base64').toString('utf8');
      const finalText = restoreLineEndings(receivedText, fullPath);
      fs.writeFileSync(fullPath, finalText, 'utf8');
      const atime = new Date();
      const mtime = new Date(remoteMtimeMs);
      fs.utimesSync(fullPath, mtime, mtime);

      console.log(`↓ writing ${msg.event} ${msg.folder}/${msg.path} (mtime preserved ${msg.mtimeNs})`);
      return;
    }

    console.error(`Unknown event: ${msg.event}`);
  } catch (err) {
    console.error(`Apply failed:`, err.message);
  }
}

export function sendFileTree(ws, CLIENT_NAME, folderName, folderPath) {
  const files = [];

  function walk(dir, base = '') {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      const rel = path.join(base, item);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
      } else {
        files.push({
          path: rel,
          mtimeNs: (BigInt(Math.round(stat.mtimeMs * 1_000_000))).toString(),
          size: stat.size
        });
      }
    }
  }

  walk(folderPath);
  console.log('file-list', files)
  ws.send(JSON.stringify({
    type: 'file-list',
    client: CLIENT_NAME,
    folder: folderName,
    files
  }));
}

