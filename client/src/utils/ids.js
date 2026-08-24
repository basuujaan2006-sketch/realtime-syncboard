/**
 * Generates a unique string ID with an optional prefix.
 * @param {string} prefix 
 * @returns {string}
 */
export function generateId(prefix = 'id') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${timestamp}-${randomStr}`;
}

export const NOTE_COLORS = [
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
  'orange'
];

/**
 * Creates a throttled function that only invokes `func` at most once per `limit` milliseconds.
 * @param {Function} func 
 * @param {number} limit 
 * @returns {Function}
 */
export function throttle(func, limit) {
  let inThrottle = false;
  let lastFunc = null;
  let lastRan = 0;

  return function (...args) {
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      lastRan = Date.now();
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    } else {
      clearTimeout(lastFunc);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func.apply(context, args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}
