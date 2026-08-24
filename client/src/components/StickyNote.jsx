import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Trash2, GripHorizontal } from 'lucide-react';
import { NOTE_COLORS, throttle, debounce } from '../utils/ids';

// How long (ms) after the user stops typing before we flush to the server
const TEXT_DEBOUNCE_MS = 400;

// How long (ms) to keep blocking remote overwrites after the last keystroke
const TYPING_GRACE_MS = 800;

export default function StickyNote({
  note,
  onUpdateNote,
  onMoveNote,
  onDeleteNote,
  isConflicted
}) {
  // ─── Local text state ──────────────────────────────────────────────────────
  // Decoupled from note.text so keystrokes never re-render from the server prop
  const [localText, setLocalText] = useState(note.text);

  // True while the user is actively typing (suppresses remote overwrites)
  const isTypingRef = useRef(false);
  const typingGraceTimerRef = useRef(null);

  // Always keep a ref to the latest server version so the debounced flush
  // sends the right version number even if note.version changed between
  // keystrokes and the debounce firing.
  const noteVersionRef = useRef(note.version);
  useEffect(() => { noteVersionRef.current = note.version; }, [note.version]);

  // ─── Remote text sync guard ─────────────────────────────────────────────────
  // Only apply remote text changes while the user is NOT typing.
  useEffect(() => {
    if (!isTypingRef.current) {
      setLocalText(note.text);
    }
  }, [note.text]);

  // ─── Debounced server flush ─────────────────────────────────────────────────
  // One debounce instance per note mount. Rebuilt if onUpdateNote changes.
  const debouncedSyncRef = useRef(null);
  useEffect(() => {
    const fn = debounce((noteId, noteColor, text) => {
      onUpdateNote({
        id: noteId,
        text,
        color: noteColor,
        version: noteVersionRef.current,
        isTextSync: true
      });
    }, TEXT_DEBOUNCE_MS);
    debouncedSyncRef.current = fn;
    return () => fn.cancel();
  }, [onUpdateNote]);

  // ─── Dragging ───────────────────────────────────────────────────────────────
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Handle Dragging via Header / Card
  const handleMouseDown = (e) => {
    // Ignore drag trigger when clicking buttons or textarea or color dots
    if (
      e.target.tagName === 'TEXTAREA' ||
      e.target.tagName === 'BUTTON' ||
      e.target.closest('button') ||
      e.target.classList.contains('color-dot')
    ) {
      return;
    }

    e.preventDefault();
    setIsDragging(true);

    dragOffsetRef.current = {
      x: e.clientX - note.x,
      y: e.clientY - note.y
    };
  };

  const throttledMoveRef = useRef(null);

  useEffect(() => {
    throttledMoveRef.current = throttle((noteId, newX, newY, version) => {
      onMoveNote(noteId, newX, newY, version);
    }, 30);
  }, [onMoveNote]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const newX = Math.max(0, e.clientX - dragOffsetRef.current.x);
      const newY = Math.max(0, e.clientY - dragOffsetRef.current.y);

      if (throttledMoveRef.current) {
        throttledMoveRef.current(note.id, newX, newY, note.version);
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, note.id, note.version]);

  // ─── Text change — optimistic UI + debounced server sync ──────────────────
  const handleTextChange = useCallback((e) => {
    const newText = e.target.value;

    // 1. Instant local update (zero-lag UI)
    setLocalText(newText);

    // 2. Mark typing; reset grace window
    isTypingRef.current = true;
    clearTimeout(typingGraceTimerRef.current);
    typingGraceTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, TYPING_GRACE_MS);

    // 3. Schedule ONE server push after the user pauses
    if (debouncedSyncRef.current) {
      debouncedSyncRef.current(note.id, note.color, newText);
    }
  }, [note.id, note.color]);

  // Flush immediately when textarea loses focus so no text is lost
  const handleBlur = useCallback(() => {
    if (debouncedSyncRef.current) debouncedSyncRef.current.cancel();
    isTypingRef.current = false;
    clearTimeout(typingGraceTimerRef.current);
    onUpdateNote({
      id: note.id,
      text: localText,
      color: note.color,
      version: noteVersionRef.current,
      isTextSync: true
    });
  }, [note.id, note.color, localText, onUpdateNote]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debouncedSyncRef.current) debouncedSyncRef.current.cancel();
      clearTimeout(typingGraceTimerRef.current);
    };
  }, []);

  // ─── Colour change (immediate, no debounce) ─────────────────────────────────
  const handleColorChange = (newColor) => {
    if (newColor === note.color) return;
    onUpdateNote({
      id: note.id,
      text: note.text,
      color: newColor,
      version: note.version
    });
  };

  return (
    <div
      className={`sticky-note ${note.color || 'yellow'} ${isDragging ? 'dragging' : ''} ${isConflicted ? 'conflict-flash' : ''}`}
      style={{
        transform: `translate3d(${note.x}px, ${note.y}px, 0)`
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Note Header / Drag Handle */}
      <div className="note-header">
        <div className="note-drag-indicator">
          <GripHorizontal size={14} />
          <span>Note</span>
        </div>

        <div className="note-header-actions">
          <span className="version-badge" title={`Server note version: v${note.version}`}>
            v{note.version}
          </span>
          <button
            className="btn-note-delete"
            title="Delete Note"
            onClick={() => onDeleteNote(note.id)}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Note Content Area */}
      <div className="note-body">
        <textarea
          className="note-textarea"
          value={localText}
          onChange={handleTextChange}
          onBlur={handleBlur}
          placeholder="Type your note here..."
        />
      </div>

      {/* Color Selector Bar */}
      <div className="color-picker-bar">
        {NOTE_COLORS.map((col) => (
          <div
            key={col}
            className={`color-dot ${col} ${note.color === col ? 'active' : ''}`}
            onClick={() => handleColorChange(col)}
            title={`Set color to ${col}`}
          />
        ))}
      </div>
    </div>
  );
}
