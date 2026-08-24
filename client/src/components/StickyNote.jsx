import React, { useState, useRef, useEffect } from 'react';
import { Trash2, GripHorizontal } from 'lucide-react';
import { NOTE_COLORS, throttle } from '../utils/ids';

export default function StickyNote({
  note,
  onUpdateNote,
  onMoveNote,
  onDeleteNote,
  isConflicted
}) {
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

  // Handle Text Change
  const handleTextChange = (e) => {
    const newText = e.target.value;
    onUpdateNote({
      id: note.id,
      text: newText,
      color: note.color,
      version: note.version
    });
  };

  // Handle Color Change
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
          value={note.text}
          onChange={handleTextChange}
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
