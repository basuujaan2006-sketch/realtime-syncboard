import React, { useState, useCallback } from 'react';
import Navbar from './components/Navbar';
import Board from './components/Board';
import { useWebSocket } from './hooks/useWebSocket';
import { generateId } from './utils/ids';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const [conflictedNoteIds, setConflictedNoteIds] = useState([]);

  // Handler for WebSocket incoming events
  const handleWebSocketMessage = useCallback((message) => {
    const { type, note, noteId, serverNote, clientId: msgClientId, userName, userColor, x, y, notes: syncNotes } = message;

    switch (type) {
      case 'INITIAL_STATE':
      case 'STATE_SYNC': {
        if (Array.isArray(syncNotes)) {
          setNotes(syncNotes);
        }
        if (Array.isArray(message.onlineUsers)) {
          setRemoteCursors((prev) => {
            const next = { ...prev };
            message.onlineUsers.forEach((u) => {
              if (u.clientId) {
                next[u.clientId] = {
                  userName: u.userName,
                  userColor: u.userColor,
                  x: u.cursor?.x || 0,
                  y: u.cursor?.y || 0
                };
              }
            });
            return next;
          });
        }
        break;
      }

      case 'USER_JOINED': {
        if (msgClientId) {
          setRemoteCursors((prev) => ({
            ...prev,
            [msgClientId]: {
              userName,
              userColor,
              x: typeof x === 'number' ? x : 0,
              y: typeof y === 'number' ? y : 0
            }
          }));
        }
        break;
      }

      case 'NOTE_CREATED': {
        if (note && note.id) {
          setNotes((prev) => {
            const exists = prev.some((n) => n.id === note.id);
            if (exists) {
              return prev.map((n) => (n.id === note.id ? note : n));
            }
            return [...prev, note];
          });
        }
        break;
      }

      case 'NOTE_UPDATED':
      case 'NOTE_MOVED': {
        if (note && note.id) {
          setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
        }
        break;
      }

      case 'NOTE_DELETED': {
        const targetId = noteId || (note && note.id);
        if (targetId) {
          setNotes((prev) => prev.filter((n) => n.id !== targetId));
        }
        break;
      }

      case 'CURSOR_UPDATE': {
        if (msgClientId) {
          setRemoteCursors((prev) => ({
            ...prev,
            [msgClientId]: { userName, userColor, x, y }
          }));
        }
        break;
      }

      case 'USER_LEFT': {
        if (msgClientId) {
          setRemoteCursors((prev) => {
            const updated = { ...prev };
            delete updated[msgClientId];
            return updated;
          });
        }
        break;
      }

      case 'CONFLICT': {
        const targetNote = serverNote || (noteId ? notes.find((n) => n.id === noteId) : null);
        
        // 1. Synchronize local note with authoritative server version
        if (targetNote && targetNote.id) {
          setNotes((prev) => prev.map((n) => (n.id === targetNote.id ? targetNote : n)));
          
          // 2. Trigger conflict visual flash on note
          setConflictedNoteIds((prev) => [...prev, targetNote.id]);
          setTimeout(() => {
            setConflictedNoteIds((prev) => prev.filter((id) => id !== targetNote.id));
          }, 1600);
        }

        // 3. Add floating conflict notification toast
        const toastId = generateId('toast');
        const alertMsg = message.message || 'Concurrent edit conflict detected. State resynchronized with server.';
        setConflicts((prev) => [...prev, { id: toastId, message: alertMsg, noteId: targetNote?.id }]);

        setTimeout(() => {
          setConflicts((prev) => prev.filter((c) => c.id !== toastId));
        }, 4500);
        break;
      }

      default:
        break;
    }
  }, [notes]);

  const {
    status,
    clientId,
    userName,
    userColor,
    onlineCount,
    sendMessage,
    sendCursorMove
  } = useWebSocket(handleWebSocketMessage);

  // OPTIMISTIC ACTIONS

  // 1. Create Note
  const handleAddNote = useCallback(() => {
    const newNote = {
      id: generateId('note'),
      text: '',
      x: 100 + Math.floor(Math.random() * 300),
      y: 100 + Math.floor(Math.random() * 200),
      color: 'yellow',
      version: 1
    };

    // Optimistic local update
    setNotes((prev) => [...prev, newNote]);

    // Send over WebSocket
    sendMessage({
      type: 'CREATE_NOTE',
      operationId: generateId('op'),
      clientId: clientId,
      note: newNote
    });
  }, [clientId, sendMessage]);

  // 2. Update Note (Text / Color)
  const handleUpdateNote = useCallback((updatedNote) => {
    // Optimistic local update
    setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? { ...n, ...updatedNote } : n)));

    // Send over WebSocket
    sendMessage({
      type: 'UPDATE_NOTE',
      operationId: generateId('op'),
      clientId: clientId,
      note: updatedNote
    });
  }, [clientId, sendMessage]);

  // 3. Move Note Position
  const handleMoveNote = useCallback((id, x, y, version) => {
    // Optimistic local update
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));

    // Send over WebSocket
    sendMessage({
      type: 'MOVE_NOTE',
      operationId: generateId('op'),
      clientId: clientId,
      note: { id, x, y, version }
    });
  }, [clientId, sendMessage]);

  // 4. Delete Note
  const handleDeleteNote = useCallback((id) => {
    // Optimistic local update
    setNotes((prev) => prev.filter((n) => n.id !== id));

    // Send over WebSocket
    sendMessage({
      type: 'DELETE_NOTE',
      operationId: generateId('op'),
      clientId: clientId,
      noteId: id
    });
  }, [clientId, sendMessage]);

  return (
    <>
      <Navbar
        status={status}
        onlineCount={onlineCount}
        userName={userName}
        userColor={userColor}
        onAddNote={handleAddNote}
      />
      <Board
        notes={notes}
        remoteCursors={remoteCursors}
        currentClientId={clientId}
        onUpdateNote={handleUpdateNote}
        onMoveNote={handleMoveNote}
        onDeleteNote={handleDeleteNote}
        onCursorMove={sendCursorMove}
        conflicts={conflicts}
        conflictedNoteIds={conflictedNoteIds}
      />
    </>
  );
}
