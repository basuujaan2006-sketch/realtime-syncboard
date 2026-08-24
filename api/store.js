import { Redis } from '@upstash/redis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Upstash Redis / Vercel KV if environment variables are present
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

let redisClient = null;
if (redisUrl && redisToken) {
  try {
    redisClient = new Redis({
      url: redisUrl,
      token: redisToken,
    });
    console.log('[Store] Initialized Upstash Redis / Vercel KV persistent storage');
  } catch (err) {
    console.warn('[Store] Failed to initialize Redis client, using fallback:', err.message);
  }
} else {
  console.log('[Store] No Redis credentials found, using local filesystem/memory fallback');
}

const REDIS_KEY = 'syncboard:notes';
const REDIS_EVENT_KEY = 'syncboard:last_event';
const DATA_FILE = path.join(__dirname, '..', 'server', 'data', 'state.json');

/**
 * Loads board notes from persistent store (Redis or local JSON fallback).
 * @returns {Promise<Array>}
 */
export async function loadPersistentNotes() {
  if (redisClient) {
    try {
      const data = await redisClient.get(REDIS_KEY);
      if (Array.isArray(data)) {
        return data;
      }
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
        if (parsed && Array.isArray(parsed.notes)) return parsed.notes;
      }
    } catch (err) {
      console.error('[Store] Error reading from Redis:', err.message);
    }
  }

  // Local filesystem fallback
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.notes)) {
        return parsed.notes;
      }
    }
  } catch (err) {
    console.warn('[Store] Error reading local data file:', err.message);
  }

  return [];
}

let saveTimeout = null;

/**
 * Saves notes to persistent store (Redis or local JSON fallback).
 * @param {Array} notes 
 */
export async function savePersistentNotes(notes) {
  if (redisClient) {
    try {
      await redisClient.set(REDIS_KEY, JSON.stringify(notes));
    } catch (err) {
      console.error('[Store] Error saving to Redis:', err.message);
    }
    return;
  }

  // Debounced file write for local fallback
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify({ updatedAt: new Date().toISOString(), notes }, null, 2), 'utf-8');
    } catch (err) {
      console.error('[Store] Local file save failed:', err.message);
    }
  }, 250);
}

/**
 * Publishes an event across Vercel Function instances via Redis if available.
 * @param {Object} event 
 */
export async function publishCrossInstanceEvent(event) {
  if (redisClient) {
    try {
      await redisClient.set(REDIS_EVENT_KEY, JSON.stringify({
        ...event,
        eventId: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now()
      }));
    } catch (err) {
      console.error('[Store] Error publishing cross-instance event to Redis:', err.message);
    }
  }
}

/**
 * Polls for cross-instance events from other Vercel Function instances.
 * @param {string} lastSeenEventId 
 * @returns {Promise<Object|null>}
 */
export async function fetchLastEvent(lastSeenEventId) {
  if (!redisClient) return null;
  try {
    const raw = await redisClient.get(REDIS_EVENT_KEY);
    if (!raw) return null;
    const event = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (event && event.eventId && event.eventId !== lastSeenEventId) {
      return event;
    }
  } catch (err) {
    // Ignore transient poll errors
  }
  return null;
}
