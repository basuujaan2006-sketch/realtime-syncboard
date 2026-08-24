import { saveStateDebounced } from './persistence.js';

let notesMap = new Map();

/**
 * Initializes the state manager with loaded notes array.
 * @param {Array} initialNotes 
 */
export function initStateManager(initialNotes = []) {
  notesMap.clear();
  if (Array.isArray(initialNotes)) {
    initialNotes.forEach(note => {
      if (note && note.id) {
        notesMap.set(note.id, {
          id: String(note.id),
          text: String(note.text || ''),
          x: typeof note.x === 'number' ? note.x : 100,
          y: typeof note.y === 'number' ? note.y : 100,
          color: note.color || 'yellow',
          version: typeof note.version === 'number' ? note.version : 1,
          updatedAt: note.updatedAt || Date.now(),
          lastModifiedBy: note.lastModifiedBy || 'system'
        });
      }
    });
  }
  console.log(`[StateManager] Initialized with ${notesMap.size} note(s)`);
}

/**
 * Gets all current sticky notes as an array.
 * @returns {Array}
 */
export function getAllNotes() {
  return Array.from(notesMap.values());
}

/**
 * Gets a specific note by ID.
 * @param {string} noteId 
 * @returns {Object|null}
 */
export function getNoteById(noteId) {
  return notesMap.get(noteId) || null;
}

/**
 * Creates a new sticky note.
 * @param {Object} noteData 
 * @param {string} clientId 
 * @returns {Object} created note
 */
export function createNote(noteData, clientId) {
  const noteId = noteData.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const text = String(noteData.text || '').substring(0, 1000); // sanitize max 1000 chars
  
  const newNote = {
    id: noteId,
    text: text,
    x: typeof noteData.x === 'number' ? Math.max(0, noteData.x) : 120,
    y: typeof noteData.y === 'number' ? Math.max(0, noteData.y) : 120,
    color: noteData.color || 'yellow',
    version: 1,
    updatedAt: Date.now(),
    lastModifiedBy: clientId || 'unknown'
  };

  notesMap.set(noteId, newNote);
  saveStateDebounced(getAllNotes());
  return newNote;
}

/**
 * Updates a sticky note's content or color using version checking.
 * @param {Object} updateData { id, text, color, version }
 * @param {string} clientId 
 * @returns {Object} result { success, note, conflict, serverNote }
 */
export function updateNote(updateData, clientId) {
  const { id, text, color, version } = updateData;
  const existing = notesMap.get(id);

  if (!existing) {
    return { success: false, error: 'Note not found', noteId: id };
  }

  // Version Conflict Checking
  const clientVersion = typeof version === 'number' ? version : existing.version;

  if (clientVersion !== existing.version) {
    console.warn(`[StateManager] Version conflict on note ${id}: Client version=${clientVersion}, Server version=${existing.version}`);
    return {
      success: false,
      conflict: true,
      serverNote: { ...existing },
      clientVersion: clientVersion,
      message: `Conflict detected! Server version is ${existing.version}, but update was based on version ${clientVersion}.`
    };
  }

  // Update note and increment version
  if (typeof text === 'string') {
    existing.text = text.substring(0, 1000);
  }
  if (typeof color === 'string') {
    existing.color = color;
  }
  
  existing.version += 1;
  existing.updatedAt = Date.now();
  existing.lastModifiedBy = clientId || 'unknown';

  notesMap.set(id, existing);
  saveStateDebounced(getAllNotes());

  return {
    success: true,
    conflict: false,
    note: { ...existing }
  };
}

/**
 * Moves a sticky note's coordinates (x, y).
 * Updates position coordinates safely.
 * @param {Object} moveData { id, x, y, version }
 * @param {string} clientId 
 * @returns {Object}
 */
export function moveNote(moveData, clientId) {
  const { id, x, y } = moveData;
  const existing = notesMap.get(id);

  if (!existing) {
    return { success: false, error: 'Note not found', noteId: id };
  }

  existing.x = Math.max(0, typeof x === 'number' ? x : existing.x);
  existing.y = Math.max(0, typeof y === 'number' ? y : existing.y);
  existing.updatedAt = Date.now();
  existing.lastModifiedBy = clientId || 'unknown';

  notesMap.set(id, existing);
  saveStateDebounced(getAllNotes());

  return {
    success: true,
    conflict: false,
    note: { ...existing }
  };
}

/**
 * Deletes a sticky note by ID.
 * @param {string} noteId 
 * @returns {Object}
 */
export function deleteNote(noteId) {
  const existing = notesMap.get(noteId);
  if (!existing) {
    return { success: false, error: 'Note not found', noteId };
  }

  notesMap.delete(noteId);
  saveStateDebounced(getAllNotes());
  return { success: true, deletedId: noteId };
}
