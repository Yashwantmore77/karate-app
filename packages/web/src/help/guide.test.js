import fs from 'fs'
import path from 'path'
import { HELP, TAB_GUIDE, WORKFLOW, workflowState } from './guide'
import { TABS } from '../pages/tms/TournamentManager'

const SRC = path.resolve(__dirname, '..')
const sources = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name)
  if (e.isDirectory()) return sources(p)
  return /\.jsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : []
})

describe('help texts', () => {
  it('every ⓘ icon in the app has a help text', () => {
    const used = new Set()
    for (const file of sources(SRC)) {
      for (const m of fs.readFileSync(file, 'utf8').matchAll(/<(?:InfoTip|HelpTitle)[^>]*\sid="([^"]+)"/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThan(40)
    const missing = [...used].filter((id) => !HELP[id]?.text)
    expect(missing).toEqual([])
  })

  it('every tournament tab says what it is for, and links only to real tabs', () => {
    const keys = TABS.map((t) => t.key)
    for (const key of keys) expect(TAB_GUIDE[key]?.text, key).toBeTruthy()
    for (const g of Object.values(TAB_GUIDE)) {
      for (const link of [g.before, g.after].filter(Boolean)) expect(keys).toContain(link.tab)
    }
    for (const step of WORKFLOW) if (step.tab) expect(keys).toContain(step.tab)
  })
})

describe('workflow progress', () => {
  const base = { id: 't1', name: 'Open', lifecycleStatus: 'DRAFT' }

  it('a new tournament starts at "Fill in details and rules"', () => {
    const flow = workflowState(base, {})
    expect(flow.steps[0].state).toBe('done')
    expect(flow.next.id).toBe('details')
  })

  it('follows the tournament along and skips steps it does not need', () => {
    const t = {
      ...base, organizer: 'KAI', venue: 'Pune', startDate: '2026-11-01', endDate: '2026-11-02', masterAgeDate: '2026-11-01',
      registrationStart: '2026-10-01', registrationClose: '2026-10-25', type: 'kumite', contactMobile: '9999999999', contactEmail: 'a@b.in',
      lifecycleStatus: 'WEIGH_IN', entriesLocked: true,
    }
    const stats = { ageGroups: 3, players: 10, pendingVerification: 0, kumitePlayers: 10, pendingWeighIn: 0, kataPlayers: 0, pools: 0 }
    const flow = workflowState(t, stats)
    const state = Object.fromEntries(flow.steps.map((s) => [s.id, s.state]))
    expect(state).toMatchObject({ categories: 'done', open: 'done', approve: 'done', close: 'done', weighin: 'done', lock: 'done', kata: 'skip' })
    expect(flow.next.id).toBe('draw')
    expect(flow.total).toBe(WORKFLOW.length - 1)
  })

  it('an optional step never becomes "the next step"', () => {
    const flow = workflowState({ ...base, lifecycleStatus: 'COMPLETED', resultsPublished: true, entriesLocked: true, drawLocked: true, weighInClosed: true },
      { ageGroups: 1, players: 1, pendingVerification: 0, pools: 1, matches: 1, scheduledMatches: 1, pendingMatches: 0, kataPlayers: 0, kumitePlayers: 1, certificates: 1, passes: 0 })
    expect(flow.steps.find((s) => s.id === 'passes').state).toBe('todo')
    expect(flow.next?.id).toBe('details') // the details are still empty in this made-up tournament
  })
})
