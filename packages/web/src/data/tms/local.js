// The offline implementation: the shared tournament service itself, running in
// this browser on localStorage. Same rules, same audit trail as the server —
// only the storage differs.

import { createTms, TMS_COLLECTIONS } from '@kumite/shared/tms.js'
import * as legacy from '../domain/local'

const PREFIX = 'kt:tms:v1'
const keyOf = (name) => `${PREFIX}:${name}`
const matches = (row, filter) => Object.entries(filter).every(([k, v]) => row[k] === v)
const newId = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

const read = (name) => {
  try {
    return JSON.parse(localStorage.getItem(keyOf(name)) || '[]')
  } catch {
    return []
  }
}
const write = (name, rows) => localStorage.setItem(keyOf(name), JSON.stringify(rows))

/** The store contract over one localStorage key. */
function collection(name) {
  return {
    async list(filter = {}) { return read(name).filter((r) => matches(r, filter)) },
    async get(id) { return read(name).find((r) => r.id === id) || null },
    async insert(doc) {
      const row = { ...doc, id: doc.id || newId(name.slice(0, 4)), createdAt: new Date().toISOString() }
      write(name, [...read(name), row])
      return row
    },
    async update(id, patch) {
      let next = null
      write(name, read(name).map((r) => (r.id === id ? (next = { ...r, ...patch, updatedAt: new Date().toISOString() }) : r)))
      return next
    },
    async remove(id) {
      const rows = read(name)
      write(name, rows.filter((r) => r.id !== id))
      return rows.some((r) => r.id === id)
    },
    async removeWhere(filter) {
      const rows = read(name)
      const keep = rows.filter((r) => !matches(r, filter))
      write(name, keep)
      return rows.length - keep.length
    },
  }
}

// The scoring app's own records keep their historic key layout (grouped by
// parent). These adapters present them through the same store contract.

const allCategories = async () => {
  const out = []
  for (const t of await legacy.tournaments.list()) out.push(...(await legacy.categories.list(t.id)))
  return out
}

const legacyStores = {
  tournaments: {
    list: async (filter = {}) => (await legacy.tournaments.list()).filter((r) => matches(r, filter)),
    get: (id) => legacy.tournaments.get(id),
    insert: (doc) => legacy.tournaments.create(doc),
    update: (id, patch) => legacy.tournaments.update(id, { ...patch, updatedAt: new Date().toISOString() }),
    remove: (id) => legacy.tournaments.remove(id),
    removeWhere: async () => 0,
  },
  categories: {
    async list(filter = {}) {
      const rows = filter.tournamentId ? await legacy.categories.list(filter.tournamentId) : await allCategories()
      return rows.map((c) => ({ ...c, tournamentId: c.tournamentId })).filter((r) => matches(r, filter))
    },
    get: (id) => legacy.categories.find(id),
    insert: (doc) => legacy.categories.create(doc.tournamentId, doc),
    async update(id, patch) {
      const c = await legacy.categories.find(id)
      return c ? legacy.categories.update(c.tournamentId, id, patch) : null
    },
    async remove(id) {
      const c = await legacy.categories.find(id)
      if (c) await legacy.categories.remove(c.tournamentId, id)
      return !!c
    },
    async removeWhere(filter) {
      const rows = await this.list(filter)
      for (const c of rows) await legacy.categories.remove(c.tournamentId, c.id)
      return rows.length
    },
  },
  competitors: {
    async list(filter = {}) {
      if (!filter.categoryId) return []
      return (await legacy.competitors.list(filter.categoryId)).filter((r) => matches(r, filter))
    },
    async get(id) {
      for (const c of await allCategories()) {
        const hit = (await legacy.competitors.list(c.id)).find((r) => r.id === id)
        if (hit) return hit
      }
      return null
    },
    insert: (doc) => legacy.competitors.create(doc.categoryId, doc),
    async update(id, patch) {
      const row = await this.get(id)
      return row ? legacy.competitors.update(row.categoryId, id, patch) : null
    },
    async remove(id) {
      const row = await this.get(id)
      if (row) await legacy.competitors.remove(row.categoryId, id)
      return !!row
    },
    async removeWhere(filter) {
      const rows = await this.list(filter)
      for (const r of rows) await legacy.competitors.remove(r.categoryId, r.id)
      return rows.length
    },
  },
  matches: {
    async list(filter = {}) {
      if (!filter.categoryId) return []
      return (await legacy.matches.list(filter.categoryId)).filter((r) => matches(r, filter))
    },
    get: (id) => legacy.matches.find(id),
    insert: (doc) => legacy.matches.create(doc.categoryId, doc),
    async update(id, patch) {
      const row = await legacy.matches.find(id)
      return row ? legacy.matches.update(row.categoryId, id, patch) : null
    },
    async remove(id) {
      const row = await legacy.matches.find(id)
      if (row) await legacy.matches.remove(row.categoryId, id)
      return !!row
    },
    async removeWhere(filter) {
      const rows = await this.list(filter)
      for (const r of rows) await legacy.matches.remove(r.categoryId, r.id)
      return rows.length
    },
  },
}

const stores = {
  ...legacyStores,
  ...Object.fromEntries(TMS_COLLECTIONS.map((name) => [name, collection(name)])),
}

export const service = createTms(stores)

// Who is acting, for the audit trail. Set by the session (staff) or by the
// registration portal (a coach), the same identity the server would take from
// the token.
let actor = null
export const setActor = (next) => { actor = next }
const me = () => actor || { uid: 'anonymous', role: 'public' }

const s = service

