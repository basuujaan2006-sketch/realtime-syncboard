import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  ensureInitialized,
  getAllNotes,
  createNote,
  updateNote,
  moveNote,
  deleteNote,
  syncExternalNotes
} from './stateManager.js';
import { publishCrossInstanceEvent, fetchLastEvent, loadPersistentNotes } from './store.js';

const clients = new Map(); // ws -> { clientId, userName, userColor, cursor }
let userCounter = 1;
let lastSeenEventId = '';

const COLOR_PALETTE = [
  '#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', 
  '#9B51E0', '#FF884B', '#00C9A7', '#C400FF'
];

// Create HTTP server instance for Vercel Function
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check & endpoint verification
  await ensureInitialized();
  const notes = await getAllNotes();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    service: 'SyncBoard Vercel WebSocket Function',
    endpoint: '/api/ws',
    onlineConnectionsInInstance: clients.size,
    notesCount: notes.length,
    timestamp: new Date().toISOString()
  }));
});

// Attach WebSocketServer to HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws) => {
  await ensureInitialized();

  const clientId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const userName = `User ${userCounter++}`;
  const userColor = COLOR_PALETTE[(userCounter - 1) % COLOR_PALETTE.length];

  const clientInfo = {
    clientId,
    userName,
    userColor,
    cursor: { x: 0, y: 0 }
  };

  clients.set(ws, clientInfo);
  console.log(`[Vercel WS] Connected: ${userName} (${clientId}) | Instance online: ${clients.size}`);

  const activeClientsList = Array.from(clients.values()).map(c => ({
    clientId: c.clientId,
    userName: c.userName,
    userColor: c.userColor,
    cursor: c.cursor
  }));

  const allNotes = await getAllNotes();

  // Send INITIAL_STATE to client
  sendToClient(ws, {
    type: 'INITIAL_STATE',
    clientId: clientId,
    userName: userName,
    userColor: userColor,
    notes: allNotes,
    onlineUsers: activeClientsList,
    onlineCount: clients.size
  });

  // Broadcast USER_JOINED
  broadcastToOthers(ws, {
    type: 'USER_JOINED',
    clientId: clientId,
    userName: userName,
    userColor: userColor,
    onlineCount: clients.size,
    onlineUsers: activeClientsList
  });

  // Message router
  ws.on('message', async (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());
      await handleClientMessage(ws, message);
    } catch (err) {
      console.error('[Vercel WS] Invalid JSON message:', err.message);
      sendToClient(ws, {
        type: 'ERROR',
        message: 'Malformed JSON payload'
      });
    }
  });

  // Disconnect handler
  ws.on('close', () => {
    const disconnected = clients.get(ws);
    clients.delete(ws);

    if (disconnected) {
      console.log(`[Vercel WS] Disconnected: ${disconnected.userName} | Remaining in instance: ${clients.size}`);
      const remaining = Array.from(clients.values()).map(c => ({
        clientId: c.clientId,
        userName: c.userName,
        userColor: c.userColor,
        cursor: c.cursor
      }));

      broadcastAll({
        type: 'USER_LEFT',
        clientId: disconnected.clientId,
        userName: disconnected.userName,
        onlineCount: clients.size,
        onlineUsers: remaining
      });
    }
  });

  ws.on('error', (err) => {
    console.error('[Vercel WS] Socket error:', err.message);
  });
});

/**
 * Routes and executes incoming WebSocket messages.
 */
async function handleClientMessage(ws, message) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const { type, operationId, note, noteId, cursor } = message;

  switch (type) {
    case 'CONNECT':
    case 'REQUEST_STATE': {
      const notes = await getAllNotes();
      sendToClient(ws, {
        type: 'STATE_SYNC',
        notes: notes,
        onlineCount: clients.size,
        onlineUsers: Array.from(clients.values()).map(c => ({
          clientId: c.clientId,
          userName: c.userName,
          userColor: c.userColor,
          cursor: c.cursor
        }))
      });
      break;
    }

    case 'CREATE_NOTE': {
      if (!note) return;
      const created = await createNote(note, clientInfo.clientId);
      const event = {
        type: 'NOTE_CREATED',
        operationId: operationId || `op-${Date.now()}`,
        clientId: clientInfo.clientId,
        note: created
      };
      broadcastAll(event);
      await publishCrossInstanceEvent(event);
      break;
    }

    case 'UPDATE_NOTE': {
      if (!note || !note.id) return;
      const result = await updateNote(note, clientInfo.clientId);

      if (result.success) {
        const event = {
          type: 'NOTE_UPDATED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          note: result.note
        };
        broadcastAll(event);
        await publishCrossInstanceEvent(event);
      } else if (result.conflict) {
        sendToClient(ws, {
          type: 'CONFLICT',
          operationId: operationId,
          noteId: note.id,
          serverNote: result.serverNote,
          clientVersion: result.clientVersion,
          message: result.message
        });
        const notes = await getAllNotes();
        broadcastAll({
          type: 'STATE_SYNC',
          notes: notes,
          onlineCount: clients.size
        });
      }
      break;
    }

    case 'MOVE_NOTE': {
      if (!note || !note.id) return;
      const result = await moveNote(note, clientInfo.clientId);

      if (result.success) {
        const event = {
          type: 'NOTE_MOVED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          note: result.note
        };
        broadcastAll(event);
        await publishCrossInstanceEvent(event);
      }
      break;
    }

    case 'DELETE_NOTE': {
      const targetId = noteId || (note && note.id);
      if (!targetId) return;

      const result = await deleteNote(targetId);
      if (result.success) {
        const event = {
          type: 'NOTE_DELETED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          noteId: targetId
        };
        broadcastAll(event);
        await publishCrossInstanceEvent(event);
      }
      break;
    }

    case 'CURSOR_MOVE': {
      if (cursor && typeof cursor.x === 'number' && typeof cursor.y === 'number') {
        clientInfo.cursor = { x: cursor.x, y: cursor.y };
        broadcastToOthers(ws, {
          type: 'CURSOR_UPDATE',
          clientId: clientInfo.clientId,
          userName: clientInfo.userName,
          userColor: clientInfo.userColor,
          x: cursor.x,
          y: cursor.y
        });
      }
      break;
    }

    default:
      console.warn(`[Vercel WS] Unknown message type: ${type}`);
  }
}

/**
 * Periodically polls for cross-instance events if Redis is configured.
 */
setInterval(async () => {
  if (clients.size === 0) return;
  const event = await fetchLastEvent(lastSeenEventId);
  if (event && event.eventId && event.eventId !== lastSeenEventId) {
    lastSeenEventId = event.eventId;
    // Broadcast cross-instance event to local clients if originated from another instance
    if (event.type === 'NOTE_CREATED' || event.type === 'NOTE_UPDATED' || event.type === 'NOTE_MOVED' || event.type === 'NOTE_DELETED') {
      const latestNotes = await loadPersistentNotes();
      syncExternalNotes(latestNotes);
      broadcastAll(event);
    }
  }
}, 1000);

function sendToClient(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastAll(payload) {
  const json = JSON.stringify(payload);
  for (const [clientWs] of clients) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(json);
    }
  }
}

function broadcastToOthers(senderWs, payload) {
  const json = JSON.stringify(payload);
  for (const [clientWs] of clients) {
    if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(json);
    }
  }
}

// Export the server for Vercel Function runtime
export default server;
