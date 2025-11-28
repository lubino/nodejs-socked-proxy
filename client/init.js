// init.js
import chokidar from 'chokidar';
import fs from 'fs';
import path from 'path';

export function initWatching(ws, CLIENT_NAME, WATCHED_DIRS) {
  const watchers = [];

  WATCHED_DIRS.forEach(dir => {
    const normalized = path.normalize(dir);
    const folderName = path.basename(normalized);

    if (!fs.existsSync(normalized)) {
      fs.mkdirSync(normalized, { recursive: true });
      console.log(`Created: ${normalized}`);
    }

    const watcher = chokidar.watch(normalized, {
      //ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: false
    });

    watcher.on('all', (event, filePath) => {
      // 1. Základné podmienky – ak nie sme pripojení, nič neposielame
      if (ws.readyState !== ws.OPEN) return;

      // 2. Reagujeme len na skutočné zmeny súborov (nie adresárov)
      if (!['add', 'change', 'unlink'].includes(event)) return;

      const protocolPath = path.relative(normalized, filePath);
      const relative = protocolPath.split(path.sep).join('/');

      // 3. Bezpečne načítaj štatistiky súboru
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (err) {
        return; // súbor zmizol medzičasom – ignorujeme
      }

      // 4. Pošleme zmenu všetkým ostatným
      const mtimeNs = stat.mtimeMs * 1_000_000n;
      ws.send(JSON.stringify({
        type: 'file-change',
        client: CLIENT_NAME,
        folder: folderName,           // napr. "gpap-core"
        path: relative,               // napr. "src/index.js"
        event,                        // "add" | "change" | "unlink"
        content: event !== 'unlink' ? fs.readFileSync(filePath).toString('base64') : null,
        mtimeNs: mtimeNs.toString()
      }));

      console.log(`↑ detected ${event} ${folderName}/${relative} ${mtime}`);
    });

    watchers.push(watcher);
  });

  // Send only folder names
  const folderNames = WATCHED_DIRS.map(d => path.basename(path.normalize(d)));
  console.log('sending folderNames', folderNames)
  ws.send(JSON.stringify({
    type: 'init',
    client: CLIENT_NAME,
    folders: folderNames,
    timestamp: Date.now()
  }));

  return watchers;
}
