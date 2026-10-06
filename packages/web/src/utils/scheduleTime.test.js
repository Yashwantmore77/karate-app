import { describe, it, expect } from 'vitest'
import {
  localInputToIso, isoToLocalInput, formatSlot, formatSlotTime, describeClashes,
} from './scheduleTime'

describe('localInputToIso', () => {
  it('stamps the browser timezone onto a naive wall-clock time', () => {
    // The API refuses a time with no zone, so the conversion has to add one.
    const iso = localInputToIso('2026-05-15T13:00')
    expect(iso).toMatch(/Z$/)
    // Whatever zone the test runs in, it must mean 13:00 locally.
    expect(new Date(iso).getHours()).toBe(13)
  })

  it('round-trips through the input format unchanged', () => {
    expect(isoToLocalInput(localInputToIso('2026-05-15T13:00'))).toBe('2026-05-15T13:00')
  })

  it('treats an empty field as no time at all, not as the epoch', () => {
    expect(localInputToIso('')).toBeNull()
    expect(localInputToIso(null)).toBeNull()
  })

  it('returns null for something unparseable rather than Invalid Date', () => {
    expect(localInputToIso('not a time')).toBeNull()
  })
})

describe('isoToLocalInput', () => {
  it('pads single-digit months, days, hours and minutes', () => {
    // An unpadded value is silently rejected by the input, which then shows
    // blank and looks like the match was never scheduled.
    const padded = isoToLocalInput(new Date(2026, 0, 2, 3, 4).toISOString())
    expect(padded).toBe('2026-01-02T03:04')
  })

  it('is blank for a match with no time', () => {
    expect(isoToLocalInput(null)).toBe('')
    expect(isoToLocalInput('')).toBe('')
  })

  it('is blank rather than NaN for a corrupt value', () => {
    expect(isoToLocalInput('nonsense')).toBe('')
  })
})

describe('formatSlot', () => {
  it('says so plainly when there is no time', () => {
    expect(formatSlot(null)).toBe('Unscheduled')
    expect(formatSlot('nonsense')).toBe('Unscheduled')
  })

  it('renders a real instant', () => {
    expect(formatSlot(new Date(2026, 4, 15, 13, 0).toISOString())).toContain('15')
  })
})

describe('formatSlotTime', () => {
  it('uses a dash for an unscheduled bout, to keep a table column aligned', () => {
    expect(formatSlotTime(null)).toBe('—')
    expect(formatSlotTime('nonsense')).toBe('—')
  })
})

describe('describeClashes', () => {
  const clash = {
    uid: 'ref-uid-001',
    role: 'referee',
    otherRole: 'referee',
    matchId: 'm1',
    scheduledAt: new Date(2026, 4, 15, 13, 0).toISOString(),
    mat: 2,
  }

  it('names the person, what they are doing, and where', () => {
    const [line] = describeClashes([clash], () => 'Sanjay Rao')
    expect(line).toContain('Sanjay Rao')
    expect(line).toContain('is refereeing')
    expect(line).toContain('on mat 2')
  })

  it('falls back to the uid when the roster has not loaded', () => {
    // Better a line with an id in it than a conflict the referee cannot see.
    const [line] = describeClashes([clash], () => null)
    expect(line).toContain('ref-uid-001')
  })

  it('leaves out the mat when the other bout has none', () => {
    const [line] = describeClashes([{ ...clash, mat: null }], () => 'Sanjay Rao')
    expect(line).not.toContain('mat')
  })

  it('describes a competitor as fighting, not officiating', () => {
    const [line] = describeClashes(
      [{ ...clash, role: 'competitor', otherRole: 'competitor' }],
      () => 'Aarav Deshmukh'
    )
    expect(line).toContain('is fighting in')
  })

  it('survives a payload that is missing or the wrong shape', () => {
    expect(describeClashes(undefined, () => 'x')).toEqual([])
    expect(describeClashes(null, () => 'x')).toEqual([])
  })

  it('still produces a line with no resolver at all', () => {
    const [line] = describeClashes([clash])
    expect(line).toContain('ref-uid-001')
  })
})

describe('describeClashes for a mat', () => {
  it('names the mat rather than a person', () => {
    const [line] = describeClashes([{
      uid: null, role: 'mat', otherRole: 'mat', matchId: 'm1',
      scheduledAt: new Date(2026, 4, 15, 13, 0).toISOString(), mat: 3,
    }], () => 'should not be asked')
    expect(line).toMatch(/^Mat 3 already has a bout at /)
    expect(line).not.toContain('null')
  })
})
