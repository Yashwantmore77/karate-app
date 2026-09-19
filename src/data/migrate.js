// One-time move from the prototype's nested keys (matches-<categoryId>) to flat
// collections. Legacy keys are left in place; this only ever adds.

import { _key } from './adapters/local'

const FLAG = 'kt:v1:migrated'

const readLegacy = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

const writeFlat = (collection, rows) => {
  if (!rows.length) return
  localStorage.setItem(_key(collection), JSON.stringify(rows))
}

export const migrateLegacyData = () => {
  if (localStorage.getItem(FLAG)) return false

  const tournaments = readLegacy('tournaments') || []
  const categories = []
  const athletes = []
  const matches = []

  tournaments.forEach((t) => {
    ;(readLegacy(`categories-${t.id}`) || []).forEach((cat) => {
      categories.push(cat)
      ;(readLegacy(`competitors-${cat.id}`) || []).forEach((comp) => {
        // Competitors were stored per category; athletes belong to the tournament.
        if (!athletes.some((a) => a.id === comp.id)) {
          athletes.push({ ...comp, tournamentId: t.id, categoryId: cat.id })
        }
      })
      ;(readLegacy(`matches-${cat.id}`) || []).forEach((m) => {
        matches.push({ ...m, categoryId: cat.id })
      })
    })
  })

  writeFlat('tournaments', tournaments)
  writeFlat('categories', categories)
  writeFlat('athletes', athletes)
  writeFlat('matches', matches)

  localStorage.setItem(FLAG, new Date().toISOString())
  return true
}
