import http from 'http';
import express from 'express';
import cors from 'cors';
import { loadState, saveStateImmediate } from './persistence.js';
import { initStateManager, getAllNotes } from './stateManager.js';
import { initWebSocketServer } from './websocket.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  // Load persistent state from state.json
  const initialData = await loadState();
  initStateManager(initialData.notes || []);

  const app = express();
  app.use(cors());
  app.use(express.json());

  // HTTP Health & WebSocket Endpoint Status
  app.get(['/api/health', '/api/ws'], (req, res) => {
    res.json({
      status: 'ok',
      service: 'SyncBoard Server',
      endpoint: '/api/ws',
      timestamp: new Date().toISOString(),
      notesCount: getAllNotes().length
    });
  });

  // Create HTTP server & attach WebSocket server
  const server = http.createServer(app);
  initWebSocketServer(server);

  server.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 SyncBoard Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server active on ws://localhost:${PORT}`);
    console.log(`==================================================`);
  });

  // Handle graceful shutdown
  const handleExit = async (signal) => {
    console.log(`\n[Server] Received ${signal}, saving state before exit...`);
    await saveStateImmediate(getAllNotes());
    process.exit(0);
  };

  process.on('SIGINT', () => handleExit('SIGINT'));
  process.on('SIGTERM', () => handleExit('SIGTERM'));
}

bootstrap().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
