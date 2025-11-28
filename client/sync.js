// sync.js
import fs from 'fs';
import path from 'path';

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
      if (!msg.mtime) {
        return
      }
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      try {
        const stat = fs.statSync(fullPath)
        if (Math.floor(stat.mtimeMs) >= msg.mtime) {
          return
        }
      } catch (e) {
      }

      const buffer = Buffer.from(msg.content, 'base64');
      fs.writeFileSync(fullPath, buffer, 'utf8');
      const date = new Date(msg.mtime)
      fs.utimesSync(fullPath, date, date);

      console.log(`↓ writing ${msg.event} ${msg.folder}/${msg.path} (mtime preserved ${msg.mtime})`);
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
          mtime: Math.floor(stat.mtimeMs),
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

export function requestMissingFiles(ws, CLIENT_NAME, remoteClient, folder, theirFiles) {
  // You’ll implement this in handlers.js
}
