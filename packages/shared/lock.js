/**
 * One at a time per key: `withLock(key, fn)` runs `fn` once every earlier
 * call with the same key has finished (done or failed), in the order they
 * came, and returns what `fn` returns. A key nobody is waiting on is dropped.
 *
 * For "read the highest number, add one, insert": two requests doing that at
 * the same moment both read the same highest number. Taking turns per
 * tournament stops it. It holds within one server process, which is how the
 * API runs (packages/api/index.js); several processes would need the
 * database itself to refuse a second copy.
 *
 * Not re-entrant: `fn` must not ask for the same key again, or it waits for
 * itself forever.
 */
export function createKeyedLock() {
  const tails = new Map()
  return async function withLock(key, fn) {
    const before = tails.get(key) || Promise.resolve()
    let release
    const done = new Promise((resolve) => { release = resolve })
    const tail = before.then(() => done)
    tails.set(key, tail)
    try {
      await before
      return await fn()
    } finally {
      release()
      if (tails.get(key) === tail) tails.delete(key)
    }
  }
}
