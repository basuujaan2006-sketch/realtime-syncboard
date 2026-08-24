import React, { useRef, useCallback } from 'react';
import StickyNote from './StickyNote';
import RemoteCursor from './RemoteCursor';
import { AlertTriangle } from 'lucide-react';

export default function Board({
  notes,
  remoteCursors,
  currentClientId,
  onUpdateNote,
  onMoveNote,
  onDeleteNote,
  onCursorMove,
  conflicts,
  conflictedNoteIds
}) {
  const boardRef = useRef(null);

  // Capture all pointer movement relative to board container origin
  const handlePointerMove = useCallback((e) => {
    if (!boardRef.current) return;
    const rect = boardRef.current.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    // Only emit if inside board bounds
    if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
      onCursorMove(x, y);
    }
  }, [onCursorMove]);

  return (
    <div
      ref={boardRef}
      className="board-container"
      onPointerMove={handlePointerMove}
    >
      {/* Empty State Overlay */}
      {notes.length === 0 && (
        <div className="empty-board-state">
          <div className="empty-icon">📌</div>
          <h3 className="empty-title">SyncBoard Canvas is Empty</h3>
          <p className="empty-subtitle">
            Click <strong>"New Note"</strong> in the header bar above to create a real-time collaborative sticky note!
          </p>
        </div>
      )}

      {/* Sticky Notes Layer */}
      {notes.map((note) => (
        <StickyNote
          key={note.id}
          note={note}
          onUpdateNote={onUpdateNote}
          onMoveNote={onMoveNote}
          onDeleteNote={onDeleteNote}
          isConflicted={conflictedNoteIds.includes(note.id)}
        />
      ))}

      {/* Remote Cursors Overlay */}
      {Object.entries(remoteCursors).map(([peerId, cursorData]) => {
        if (peerId === currentClientId) return null;
        return (
          <RemoteCursor
            key={peerId}
            userName={cursorData.userName}
            userColor={cursorData.userColor}
            x={cursorData.x}
            y={cursorData.y}
          />
        );
      })}

      {/* Conflict & Toast Notification Overlay */}
      <div className="toast-container">
        {conflicts.map((conf) => (
          <div key={conf.id} className="toast toast-conflict">
            <AlertTriangle size={18} />
            <div>
              <strong>Concurrent Edit Conflict:</strong>
              <div>{conf.message}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
