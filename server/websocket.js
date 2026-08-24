import { WebSocketServer, WebSocket } from 'ws';
import { getAllNotes, createNote, updateNote, moveNote, deleteNote } from './stateManager.js';

const clients = new Map(); // ws -> { clientId, userName, userColor, cursor }
let userCounter = 1;

const COLOR_PALETTE = [
  '#FF6B6B', '#4D96FF', '#6BCB77', '#FFD93D', 
  '#9B51E0', '#FF884B', '#00C9A7', '#C400FF'
];

/**
 * Initializes WebSocket Server attached to HTTP server.
 * @param {import('http').Server} server 
 */
export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  console.log('[WebSocket] Server initialized and listening for upgrades');

  wss.on('connection', (ws, req) => {
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
    console.log(`[WebSocket] Connected: ${userName} (${clientId}) | Total online: ${clients.size}`);

    // Send initial state to the newly connected client
    const activeClientsList = Array.from(clients.values()).map(c => ({
      clientId: c.clientId,
      userName: c.userName,
      userColor: c.userColor,
      cursor: c.cursor
    }));

    sendToClient(ws, {
      type: 'INITIAL_STATE',
      clientId: clientId,
      userName: userName,
      userColor: userColor,
      notes: getAllNotes(),
      onlineUsers: activeClientsList,
      onlineCount: clients.size
    });

    // Broadcast user joined to other clients
    broadcastToOthers(ws, {
      type: 'USER_JOINED',
      clientId: clientId,
      userName: userName,
      userColor: userColor,
      onlineCount: clients.size,
      onlineUsers: activeClientsList
    });

    // Message router
    ws.on('message', (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString());
        handleClientMessage(ws, message);
      } catch (err) {
        console.error('[WebSocket] Invalid JSON message received:', err.message);
        sendToClient(ws, {
          type: 'ERROR',
          message: 'Malformed JSON payload'
        });
      }
    });

    // Disconnect handler
    ws.on('close', () => {
      const disconnectedInfo = clients.get(ws);
      clients.delete(ws);

      if (disconnectedInfo) {
        console.log(`[WebSocket] Disconnected: ${disconnectedInfo.userName} (${disconnectedInfo.clientId}) | Remaining online: ${clients.size}`);
        
        const remainingClientsList = Array.from(clients.values()).map(c => ({
          clientId: c.clientId,
          userName: c.userName,
          userColor: c.userColor,
          cursor: c.cursor
        }));

        broadcastAll({
          type: 'USER_LEFT',
          clientId: disconnectedInfo.clientId,
          userName: disconnectedInfo.userName,
          onlineCount: clients.size,
          onlineUsers: remainingClientsList
        });
      }
    });

    ws.on('error', (err) => {
      console.error(`[WebSocket] Socket error for ${clientInfo.userName}:`, err.message);
    });
  });

  return wss;
}

/**
 * Routes and handles incoming client WS messages safely.
 */
function handleClientMessage(ws, message) {
  const clientInfo = clients.get(ws);
  if (!clientInfo) return;

  const { type, operationId, clientId, note, noteId, cursor } = message;

  switch (type) {
    case 'CONNECT': {
      // Re-acknowledge state on client connect signal if needed
      sendToClient(ws, {
        type: 'STATE_SYNC',
        notes: getAllNotes(),
        onlineCount: clients.size
      });
      break;
    }

    case 'CREATE_NOTE': {
      if (!note) return;
      const created = createNote(note, clientInfo.clientId);
      broadcastAll({
        type: 'NOTE_CREATED',
        operationId: operationId || `op-${Date.now()}`,
        clientId: clientInfo.clientId,
        note: created
      });
      break;
    }

    case 'UPDATE_NOTE': {
      if (!note || !note.id) return;
      const result = updateNote(note, clientInfo.clientId);

      if (result.success) {
        broadcastAll({
          type: 'NOTE_UPDATED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          note: result.note
        });
      } else if (result.conflict) {
        // Send conflict alert to sender
        sendToClient(ws, {
          type: 'CONFLICT',
          operationId: operationId,
          noteId: note.id,
          serverNote: result.serverNote,
          clientVersion: result.clientVersion,
          message: result.message
        });

        // Broadcast current authoritative state to keep all clients in sync
        broadcastAll({
          type: 'STATE_SYNC',
          notes: getAllNotes(),
          onlineCount: clients.size
        });
      }
      break;
    }

    case 'MOVE_NOTE': {
      if (!note || !note.id) return;
      const result = moveNote(note, clientInfo.clientId);

      if (result.success) {
        // Broadcast move to all clients
        broadcastAll({
          type: 'NOTE_MOVED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          note: result.note
        });
      } else if (result.conflict) {
        sendToClient(ws, {
          type: 'CONFLICT',
          operationId: operationId,
          noteId: note.id,
          serverNote: result.serverNote,
          message: result.message
        });
        sendToClient(ws, {
          type: 'STATE_SYNC',
          notes: getAllNotes(),
          onlineCount: clients.size
        });
      }
      break;
    }

    case 'DELETE_NOTE': {
      const targetId = noteId || (note && note.id);
      if (!targetId) return;

      const result = deleteNote(targetId);
      if (result.success) {
        broadcastAll({
          type: 'NOTE_DELETED',
          operationId: operationId || `op-${Date.now()}`,
          clientId: clientInfo.clientId,
          noteId: targetId
        });
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

    case 'REQUEST_STATE': {
      sendToClient(ws, {
        type: 'STATE_SYNC',
        notes: getAllNotes(),
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

    default:
      console.warn(`[WebSocket] Unknown message type: ${type}`);
  }
}

/**
 * Sends JSON message to a single WebSocket client safely.
 */
function sendToClient(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Broadcasts JSON message to all connected clients.
 */
function broadcastAll(payload) {
  const json = JSON.stringify(payload);
  for (const [clientWs] of clients) {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(json);
    }
  }
}

/**
 * Broadcasts JSON message to all connected clients EXCEPT sender.
 */
function broadcastToOthers(senderWs, payload) {
  const json = JSON.stringify(payload);
  for (const [clientWs] of clients) {
    if (clientWs !== senderWs && clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(json);
    }
  }
}
