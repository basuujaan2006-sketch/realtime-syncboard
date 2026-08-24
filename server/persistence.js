import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

let saveTimeout = null;
const DEBOUNCE_MS = 250;

/**
 * Ensures data directory and initial state file exist.
 */
async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(STATE_FILE);
    } catch {
      const initialState = { notes: [] };
      await fs.writeFile(STATE_FILE, JSON.stringify(initialState, null, 2), 'utf-8');
    }
  } catch (err) {
    console.error('[Persistence] Error ensuring data directory/file:', err);
  }
}

/**
 * Loads persistent state from disk.
 * @returns {Promise<{notes: Array}>}
 */
export async function loadState() {
  await ensureDataFile();
  try {
    const rawData = await fs.readFile(STATE_FILE, 'utf-8');
    const parsed = JSON.parse(rawData);
    if (!parsed || !Array.isArray(parsed.notes)) {
      return { notes: [] };
    }
    return parsed;
  } catch (err) {
    console.error('[Persistence] Error reading state file, starting with empty notes:', err.message);
    return { notes: [] };
  }
}

/**
 * Schedules debounced save of current in-memory notes to state.json.
 * @param {Array} notes 
 */
export function saveStateDebounced(notes) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(async () => {
    try {
      await ensureDataFile();
      const payload = {
        updatedAt: new Date().toISOString(),
        notes: notes
      };
      await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
      console.log(`[Persistence] Saved ${notes.length} note(s) to state.json`);
    } catch (err) {
      console.error('[Persistence] Failed to write state.json:', err.message);
    }
  }, DEBOUNCE_MS);
}

/**
 * Immediately saves state to disk without debounce (e.g. shutdown or key operations).
 * @param {Array} notes 
 */
export async function saveStateImmediate(notes) {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  try {
    await ensureDataFile();
    const payload = {
      updatedAt: new Date().toISOString(),
      notes: notes
    };
    await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`[Persistence] Immediately saved ${notes.length} note(s) to state.json`);
  } catch (err) {
    console.error('[Persistence] Immediate save failed:', err.message);
  }
}
