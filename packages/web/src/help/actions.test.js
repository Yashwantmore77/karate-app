import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { collectActionLabels, PLACEHOLDER } from '../../scripts/action-labels.mjs'
import { explainAction } from './actions'
import { TABS } from '../pages/tms/TournamentManager'

// The web tests run from packages/web.
const SRC = path.resolve(process.cwd(), 'src')
// A label with a run-time part ("Delete {…}") is explained when a sample fills it.
const SAMPLES = ['2', 'Kata', 'Aarav Patil']
const explained = (label) => (label.includes(PLACEHOLDER) ? SAMPLES.some((s) => explainAction(label.replaceAll(PLACEHOLDER, s))) : !!explainAction(label))

describe('every action explains itself on hover', () => {
  it('has an explanation for every button, icon button, toggle, tab and menu action', () => {
    const actions = collectActionLabels(SRC)
    expect(actions.length).toBeGreaterThan(300)
    const missing = actions
      .filter((a) => !a.tipped && !a.titled && !a.inTooltip)
      .filter((a) => !a.labels.length || !a.labels.every(explained))
      .map((a) => `${a.file}:${a.line} <${a.tag}> ${a.labels.length ? a.labels.map((l) => `"${l}"`).join(' / ') : '(no label: add an aria-label)'}`)
    // Add the label to help/actions.js, or a data-tip where the button is drawn.
    expect(missing, missing.join('\n')).toEqual([])
  })

  it('explains the tournament tabs, and labels with counts, names and stages', () => {
    for (const t of TABS) expect(t.tip, t.label).toMatch(/\w/)
    expect(explainAction('Players (12)').tip).toMatch(/players/)
    expect(explainAction('Delete Aarav Patil').tip).toMatch(/Deletes Aarav Patil/)
    expect(explainAction('Switch to Kumite')).toMatchObject({ tip: expect.stringMatching(/puts Kumite on the mats/), needs: expect.any(String) })
    expect(explainAction('→ Registration open').tip).toMatch(/^Moves the tournament on to "Registration open"/)
    expect(explainAction('← Draft').tip).toMatch(/reason/)
    expect(explainAction('Lock entries').needs).toBeTruthy()
    expect(explainAction('Something nobody wrote')).toBeNull()
  })
})
