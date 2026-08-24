import React, { useState, useCallback, useRef } from 'react';
import Navbar from './components/Navbar';
import Board from './components/Board';
import { useWebSocket } from './hooks/useWebSocket';
import { generateId } from './utils/ids';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [remoteCursors, setRemoteCursors] = useState({});
  const [conflicts, setConflicts] = useState([]);
  const [conflictedNoteIds, setConflictedNoteIds] = useState([]);

  // Track operationIds we recently sent so we can suppress the CONFLICT toast
  // that the server echoes back for our own operations (self-conflict suppression).
  // Each entry is auto-expired after 5 s.
  const pendingOpsRef = useRef(new Set());

  const trackSentOp = useCallback((opId) => {
    if (!opId) return;
    pendingOpsRef.current.add(opId);
    setTimeout(() => pendingOpsRef.current.delete(opId), 5000);
  }, []);

  // Track which noteIds the local user is currently editing.
  // StickyNote sets isTextSync:true on debounced flushes; we use this to know
  // when a note is "in flight" and should not be overwritten by a remote update.
  const localEditingRef = useRef(new Set()); // noteIds currently being typed into

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
          // Do NOT overwrite a note the local user is currently typing into.
          // Their debounced flush will reconcile with the server shortly.
          if (localEditingRef.current.has(note.id)) {
            // Still update the stored version ref so when they flush they send
            // the latest base version. We do this by updating everything except text.
            setNotes((prev) => prev.map((n) =>
              n.id === note.id
                ? { ...note, text: n.text }  // keep local text, take remote metadata
                : n
            ));
          } else {
            setNotes((prev) => prev.map((n) => (n.id === note.id ? note : n)));
          }
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
        // Suppress self-conflicts: if the operationId is one we recently sent,
        // this is just the server bouncing our own op back. Update the note
        // version silently but do NOT show the toast.
        const isSelfConflict = message.operationId && pendingOpsRef.current.has(message.operationId);

        const targetNote = serverNote || (noteId ? notes.find((n) => n.id === noteId) : null);
        
        if (targetNote && targetNote.id) {
          // Only overwrite local text if not actively typing
          if (localEditingRef.current.has(targetNote.id)) {
            // Preserve local text but adopt the authoritative version number
            setNotes((prev) => prev.map((n) =>
              n.id === targetNote.id
                ? { ...targetNote, text: n.text }
                : n
            ));
          } else {
            setNotes((prev) => prev.map((n) => (n.id === targetNote.id ? targetNote : n)));
          }

          if (!isSelfConflict) {
            // Flash the note border
            setConflictedNoteIds((prev) => [...prev, targetNote.id]);
            setTimeout(() => {
              setConflictedNoteIds((prev) => prev.filter((id) => id !== targetNote.id));
            }, 1600);
          }
        }

        if (!isSelfConflict) {
          // Show floating toast only for genuine concurrent conflicts
          const toastId = generateId('toast');
          const alertMsg = message.message || 'Concurrent edit conflict detected. State resynchronized with server.';
          setConflicts((prev) => [...prev, { id: toastId, message: alertMsg, noteId: targetNote?.id }]);
          setTimeout(() => {
            setConflicts((prev) => prev.filter((c) => c.id !== toastId));
          }, 4500);
        }
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
    const { isTextSync, ...notePayload } = updatedNote;

    // Mark this note as locally-editing so remote updates don't clobber it
    if (isTextSync) {
      localEditingRef.current.add(notePayload.id);
      // Clear the editing lock shortly after the server round-trip
      setTimeout(() => localEditingRef.current.delete(notePayload.id), 2000);
    }

    // Optimistic local update
    setNotes((prev) => prev.map((n) => (n.id === notePayload.id ? { ...n, ...notePayload } : n)));

    const opId = generateId('op');
    trackSentOp(opId);

    // Send over WebSocket
    sendMessage({
      type: 'UPDATE_NOTE',
      operationId: opId,
      clientId: clientId,
      note: notePayload
    });
  }, [clientId, sendMessage, trackSentOp]);

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
