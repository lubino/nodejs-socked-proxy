// handlers.js
import {applyRemoteFileChange, sendFileTree} from './sync.js'
import fs from 'fs'
import path from 'path'

export function createMessageHandler(CLIENT_NAME, folderMap, ws) {
  // Helper: push a single local file to everyone
  const pushFile = (folderName, relPath) => {
    const root = folderMap[folderName]
    const full = path.join(root, relPath)
    try {
      const stat = fs.statSync(full)
      const content = fs.readFileSync(full, 'utf8')
      console.log(`↑ pushing newer/missing: ${folderName}/${relPath}`)
      ws.send(JSON.stringify({
        type: 'file-change',
        client: CLIENT_NAME,
        folder: folderName,
        path: relPath,
        event: 'change',           // or 'add' – doesn't matter, both trigger write
        content,
        mtime: Math.floor(stat.mtimeMs)
      }))
    } catch (e) {
    }
  }

  return (data) => {
    let msg
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }

    // 1. New peer announced → send him our file lists for shared folders
    if (msg.type === 'init' && msg.client !== CLIENT_NAME) {
      console.log(`Peer online → ${msg.client}`)
      msg.folders.forEach(folderName => {
        if (folderMap[folderName]) {
          sendFileTree(ws, CLIENT_NAME, folderName, folderMap[folderName])
        }
      })
    }

    // 2. Received file-list from someone → compare & sync both ways
    if (msg.type === 'file-list') {
      const localRoot = folderMap[msg.folder]
      if (!localRoot) return

      const folderName = msg.folder
      const toPush = []

      // Walk through remote file list
      msg.files.forEach(remoteFile => {
        const localPath = path.join(localRoot, remoteFile.path)
        try {
          const localStat = fs.statSync(localPath)
          // Remote is newer → we already pull it via request-files (previous version)
          if (Math.floor(localStat.mtimeMs) > remoteFile.mtime) {
            toPush.push(remoteFile.path)
          }
        } catch (e) {
          // File doesn't exist locally → remote has it → will be pulled automatically
          // But if WE have it locally under same name? No — we only walk remote list
          toPush.push(remoteFile.path)
        }
      })

      // Also: check OUR local files that remote doesn't have or are newer
      const remotePaths = new Set(msg.files.map(f => f.path))
      const walkLocal = (dir, base = '') => {
        for (const item of fs.readdirSync(dir)) {
          const full = path.join(dir, item)
          const rel = path.join(base, item)
          const stat = fs.statSync(full)

          if (stat.isDirectory()) {
            walkLocal(full, rel)
          } else {
            if (!remotePaths.has(rel)) {
              toPush.push(rel)
            } else {
              const remoteFile = msg.files.find(f => f.path === rel)
              if (Math.floor(stat.mtimeMs) > remoteFile.mtime) {
                toPush.push(rel)
              }
            }
          }
        }

        walkLocal(localRoot)

        // Push everything we have newer or missing on their side
        toPush.forEach(p => pushFile(folderName, p))
      }
    }

    // 3–6. Keep all other handlers unchanged (request-files, file-content, file-change, etc.)
    if (msg.type === 'request-files' && msg.from === CLIENT_NAME) {
      const root = folderMap[msg.folder]
      if (!root) return
      msg.paths.forEach(p => {
        pushFile(msg.folder, p)
      })
    }

    if (msg.type === 'file-change') {
      applyRemoteFileChange(msg, folderMap)
    }

    if (msg.type === 'file-content') {
      const root = folderMap[msg.folder]
      if (root) {
        const full = path.join(root, msg.path)
        fs.mkdirSync(path.dirname(full), {recursive: true})
        fs.writeFileSync(full, msg.content, 'utf8')
        console.log(`↓ pulled ${msg.folder}/${msg.path}`)
      }
    }
  }
}
