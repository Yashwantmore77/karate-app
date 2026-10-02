import { badRequest } from './errors.js'

// Every string field gets a ceiling even when a schema does not name one, so a
// missing `max` can never become an unbounded write.
const DEFAULT_MAX_STRING = 500

// A timestamp must name its own timezone, as either Z or an offset.
//
// Without one, Date.parse reads it in whatever zone the server happens to run
// in. The API runs in UTC and the events do not, so a bare "13:00" would be
// stored hours away from the time whoever typed it meant.
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function coerce(field, raw, rule) {
  const reject = () => { throw badRequest(`invalid_${field}`) }

  switch (rule.type) {
    case 'string': {
      if (typeof raw !== 'string') reject()
      const value = rule.trim === false ? raw : raw.trim()
      if (value.length < (rule.min ?? 1)) reject()
      if (value.length > (rule.max ?? DEFAULT_MAX_STRING)) reject()
      if (rule.pattern && !rule.pattern.test(value)) reject()
      return rule.lowercase ? value.toLowerCase() : value
    }
    case 'integer': {
      if (!Number.isInteger(raw)) reject()
      if (rule.min !== undefined && raw < rule.min) reject()
      if (rule.max !== undefined && raw > rule.max) reject()
      return raw
    }
    case 'number': {
      // Number.isFinite also screens out NaN and Infinity, which survive JSON
      // as nulls elsewhere but arrive intact from a hand-built body.
      if (typeof raw !== 'number' || !Number.isFinite(raw)) reject()
      if (rule.min !== undefined && raw < rule.min) reject()
      if (rule.max !== undefined && raw > rule.max) reject()
      return raw
    }
    case 'timestamp': {
      // An instant on the clock, normalized to UTC.
      //
      // Normalizing is not tidiness: the clash query compares these as strings,
      // and that is only chronological while every one of them is written the
      // same way. A date with no time of day is rejected, because a slot with no
      // time cannot clash with anything.
      if (typeof raw !== 'string') reject()
      if (!ISO_INSTANT.test(raw)) reject()
      const ms = Date.parse(raw)
      if (!Number.isFinite(ms)) reject()
      return new Date(ms).toISOString()
    }
    case 'boolean': {
      if (typeof raw !== 'boolean') reject()
      return raw
    }
    case 'enum': {
      if (!rule.values.includes(raw)) reject()
      return raw
    }
    case 'object': {
      // An opaque payload (a clock anchor, a scoreboard snapshot). The request
      // body limit is what bounds its size; nothing here inspects its shape.
      if (!isPlainObject(raw)) reject()
      return raw
    }
    case 'array': {
      if (!Array.isArray(raw)) reject()
      if (rule.maxItems !== undefined && raw.length > rule.maxItems) reject()
      // Items report under the field's own name rather than an index, so the
      // caller gets one code to branch on instead of invalid_judgeIds[2].
      const items = raw.map((item) => coerce(field, item, rule.items))
      if (rule.unique && new Set(items).size !== items.length) reject()
      return items
    }
    default:
      throw new Error(`unsupported schema type: ${rule.type}`)
  }
}

/**
 * Validates and normalizes a request body against a schema, returning a fresh
 * object built only from fields the schema names.
 *
 * Unknown fields are rejected rather than dropped. Silently ignoring them
 * would let a client post `role` or `id` to a resource that does not accept
 * one and get a success back, which reads as if it worked.
 *
 * `partial: true` (PATCH) skips absent fields instead of applying defaults or
 * demanding required ones, so a patch can carry one field without restating
 * the rest.
 */
export function validate(body, schema, { partial = false } = {}) {
  if (!isPlainObject(body)) throw badRequest('invalid_body')

  for (const field of Object.keys(body)) {
    if (!schema[field]) throw badRequest('unknown_field', { field })
  }

  const out = {}
  for (const [field, rule] of Object.entries(schema)) {
    const raw = body[field]

    if (raw === undefined) {
      if (partial) continue
      if (rule.required) throw badRequest(`${field}_required`)
      if (rule.default !== undefined) out[field] = rule.default
      continue
    }

    // An explicit null clears a nullable field; on anything else it is simply
    // the wrong type.
    if (raw === null) {
      if (!rule.nullable) throw badRequest(`invalid_${field}`)
      out[field] = null
      continue
    }

    out[field] = coerce(field, raw, rule)
  }

  if (partial && Object.keys(out).length === 0) throw badRequest('empty_patch')
  return out
}
