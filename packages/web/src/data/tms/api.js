import { request } from '../http'

// The same surface as ./local, over the REST API of PRD section 56.

const get = (path, opts) => request(path, opts)
const send = (method, path, body, opts = {}) => request(path, { method, body, ...opts })
const T = (tid) => `/tournaments/${tid}`
const qs = (filter = {}) => {
  const p = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  const s = p.toString()
  return s ? `?${s}` : ''
}

const crud = (segment, key) => ({
  list: async (tid) => (await get(`${T(tid)}/${segment}`))[`${key}s`],
  create: async (tid, doc) => (await send('POST', `${T(tid)}/${segment}`, doc))[key],
  update: async (tid, id, patch) => (await send('PATCH', `${T(tid)}/${segment}/${id}`, patch))[key],
  remove: (tid, id) => send('DELETE', `${T(tid)}/${segment}/${id}`),
})

export const setActor = () => {}

export const tms = {
  updateTournament: async (tid, patch) => (await send('PATCH', T(tid), patch)).tournament,
  updateSettings: async (tid, settings) => (await send('PATCH', `${T(tid)}/settings`, settings)).tournament,
  setLifecycle: async (tid, to, reason) => (await send('POST', `${T(tid)}/lifecycle`, { to, reason: reason || null })).tournament,
  setLock: async (tid, which, locked, reason) => (await send('POST', `${T(tid)}/locks/${which}`, { locked, reason: reason || null })).tournament,
  saveForm: async (tid, fields) => (await send('PUT', `${T(tid)}/registration-form`, { fields })).tournament,

  ageGroups: crud('age-groups', 'ageGroup'),
  weightCategories: crud('weight-categories', 'weightCategory'),
  teams: crud('teams', 'team'),
  players: {
    list: async (tid, filter) => (await get(`${T(tid)}/players${qs(filter)}`)).players,
    create: async (tid, doc) => (await send('POST', `${T(tid)}/players`, doc)).player,
    update: async (tid, id, patch) => (await send('PATCH', `${T(tid)}/players/${id}`, patch)).player,
    remove: (tid, id) => send('DELETE', `${T(tid)}/players/${id}`),
  },
  bulkPreview: (tid, csv, teamId) => send('POST', `${T(tid)}/players/bulk/preview`, { csv, teamId: teamId || null }),
  bulkImport: (tid, csv, teamId) => send('POST', `${T(tid)}/players/bulk`, { csv, teamId: teamId || null }),
  registration: async (tid, pid, action, reason) => (await send('POST', `${T(tid)}/players/${pid}/registration`, { action, reason: reason || null })).player,
  payment: async (tid, pid, payment) => (await send('PUT', `${T(tid)}/players/${pid}/payment`, payment)).player,
  weighIn: async (tid, pid, body) => (await send('POST', `${T(tid)}/players/${pid}/weigh-in`, body)).player,
  overrideCategory: async (tid, pid, event, entry, reason) =>
    (await send('PUT', `${T(tid)}/players/${pid}/entries/${event}`, { ...entry, reason: reason || null })).player,
  categorize: (tid) => send('POST', `${T(tid)}/categorize`, {}),
  divisions: async (tid) => (await get(`${T(tid)}/divisions`)).divisions,
  pools: async (tid) => (await get(`${T(tid)}/pools`)).pools,
  generatePools: async (tid, opts) => (await send('POST', `${T(tid)}/pools/generate`, opts)).pools,
  movePlayer: async (tid, body) => (await send('POST', `${T(tid)}/pools/move`, body)).pools,
  matches: async (tid, filter) => (await get(`${T(tid)}/matches${qs(filter)}`)).matches,
  generateMatches: (tid, opts = {}) => send('POST', `${T(tid)}/matches/generate`, opts),
  scheduleMatch: async (tid, mid, body) => (await send('PATCH', `${T(tid)}/matches/${mid}/schedule`, body)).match,
  correctResult: async (tid, mid, body, reason) => (await send('POST', `${T(tid)}/matches/${mid}/correct`, { ...body, reason: reason || null })).match,
  results: async (tid) => (await get(`${T(tid)}/results`)).results,
  generateBracket: async (tid, divisionKey) => (await send('POST', `${T(tid)}/brackets/generate`, { divisionKey })).bracket,
  publishResults: (tid, publish) => send('POST', `${T(tid)}/results/publish`, { publish }),
  medals: async (tid) => (await get(`${T(tid)}/medals`)).medals,
  tally: async (tid, by) => (await get(`${T(tid)}/medal-tally${qs({ by })}`)).tally,
  certificates: async (tid) => (await get(`${T(tid)}/certificates`)).certificates,
  generateCertificates: (tid) => send('POST', `${T(tid)}/certificates/generate`, {}),
  link: async (tid) => (await get(`${T(tid)}/registration-link`)).link,
  saveLink: async (tid, body) => (await send('PUT', `${T(tid)}/registration-link`, body)).link,
  dashboard: async (tid) => (await get(`${T(tid)}/dashboard`)).dashboard,
  notifications: async (tid) => (await get(`${T(tid)}/notifications`)).notifications,
  markRead: (tid) => send('POST', `${T(tid)}/notifications/read`, {}),
  audit: async (tid) => (await get(`${T(tid)}/audit`)).audit,

  public: {
    list: async () => (await get('/public/tournaments', { anonymous: true })).tournaments,
    view: (idOrSlug) => get(`/public/tournaments/${encodeURIComponent(idOrSlug)}`, { anonymous: true }),
    linkInfo: (token) => get(`/public/register/${encodeURIComponent(token)}`, { anonymous: true }),
    async openLink(token, password) {
      const res = await send('POST', `/public/register/${encodeURIComponent(token)}/session`, { password }, { anonymous: true })
      return { token: res.token, tournamentId: res.tournamentId }
    },
  },

  // A coach session is the token the server issued for the registration link.
  coach: {
    me: (session) => get('/coach/me', { token: session.token }),
    async createTeam(session, doc) {
      const res = await send('POST', '/coach/team', doc, { token: session.token })
      return { team: res.team, session: { ...session, token: res.token } }
    },
    updateTeam: async (session, patch) => (await send('PATCH', '/coach/team', patch, { token: session.token })).team,
    createPlayer: async (session, doc) => (await send('POST', '/coach/players', doc, { token: session.token })).player,
    updatePlayer: async (session, id, patch) => (await send('PATCH', `/coach/players/${id}`, patch, { token: session.token })).player,
    removePlayer: (session, id) => send('DELETE', `/coach/players/${id}`, undefined, { token: session.token }),
    bulkPreview: (session, csv) => send('POST', '/coach/players/bulk/preview', { csv }, { token: session.token }),
    bulkImport: (session, csv) => send('POST', '/coach/players/bulk', { csv }, { token: session.token }),
  },
}
