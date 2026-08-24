import { loadPersistentNotes, savePersistentNotes } from './store.js';

let notesMap = new Map();
let isLoaded = false;

/**
 * Initializes in-memory state manager from store.
 */
export async function ensureInitialized() {
  if (!isLoaded) {
    const loadedNotes = await loadPersistentNotes();
    notesMap.clear();
    if (Array.isArray(loadedNotes)) {
      loadedNotes.forEach(note => {
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
    isLoaded = true;
    console.log(`[StateManager] Initialized with ${notesMap.size} note(s)`);
  }
}

/**
 * Gets all current sticky notes.
 * @returns {Promise<Array>}
 */
export async function getAllNotes() {
  await ensureInitialized();
  return Array.from(notesMap.values());
}

/**
 * Syncs full external notes array (e.g. from cross-instance update).
 * @param {Array} notes 
 */
export function syncExternalNotes(notes) {
  if (!Array.isArray(notes)) return;
  notesMap.clear();
  notes.forEach(note => {
    if (note && note.id) {
      notesMap.set(note.id, { ...note });
    }
  });
}

/**
 * Creates a new sticky note.
 * @param {Object} noteData 
 * @param {string} clientId 
 * @returns {Promise<Object>} created note
 */
export async function createNote(noteData, clientId) {
  await ensureInitialized();
  const noteId = noteData.id || `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const text = String(noteData.text || '').substring(0, 1000);
  
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
  await savePersistentNotes(Array.from(notesMap.values()));
  return newNote;
}

/**
 * Updates a sticky note's content or color using version checking.
 * @param {Object} updateData { id, text, color, version }
 * @param {string} clientId 
 * @returns {Promise<Object>} result { success, note, conflict, serverNote }
 */
export async function updateNote(updateData, clientId) {
  await ensureInitialized();
  const { id, text, color, version } = updateData;
  const existing = notesMap.get(id);

  if (!existing) {
    return { success: false, error: 'Note not found', noteId: id };
  }

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
  await savePersistentNotes(Array.from(notesMap.values()));

  return {
    success: true,
    conflict: false,
    note: { ...existing }
  };
}

/**
 * Moves a sticky note's coordinates (x, y).
 * @param {Object} moveData { id, x, y }
 * @param {string} clientId 
 * @returns {Promise<Object>}
 */
export async function moveNote(moveData, clientId) {
  await ensureInitialized();
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
  await savePersistentNotes(Array.from(notesMap.values()));

  return {
    success: true,
    conflict: false,
    note: { ...existing }
  };
}

/**
 * Deletes a sticky note by ID.
 * @param {string} noteId 
 * @returns {Promise<Object>}
 */
export async function deleteNote(noteId) {
  await ensureInitialized();
  const existing = notesMap.get(noteId);
  if (!existing) {
    return { success: false, error: 'Note not found', noteId };
  }

  notesMap.delete(noteId);
  await savePersistentNotes(Array.from(notesMap.values()));
  return { success: true, deletedId: noteId };
}
