import { useEffect, useRef, useState, useCallback } from 'react';
import { throttle } from '../utils/ids';

const getWsUrl = () => {
  // 1. If explicit environment variable is provided (e.g. override in Vercel settings)
  const envUrl = import.meta.env?.VITE_WS_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim() !== '') {
    let cleanUrl = envUrl.trim();
    if (typeof window !== 'undefined' && window.location.protocol === 'https:' && cleanUrl.startsWith('ws://')) {
      cleanUrl = cleanUrl.replace(/^ws:\/\//i, 'wss://');
    }
    return cleanUrl;
  }

  // 2. Browser runtime environment check (Vercel Functions WebSocket endpoint /api/ws)
  if (typeof window !== 'undefined' && window.location) {
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    
    // In both Vite dev proxy and Vercel production deployment, connect to same-origin /api/ws
    return `${protocol}//${window.location.host}/api/ws`;
  }

  // Fallback
  return 'ws://localhost:3000/api/ws';
};

const RECONNECT_INTERVAL = 3000;

export function useWebSocket(onMessageCallback) {
  const [status, setStatus] = useState('DISCONNECTED'); // 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED'
  const [clientId, setClientId] = useState('');
  const [userName, setUserName] = useState('');
  const [userColor, setUserColor] = useState('#6366f1');
  const [onlineCount, setOnlineCount] = useState(1);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const onMessageRef = useRef(onMessageCallback);

  // Keep latest message handler ref
  useEffect(() => {
    onMessageRef.current = onMessageCallback;
  }, [onMessageCallback]);

  // Connect function
  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const wsUrl = getWsUrl();
    setStatus('CONNECTING');
    console.log('[useWebSocket] Connecting to:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useWebSocket] Connected to WebSocket server');
      setStatus('CONNECTED');
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      // Request latest state synchronization upon connect/reconnect
      try {
        ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));
      } catch (err) {
        console.error('[useWebSocket] Error sending REQUEST_STATE on open:', err);
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);

        // Update global socket state metadata
        if (message.type === 'INITIAL_STATE') {
          if (message.clientId) setClientId(message.clientId);
          if (message.userName) setUserName(message.userName);
          if (message.userColor) setUserColor(message.userColor);
          if (message.onlineCount) setOnlineCount(message.onlineCount);
          if (message.onlineUsers) setOnlineUsers(message.onlineUsers);
        } else if (message.type === 'USER_JOINED' || message.type === 'USER_LEFT') {
          if (message.onlineCount) setOnlineCount(message.onlineCount);
          if (message.onlineUsers) setOnlineUsers(message.onlineUsers);
        } else if (message.type === 'STATE_SYNC') {
          if (message.onlineCount) setOnlineCount(message.onlineCount);
          if (message.onlineUsers) setOnlineUsers(message.onlineUsers);
        }

        // Trigger external callback
        if (onMessageRef.current) {
          onMessageRef.current(message);
        }
      } catch (err) {
        console.error('[useWebSocket] Error handling incoming message:', err);
      }
    };

    ws.onclose = (event) => {
      console.warn(`[useWebSocket] Socket closed (code: ${event.code}). Attempting reconnect in ${RECONNECT_INTERVAL / 1000}s...`);
      setStatus('DISCONNECTED');
      wsRef.current = null;

      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_INTERVAL);
      }
    };

    ws.onerror = (err) => {
      console.error('[useWebSocket] Socket error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect trigger on unmount
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send message over WebSocket
  const sendMessage = useCallback((payload) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      console.warn('[useWebSocket] Cannot send message: Socket is not open', payload);
    }
  }, []);

  // Throttled cursor position dispatcher (50ms limit)
  const sendCursorMoveThrottled = useRef(
    throttle((x, y, currentClientId) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'CURSOR_MOVE',
          clientId: currentClientId,
          cursor: { x, y }
        }));
      }
    }, 50)
  ).current;

  const sendCursorMove = useCallback((x, y) => {
    sendCursorMoveThrottled(x, y, clientId);
  }, [clientId, sendCursorMoveThrottled]);

  return {
    status,
    clientId,
    userName,
    userColor,
    onlineCount,
    onlineUsers,
    sendMessage,
    sendCursorMove
  };
}
