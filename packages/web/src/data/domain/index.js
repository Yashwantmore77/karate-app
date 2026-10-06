/**
 * The competition data: tournaments, categories, competitors and matches.
 *
 * Re-exported so screens import from one place and never from the transport
 * underneath. Every call is a request to the API.
 */
export { tournaments, categories, competitors, matches } from './api'
