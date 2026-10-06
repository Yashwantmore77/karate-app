/**
 * A business rule said no: a locked draw, a closed registration, a missing
 * reason. Carries an HTTP-style status so the API can answer with it directly,
 * and a stable code the UI can turn into words.
 */
export class DomainError extends Error {
  constructor(code, status = 400, details) {
    super(code)
    this.name = 'DomainError'
    this.code = code
    this.status = status
    if (details) this.details = details
  }
}

export const rule = (code, details) => new DomainError(code, 409, details)
export const invalid = (code, details) => new DomainError(code, 400, details)
export const missing = (code = 'not_found') => new DomainError(code, 404)
export const denied = (code = 'forbidden') => new DomainError(code, 403)
