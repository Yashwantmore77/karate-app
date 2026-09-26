// Domain repositories. Call sites use these and never touch a key or a socket,
// so swapping the adapter underneath changes nothing above this line.

import * as adapter from './adapters/local'

export const COLLECTIONS = {
  tournaments: 'tournaments',
  categories: 'categories',
  athletes: 'athletes',
  matches: 'matches',
  matchState: 'matchState',
  matchEvents: 'matchEvents',
  display: 'display',
}

const LIVE = 'live'

const makeRepo = (collection) => ({
  list: (query) => adapter.list(collection, query),
  get: (id) => adapter.get(collection, id),
  create: (doc) => adapter.create(collection, doc),
  update: (id, patch) => adapter.update(collection, id, patch),
  remove: (id) => adapter.remove(collection, id),
  subscribe: (query, cb) => adapter.subscribe(collection, query, cb),
})

export const tournamentRepo = makeRepo(COLLECTIONS.tournaments)
export const categoryRepo = makeRepo(COLLECTIONS.categories)
export const athleteRepo = makeRepo(COLLECTIONS.athletes)
export const matchRepo = makeRepo(COLLECTIONS.matches)
export const matchEventRepo = makeRepo(COLLECTIONS.matchEvents)

const stateRepo = makeRepo(COLLECTIONS.matchState)

export const matchStateRepo = {
  ...stateRepo,
  get: (matchId) => stateRepo.get(matchId),
  put: async (matchId, state) => {
    const existing = await stateRepo.get(matchId)
    if (existing) return stateRepo.update(matchId, state)
    return stateRepo.create({ ...state, id: matchId })
  },
  subscribe: (matchId, cb) =>
    stateRepo.subscribe({ id: matchId }, (rows) => cb(rows[0] || null)),
}

const displayCollection = makeRepo(COLLECTIONS.display)

// What a public scoreboard reads. One row, so a display needs no match id.
export const displayRepo = {
  get: () => displayCollection.get(LIVE),
  put: async (payload) => {
    const existing = await displayCollection.get(LIVE)
    if (existing) return displayCollection.update(LIVE, payload)
    return displayCollection.create({ ...payload, id: LIVE })
  },
  subscribe: (cb) => displayCollection.subscribe({ id: LIVE }, (rows) => cb(rows[0] || null)),
}

export const newId = adapter.newId
export const now = adapter.now
