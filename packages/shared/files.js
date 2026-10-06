// PRD sections 5, 12, 17 and 49: uploaded files (player photos, ID proofs,
// documents, tournament logos). Checked by their content, not their name: a
// file is accepted only when its first bytes match the type it claims.

export const MAX_FILE_BYTES = 2 * 1024 * 1024

const SIGNATURES = {
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
}

export const ACCEPTED_TYPES = Object.keys(SIGNATURES)
export const FILE_PURPOSES = ['logo', 'player']

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/

function decodeHead(base64, count) {
  const head = base64.slice(0, Math.ceil((count * 4) / 3) + 4).replace(/=+$/, '')
  const bin = typeof atob === 'function' ? atob(head.slice(0, head.length - (head.length % 4))) : Buffer.from(head, 'base64').toString('binary')
  return [...bin].slice(0, count).map((c) => c.charCodeAt(0))
}

/** Size in bytes of base64 data, without decoding it all. */
export const base64Size = (data) => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0)

/**
 * Returns a problem code, or null when the file is acceptable:
 * a known type, its signature present, at most 2 MB, a sane name.
 */
export function checkFile({ name, type, data }) {
  if (!name || typeof name !== 'string' || name.length > 200) return 'invalid_name'
  if (!ACCEPTED_TYPES.includes(type)) return 'unsupported_type'
  if (typeof data !== 'string' || !data.length || !BASE64.test(data)) return 'invalid_data'
  if (base64Size(data) > MAX_FILE_BYTES) return 'file_too_large'
  const sig = SIGNATURES[type]
  const head = decodeHead(data, sig.length)
  if (!sig.every((byte, i) => head[i] === byte)) return 'content_does_not_match_type'
  return null
}

/** Strips anything path-like or control characters from a display name. */
export const safeFileName = (name) => String(name).replace(/[\\/\u0000-\u001f"<>|:*?]+/g, '_').slice(0, 120)
