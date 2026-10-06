// Password hashing and random tokens on WebCrypto, which Node and every
// browser share, so a registration link password is checked the same way on
// the server and in the offline build.

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const ITERATIONS = 120_000

export function randomToken(length = 24) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789'
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(length))
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join('')
}

async function derive(password, saltHex) {
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(String(password)), 'PBKDF2', false, ['deriveBits'])
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)))
  return hex(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256))
}

export async function hashSecret(password) {
  const salt = hex(globalThis.crypto.getRandomValues(new Uint8Array(16)))
  return `pbkdf2:${salt}:${await derive(password, salt)}`
}

export async function verifySecret(password, stored) {
  const [scheme, salt, expected] = String(stored || '').split(':')
  if (scheme !== 'pbkdf2' || !salt || !expected) return false
  const actual = await derive(password, salt)
  // Constant-time over equal-length hex strings.
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
