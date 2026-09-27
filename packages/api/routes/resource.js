import { notFound } from '../lib/errors.js'
import { validate } from '../lib/validate.js'

/**
 * Fetches a document or fails with a 404.
 *
 * Used before every nested write so a category cannot be created under a
 * tournament that does not exist. Without it the store would happily accept the
 * row and the orphan would only surface later, as a screen with no data and no
 * explanation.
 */
export async function loadOrFail(collection, id) {
  const doc = await collection.get(id)
  if (!doc) throw notFound()
  return doc
}

/**
 * Builds a body reader for a resource.
 *
 * `id`, `createdAt` and `updatedAt` are absent from every schema, so the
 * validator's unknown-field rule is what stops a client from choosing its own
 * identifier or backdating a record — the store owns all three.
 */
export function bodyReader(schema) {
  return {
    forCreate: (body) => validate(body, schema),
    forPatch: (body) => validate(body, schema, { partial: true }),
  }
}
