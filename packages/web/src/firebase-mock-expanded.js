// Enhanced mock Firebase with full tournament system

const testUsers = [
  { email: 'admin@kata.local', password: 'test123', uid: 'admin-uid-001', role: 'admin' },
  { email: 'referee@kata.local', password: 'test123', uid: 'ref-uid-001', role: 'referee' },
  { email: 'judge1@kata.local', password: 'test123', uid: 'judge1-uid', role: 'judge', seat: 1 },
  { email: 'judge2@kata.local', password: 'test123', uid: 'judge2-uid', role: 'judge', seat: 2 },
  { email: 'judge3@kata.local', password: 'test123', uid: 'judge3-uid', role: 'judge', seat: 3 },
  { email: 'judge4@kata.local', password: 'test123', uid: 'judge4-uid', role: 'judge', seat: 4 },
]

const roles = {
  'admin-uid-001': { role: 'admin', name: 'Administrator' },
  'ref-uid-001': { role: 'referee', name: 'Referee' },
  'judge1-uid': { role: 'judge', seat: 1, name: 'Judge 1' },
  'judge2-uid': { role: 'judge', seat: 2, name: 'Judge 2' },
  'judge3-uid': { role: 'judge', seat: 3, name: 'Judge 3' },
  'judge4-uid': { role: 'judge', seat: 4, name: 'Judge 4' },
}

// Sample tournament data
const sampleTournament = {
  id: 'tournament-001',
  name: 'Spring Karate Championship 2026',
  date: new Date('2026-03-20'),
  location: 'Convention Center',
  status: 'active',
  scoringTemplate: 'kata',
  createdAt: new Date(),
}

const sampleCategories = [
  {
    id: 'cat-u12-boys',
    tournamentId: 'tournament-001',
    name: 'U12 Boys Kata',
    ageGroup: 'U12',
    gender: 'M',
    division: 'Individual',
    createdAt: new Date(),
  },
  {
    id: 'cat-u16-girls',
    tournamentId: 'tournament-001',
    name: 'U16 Girls Kata',
    ageGroup: 'U16',
    gender: 'F',
    division: 'Individual',
    createdAt: new Date(),
  },
]

const sampleCompetitors = {
  'cat-u12-boys': [
    { id: 'comp-001', name: 'Kenji Yamamoto', number: 1, rank: 1 },
    { id: 'comp-002', name: 'Takeshi Nakamura', number: 2, rank: 2 },
    { id: 'comp-003', name: 'Hiroshi Tanaka', number: 3, rank: 3 },
    { id: 'comp-004', name: 'Yuki Suzuki', number: 4, rank: 4 },
  ],
  'cat-u16-girls': [
    { id: 'comp-101', name: 'Sakura Yamada', number: 1, rank: 1 },
    { id: 'comp-102', name: 'Yuki Matsumoto', number: 2, rank: 2 },
    { id: 'comp-103', name: 'Hana Watanabe', number: 3, rank: 3 },
  ],
}

const scoringTemplates = {
  kata: [
    { name: 'Technique', code: 'tech', weight: 1.0, min: 1.0, max: 10.0, step: 0.1 },
    { name: 'Power', code: 'power', weight: 1.0, min: 1.0, max: 10.0, step: 0.1 },
    { name: 'Clarity', code: 'clear', weight: 1.0, min: 1.0, max: 10.0, step: 0.1 },
    { name: 'Overall', code: 'overall', weight: 1.0, min: 1.0, max: 10.0, step: 0.1 },
  ],
  kumite: [
    { name: 'Points', code: 'points', weight: 1.0, min: 0, max: 99, step: 1 },
    { name: 'Control', code: 'control', weight: 0.5, min: 1.0, max: 10.0, step: 0.1 },
    { name: 'Sportsmanship', code: 'sport', weight: 0.5, min: 1.0, max: 10.0, step: 0.1 },
  ],
}

let currentUser = null
let authStateCallbacks = []
let firestoreData = {
  tournaments: {
    'tournament-001': sampleTournament,
  },
  categories: {
    'cat-u12-boys': sampleCategories[0],
    'cat-u16-girls': sampleCategories[1],
  },
  roles: {},
  matches: {},
}

let unsubscribers = []

// Initialize
Object.entries(roles).forEach(([uid, role]) => {
  firestoreData.roles[uid] = role
})

Object.entries(sampleCompetitors).forEach(([catId, competitors]) => {
  if (!firestoreData.competitors) firestoreData.competitors = {}
  firestoreData.competitors[catId] = {}
  competitors.forEach(comp => {
    firestoreData.competitors[catId][comp.id] = comp
  })
})

// Mock Auth
export const auth = {
  currentUser: null,
}

export async function signInWithEmailAndPassword(auth, email, password) {
  const user = testUsers.find(u => u.email === email && u.password === password)
  if (!user) throw new Error('Wrong email or password.')
  currentUser = { uid: user.uid, email: user.email }
  auth.currentUser = currentUser
  notifyAuthStateChanged()
  return { user: currentUser }
}

export async function signOut(auth) {
  currentUser = null
  auth.currentUser = null
  notifyAuthStateChanged()
}

export function onAuthStateChanged(auth, callback) {
  authStateCallbacks.push(callback)
  callback(currentUser)
  return () => {
    authStateCallbacks = authStateCallbacks.filter(cb => cb !== callback)
  }
}

