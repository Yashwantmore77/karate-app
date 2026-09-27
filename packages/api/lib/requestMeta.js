/**
 * What a request reveals about who made it: address, location, client string.
 *
 * Gathered in one place so the login log and anything added later agree on
 * where each value came from, and so the guesswork involved in "where is this
 * caller" stays visible rather than being spread across route handlers.
 */

const headerValue = (req, name) => {
  const raw = req.headers?.[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

// Edge platforms percent-encode city names, so "São Paulo" arrives mangled.
const decoded = (value) => {
  if (value === null) return null
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const finiteNumber = (value) => {
  if (value === null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

// ::ffff:127.0.0.1 is the same address as 127.0.0.1 wearing an IPv6 coat.
const unmapped = (ip) => (ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip)

const PRIVATE_RANGES = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^fc/i, /^fd/i, /^fe80:/i,
]

/** False for loopback and LAN addresses — nothing public can be learned from those. */
export const isRoutableIp = (ip) => {
  const value = unmapped(ip)
  return !!value && !PRIVATE_RANGES.some((range) => range.test(value))
}

/**
 * The caller's address.
 *
 * `req.ip` only honours X-Forwarded-For when Express is told to trust a proxy,
 * and that is opt-in (TRUST_PROXY) on purpose: the header is client-supplied,
 * so trusting it with no proxy in front lets a caller name their own address —
 * which would also walk them straight past the login rate limiter, because the
 * limiter keys on this exact value.
 */
export const clientIp = (req) => unmapped(req.ip || req.socket?.remoteAddress || null)

// Vercel and Cloudflare both resolve location at the edge and pass it down, so
// on those platforms this costs nothing and reaches no third party.
const EDGE_SOURCES = [
  {
    source: 'vercel',
    country: 'x-vercel-ip-country',
    region: 'x-vercel-ip-country-region',
    city: 'x-vercel-ip-city',
    latitude: 'x-vercel-ip-latitude',
    longitude: 'x-vercel-ip-longitude',
    timezone: 'x-vercel-ip-timezone',
  },
  {
    source: 'cloudflare',
    country: 'cf-ipcountry',
    region: 'cf-region-code',
    city: 'cf-ipcity',
    latitude: 'cf-iplatitude',
    longitude: 'cf-iplongitude',
    timezone: 'cf-timezone',
  },
]

/** Location the hosting edge already worked out, or null when self-hosted. */
export function edgeGeo(req) {
  for (const { source, ...fields } of EDGE_SOURCES) {
    const country = headerValue(req, fields.country)
    if (!country) continue
    return {
      source,
      country,
      region: decoded(headerValue(req, fields.region)),
      city: decoded(headerValue(req, fields.city)),
      latitude: finiteNumber(headerValue(req, fields.latitude)),
      longitude: finiteNumber(headerValue(req, fields.longitude)),
      timezone: headerValue(req, fields.timezone),
    }
  }
  return null
}

// Providers disagree on field names for the same four facts, so read whichever
// of the usual spellings is present rather than binding to one service.
const firstOf = (body, keys) => {
  for (const key of keys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== '') return body[key]
  }
  return null
}

const GEOIP_TIMEOUT_MS = 2500

/**
 * Location looked up from a third-party service, for deployments with no edge
 * headers of their own. Off unless GEOIP_LOOKUP_URL names one (use {ip} as the
 * placeholder), because it means handing a caller's address to another party.
 *
 * Never throws: an audit record with a missing city is worth keeping, and a
 * login must not depend on someone else's uptime.
 */
export async function lookupGeo(ip) {
  const template = process.env.GEOIP_LOOKUP_URL
  if (!template || !isRoutableIp(ip)) return null

  try {
    const response = await fetch(template.replace('{ip}', encodeURIComponent(ip)), {
      signal: AbortSignal.timeout(GEOIP_TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = await response.json()

    const latitude = finiteNumber(firstOf(body, ['latitude', 'lat']))
    const longitude = finiteNumber(firstOf(body, ['longitude', 'lon', 'lng']))
    const country = firstOf(body, ['country_name', 'country', 'countryCode', 'country_code'])
    if (latitude === null && longitude === null && !country) return null

    return {
      source: 'lookup',
      country: country ? String(country) : null,
      region: firstOf(body, ['region', 'regionName', 'region_name', 'state']),
      city: firstOf(body, ['city', 'town']),
      latitude,
      longitude,
      timezone: firstOf(body, ['timezone', 'time_zone']),
    }
  } catch {
    return null
  }
}

/** The browser's own client string, bounded so a hostile one cannot bloat a record. */
export const userAgent = (req) => headerValue(req, 'user-agent')?.slice(0, 400) ?? null
