import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// RFC 6238 time-based one-time passwords (the codes authenticator apps show),
// for the optional admin two-factor sign-in of PRD section 4.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_S = 30
const DIGITS = 6

export function base32Encode(buf) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = 0
  let value = 0
  const out = []
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch)
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

export const newSecret = () => base32Encode(randomBytes(20))

export function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / STEP_S)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS
  return String(code).padStart(DIGITS, '0')
}

/** Accepts the current code and one step either side, for clock drift. */
export function verifyTotp(secret, code, at = Date.now()) {
  const given = Buffer.from(String(code || '').replace(/\s/g, ''))
  if (given.length !== DIGITS) return false
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totp(secret, at + drift * STEP_S * 1000))
    if (timingSafeEqual(expected, given)) return true
  }
  return false
}

export const otpauthUrl = (secret, account, issuer = 'Kumite Tournaments') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=${DIGITS}&period=${STEP_S}`
