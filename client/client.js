import WebSocket from 'ws';
import crypto from 'crypto';
import path from 'path';
import { initWatching } from './init.js';
import { createMessageHandler } from './handlers.js';

const SERVER_URL = 'wss://nodejs-socked-proxy.onrender.com';
const CLIENT_NAME = `Client-${crypto.randomUUID().slice(0, 8)}`;

const WATCHED_DIRS = [
  '/Users/lubino/Developer/gp/gpap-core'
];

// Map: folderName → full local path
const folderMap = {};
WATCHED_DIRS.forEach(dir => {
  folderMap[path.basename(path.normalize(dir))] = path.normalize(dir);
});

const ws = new WebSocket(SERVER_URL);
ws.isAlive = false;

ws.on('open', () => {
  ws.isAlive = true;
  console.log(`[${CLIENT_NAME}] Connected`);
  const watchers = initWatching(ws, CLIENT_NAME, WATCHED_DIRS);
  ws.on('message', createMessageHandler(CLIENT_NAME, folderMap, ws));

  process.on('SIGINT', () => {
    watchers.forEach(w => w.close());
    ws.close();
    process.exit();
  });
});
