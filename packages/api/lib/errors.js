/**
 * A failure the caller caused and can do something about.
 *
 * Anything thrown that is *not* an ApiError is treated as a bug by the error
 * handler and reported as a bare 500. That asymmetry is deliberate: a route
 * should have to say out loud that a failure is the client's fault, so an
 * unexpected internal error can never be mistaken for a tidy 400.
 */
export class ApiError extends Error {
  constructor(code, status, details) {
    super(code)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    if (details) this.details = details
  }
}

export const badRequest = (code, details) => new ApiError(code, 400, details)
export const unauthorized = (code = 'unauthorized') => new ApiError(code, 401)
export const forbidden = (code = 'forbidden') => new ApiError(code, 403)
export const notFound = (code = 'not_found') => new ApiError(code, 404)
export const conflict = (code, details) => new ApiError(code, 409, details)
export const tooManyRequests = (code = 'too_many_attempts') => new ApiError(code, 429)