export const tms = {
  updateTournament: (tid, patch) => s.updateTournament(me(), tid, patch),
  updateSettings: (tid, settings) => s.updateTournament(me(), tid, { settings }),
  setLifecycle: (tid, to, reason) => s.setLifecycle(me(), tid, to, reason),
  setLock: (tid, which, locked, reason) => (which === 'draw' ? s.setDrawLock : s.setEntriesLock)(me(), tid, locked, reason),
  saveForm: (tid, fields) => s.updateForm(me(), tid, fields),

  ageGroups: {
    list: (tid) => s.ageGroups.list(tid),
    create: (tid, doc) => s.ageGroups.create(me(), tid, doc),
    update: (tid, id, patch) => s.ageGroups.update(me(), tid, id, patch),
    remove: (tid, id) => s.ageGroups.remove(me(), tid, id),
  },
  weightCategories: {
    list: (tid) => s.weightCategories.list(tid),
    create: (tid, doc) => s.weightCategories.create(me(), tid, doc),
    update: (tid, id, patch) => s.weightCategories.update(me(), tid, id, patch),
    remove: (tid, id) => s.weightCategories.remove(me(), tid, id),
  },
  teams: {
    list: (tid) => s.teams.list(tid),
    create: (tid, doc) => s.teams.create(me(), tid, doc),
    update: (tid, id, patch) => s.teams.update(me(), tid, id, patch),
    remove: (tid, id) => s.teams.remove(me(), tid, id),
  },
  players: {
    list: (tid, filter) => s.listPlayers(tid, filter),
    create: (tid, doc) => s.createPlayer(me(), tid, doc),
    update: (tid, id, patch) => s.updatePlayer(me(), tid, id, patch),
    remove: (tid, id) => s.removePlayer(me(), tid, id),
  },
  bulkPreview: (tid, csv, teamId) => s.previewBulk(me(), tid, csv, { teamId }),
  bulkImport: (tid, csv, teamId) => s.importBulk(me(), tid, csv, { teamId }),
  registration: (tid, pid, action, reason) => s.setRegistrationStatus(me(), tid, pid, action, reason),
  payment: (tid, pid, payment) => s.recordPayment(me(), tid, pid, payment),
  weighIn: (tid, pid, body) => s.recordWeighIn(me(), tid, pid, body),
  overrideCategory: (tid, pid, event, entry, reason) => s.overrideCategory(me(), tid, pid, event, entry, reason),
  categorize: (tid) => s.categorize(me(), tid),
  divisions: (tid) => s.divisions(tid),
  pools: (tid) => s.listPools(tid),
  generatePools: (tid, opts) => s.generatePools(me(), tid, opts),
  movePlayer: (tid, body) => s.movePlayer(me(), tid, body),
  matches: (tid, filter) => s.listMatches(tid, filter),
  generateMatches: (tid, opts) => s.generateMatches(me(), tid, opts),
  scheduleMatch: (tid, mid, body) => s.scheduleMatch(me(), tid, mid, body),
  correctResult: (tid, mid, body, reason) => s.correctResult(me(), tid, mid, body, reason),
  results: (tid) => s.results(tid),
  generateBracket: (tid, key) => s.generateBracket(me(), tid, key),
  publishResults: (tid, publish) => s.publishResults(me(), tid, publish),
  medals: (tid) => s.listMedals(tid),
  tally: (tid, by) => s.tally(tid, by),
  certificates: (tid) => s.listCertificates(tid),
  generateCertificates: (tid) => s.generateCertificates(me(), tid),
  link: (tid) => s.getLink(tid),
  saveLink: (tid, body) => s.saveLink(me(), tid, body),
  dashboard: (tid) => s.dashboard(tid),
  notifications: (tid) => s.listNotifications(tid, 'admin'),
  markRead: (tid) => s.markNotificationsRead(tid, 'admin'),
  audit: (tid) => s.auditTrail(tid),
  uploadFile: (tid, file) => s.uploadFile(me(), tid, file),
  weighInReminder: (tid) => s.sendWeighInReminder(me(), tid),
  // Offline, staff at this browser can open what this browser stored.
  readFile: (_tid, id) => s.readFile(me(), id, { canViewRegistrations: true }),
  publicFileUrl: () => null,

  public: {
    list: () => s.publicList(),
    view: (idOrSlug) => s.publicView(idOrSlug),
    linkInfo: (token) => s.linkInfo(token),
    async openLink(token, password) {
      const { tournamentId, linkId } = await s.openLink(token, password)
      return { tournamentId, linkId, teamId: null }
    },
  },

  // A coach session is the claims the server would sign: tournament, link, team.
  coach: {
    actor: (session) => ({ uid: `coach:${session.linkId}`, role: 'coach', ...session }),
    me(session) { return s.coachOverview(this.actor(session)) },
    async createTeam(session, doc) {
      const team = await s.teams.create(this.actor(session), session.tournamentId, doc)
      return { team, session: { ...session, teamId: team.id } }
    },
    updateTeam(session, patch) { return s.teams.update(this.actor(session), session.tournamentId, session.teamId, patch) },
    createPlayer(session, doc) { return s.createPlayer(this.actor(session), session.tournamentId, doc) },
    updatePlayer(session, id, patch) { return s.updatePlayer(this.actor(session), session.tournamentId, id, patch) },
    removePlayer(session, id) { return s.removePlayer(this.actor(session), session.tournamentId, id) },
    bulkPreview(session, csv) { return s.previewBulk(this.actor(session), session.tournamentId, csv) },
    bulkImport(session, csv) { return s.importBulk(this.actor(session), session.tournamentId, csv) },
    uploadFile(session, file) { return s.uploadFile(this.actor(session), session.tournamentId, file) },
    readFile(session, id) { return s.readFile(this.actor(session), id) },
  },
}
