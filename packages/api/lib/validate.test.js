import { describe, it, expect } from 'vitest'
import { validate } from './validate.js'
import { ApiError } from './errors.js'

const schema = {
  name: { type: 'string', required: true, min: 3, max: 10 },
  slug: { type: 'string', lowercase: true, max: 20 },
  age: { type: 'integer', min: 1, max: 120 },
  score: { type: 'number', min: 0, max: 10 },
  active: { type: 'boolean' },
  kind: { type: 'enum', values: ['a', 'b'], default: 'a' },
  seat: { type: 'integer', min: 1, nullable: true },
  blob: { type: 'object', nullable: true },
}

const codeOf = (fn) => {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(ApiError)
    return err.code
  }
  throw new Error('expected validate to throw')
}

describe('validate', () => {
  it('returns only fields the schema names, with defaults applied', () => {
    expect(validate({ name: 'Spring' }, schema)).toEqual({ name: 'Spring', kind: 'a' })
  })

  it('trims strings and lowercases where asked', () => {
    const out = validate({ name: '  Spring  ', slug: '  MiXeD  ' }, schema)
    expect(out).toMatchObject({ name: 'Spring', slug: 'mixed' })
  })

  it('rejects an unknown field rather than dropping it', () => {
    // Dropping it silently would let a client post `role` or `id` to a resource
    // that accepts neither and read the 200 as confirmation that it stuck.
    try {
      validate({ name: 'Spring', role: 'admin' }, schema)
      throw new Error('expected validate to throw')
    } catch (err) {
      expect(err.code).toBe('unknown_field')
      expect(err.details).toEqual({ field: 'role' })
    }
  })

  it('names the missing required field', () => {
    expect(codeOf(() => validate({}, schema))).toBe('name_required')
  })

  it('enforces string length at both ends', () => {
    expect(codeOf(() => validate({ name: 'ab' }, schema))).toBe('invalid_name')
    expect(codeOf(() => validate({ name: 'a'.repeat(11) }, schema))).toBe('invalid_name')
  })

  it('caps a string even when the schema names no maximum', () => {
    const open = { note: { type: 'string' } }
    expect(codeOf(() => validate({ note: 'x'.repeat(501) }, open))).toBe('invalid_note')
  })

  it('refuses a non-integer where an integer is required', () => {
    expect(codeOf(() => validate({ name: 'Spring', age: 1.5 }, schema))).toBe('invalid_age')
    expect(codeOf(() => validate({ name: 'Spring', age: '12' }, schema))).toBe('invalid_age')
  })

  it('enforces numeric bounds', () => {
    expect(codeOf(() => validate({ name: 'Spring', age: 0 }, schema))).toBe('invalid_age')
    expect(codeOf(() => validate({ name: 'Spring', score: 10.5 }, schema))).toBe('invalid_score')
  })

  it('rejects NaN and Infinity for a number', () => {
    expect(codeOf(() => validate({ name: 'Spring', score: NaN }, schema))).toBe('invalid_score')
    expect(codeOf(() => validate({ name: 'Spring', score: Infinity }, schema))).toBe('invalid_score')
  })

  it('rejects a value outside an enum', () => {
    expect(codeOf(() => validate({ name: 'Spring', kind: 'c' }, schema))).toBe('invalid_kind')
  })

  it('rejects an array or a string where an object is expected', () => {
    expect(codeOf(() => validate({ name: 'Spring', blob: [1, 2] }, schema))).toBe('invalid_blob')
    expect(codeOf(() => validate({ name: 'Spring', blob: 'x' }, schema))).toBe('invalid_blob')
  })

  it('accepts null only where the field is nullable', () => {
    expect(validate({ name: 'Spring', seat: null }, schema)).toMatchObject({ seat: null })
    expect(codeOf(() => validate({ name: 'Spring', age: null }, schema))).toBe('invalid_age')
  })

  it('rejects a body that is not an object', () => {
    expect(codeOf(() => validate(null, schema))).toBe('invalid_body')
    expect(codeOf(() => validate([], schema))).toBe('invalid_body')
    expect(codeOf(() => validate('name=Spring', schema))).toBe('invalid_body')
  })

  describe('partial (PATCH)', () => {
    it('skips absent fields instead of demanding or defaulting them', () => {
      expect(validate({ age: 12 }, schema, { partial: true })).toEqual({ age: 12 })
    })

    it('still validates the fields that are present', () => {
      expect(codeOf(() => validate({ name: 'ab' }, schema, { partial: true }))).toBe('invalid_name')
    })

    it('refuses a patch that would change nothing', () => {
      expect(codeOf(() => validate({}, schema, { partial: true }))).toBe('empty_patch')
    })
  })
})