function notifyAuthStateChanged() {
  authStateCallbacks.forEach(cb => cb(currentUser))
}

// Mock Firestore
export const db = {}

export function collection(db, ...path) {
  return { path }
}

export function doc(db, ...path) {
  return { path }
}

export async function getDoc(docRef) {
  const data = getDataByPath(docRef.path)
  return {
    exists: () => data !== undefined,
    data: () => data,
  }
}

export async function getDocs(collectionRef) {
  const data = getDataByPath(collectionRef.path) || {}
  return {
    docs: Object.entries(data).map(([id, d]) => ({
      id,
      data: () => d,
    })),
  }
}

export async function addDoc(collectionRef, data) {
  const id = Date.now().toString()
  const fullPath = [...collectionRef.path, id]
  setDataByPath(fullPath, { ...data, id })
  notifySnapshot(collectionRef.path)
  return { id }
}

export async function setDoc(docRef, data) {
  setDataByPath(docRef.path, data)
  notifySnapshot(docRef.path.slice(0, -1))
}

export async function updateDoc(docRef, updates) {
  const existing = getDataByPath(docRef.path) || {}
  setDataByPath(docRef.path, { ...existing, ...updates })
  notifySnapshot(docRef.path.slice(0, -1))
}

export async function deleteDoc(docRef) {
  deleteDataByPath(docRef.path)
  notifySnapshot(docRef.path.slice(0, -1))
}

export function serverTimestamp() {
  return new Date()
}

// Snapshot listeners
const listeners = new Map()

export function onSnapshot(ref, callback) {
  const key = JSON.stringify(ref.path)
  if (!listeners.has(key)) {
    listeners.set(key, [])
  }

  const callSnapshot = () => {
    if ('limit' in ref) {
      const data = getDataByPath(ref.path)
      const docs = Object.entries(data || {})
        .sort((a, b) => {
          const aTime = b[1]?.createdAt?.getTime?.() ?? 0
          const bTime = a[1]?.createdAt?.getTime?.() ?? 0
          return aTime - bTime
        })
        .slice(0, ref.limit)
        .map(([id, d]) => ({ id, data: () => d }))
      callback({ docs, size: docs.length })
    } else {
      const data = getDataByPath(ref.path)
      if (Array.isArray(data)) {
        const docs = data.map((d, i) => ({ id: i, data: () => d }))
        callback({ docs, size: docs.length, exists: () => true })
      } else if (data && typeof data === 'object') {
        const docs = Object.entries(data).map(([id, d]) => ({ id, data: () => d }))
        callback({ docs, size: docs.length, exists: () => docs.length > 0 })
      } else {
        callback({ docs: [], size: 0, exists: () => false, data: () => undefined })
      }
    }
  }

  callSnapshot()
  const callbacks = listeners.get(key)
  callbacks.push(callSnapshot)

  return () => {
    const idx = callbacks.indexOf(callSnapshot)
    if (idx > -1) callbacks.splice(idx, 1)
  }
}

export function query(ref, ...constraints) {
  const q = { path: ref.path }
  constraints.forEach(c => {
    if (c.type === 'orderBy') q.orderBy = c
    if (c.type === 'limit') q.limit = c.value
  })
  return q
}

export function orderBy(field, direction) {
  return { type: 'orderBy', field, direction }
}

export function limit(n) {
  return { type: 'limit', value: n }
}

// Helpers
function getDataByPath(path) {
  let current = firestoreData
  for (const segment of path) {
    current = current[segment]
    if (!current) return undefined
  }
  return current
}

function setDataByPath(path, value) {
  let current = firestoreData
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    if (!current[segment]) current[segment] = {}
    current = current[segment]
  }
  current[path[path.length - 1]] = value
}

function deleteDataByPath(path) {
  let current = firestoreData
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i]
    if (!current[segment]) return
    current = current[segment]
  }
  delete current[path[path.length - 1]]
}

function notifySnapshot(path) {
  const key = JSON.stringify(path)
  const callbacks = listeners.get(key) || []
  callbacks.forEach(cb => cb())

  if (path.length > 0) {
    const parentPath = path.slice(0, -1)
    notifySnapshot(parentPath)
  }
}

// Scoring config
export const SCORE_MIN = 1
export const SCORE_MAX = 3
export const SCORE_STEP = 1
export const SCORE_VALUES = [1, 2, 3]
export const JUDGE_COUNT = 4

export const clampScore = (v) =>
  Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(v)))

// Get scoring template
export function getScoringTemplate(templateName = 'kata') {
  return scoringTemplates[templateName] || scoringTemplates.kata
}

// Calculate average score from judge scores
export function calculateAverageScore(judgeScores) {
  if (!judgeScores || Object.keys(judgeScores).length === 0) return 0
  const scores = Object.values(judgeScores)
  const sum = scores.reduce((a, b) => a + b, 0)
  return Math.round((sum / scores.length) * 10) / 10
}

// Export test data access (for development)
export const testData = {
  tournaments: sampleTournament,
  categories: sampleCategories,
  competitors: sampleCompetitors,
  scoringTemplates,
}

// Export firestoreData for debugging
export const debugData = () => firestoreData
