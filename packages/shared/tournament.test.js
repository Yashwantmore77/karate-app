import { describe, it, expect } from 'vitest'
import { calculateAge, eligibleAgeGroups, suggestAgeGroup } from './age'
import {
  matchesWeight, suggestWeightCategory, categorizePlayer, categoryLabel, EVENTS
} from './categories'
import {
  TOURNAMENT_STATUS, MATCH_STATUS, REGISTRATION_STATUS,
  tournamentLifecycle, matchLifecycle, registrationLifecycle,
  assertTransition, InvalidTransition,
} from './lifecycle'

const MASTER = '2027-01-01'

const ageGroups = [
  { id: 'ag-b1213', name: 'Boys 12-13', gender: 'M', minAge: 12, maxAge: 13 },
  { id: 'ag-g1213', name: 'Girls 12-13', gender: 'F', minAge: 12, maxAge: 13 },
  { id: 'ag-b1415', name: 'Boys 14-15', gender: 'M', minAge: 14, maxAge: 15 },
]

const weightCategories = [
  { id: 'w35', ageGroupId: 'ag-b1213', name: '-35 KG', maxWeight: 35 },
  { id: 'w40', ageGroupId: 'ag-b1213', name: '-40 KG', minWeight: 35, maxWeight: 40 },
  { id: 'w45', ageGroupId: 'ag-b1213', name: '-45 KG', minWeight: 40, maxWeight: 45 },
  { id: 'w45p', ageGroupId: 'ag-b1213', name: '+45 KG', minWeight: 45 },
]

const config = { masterAgeDate: MASTER, ageGroups, weightCategories }

describe('age against the master date (Rule 1)', () => {
  it('matches the PRD worked example', () => {
    expect(calculateAge('2014-06-15', MASTER)).toBe(12)
  })

  it('never uses today, so the answer does not drift as the tournament nears', () => {
    const asConfigured = calculateAge('2014-06-15', MASTER)
    const asConfiguredLater = calculateAge('2014-06-15', MASTER)
    expect(asConfigured).toBe(asConfiguredLater)
    // the same player against a different master date is a different age
    expect(calculateAge('2014-06-15', '2028-01-01')).toBe(13)
  })

  it('does not count a birthday that falls after the master date', () => {
    expect(calculateAge('2014-01-02', MASTER)).toBe(12)
    expect(calculateAge('2014-01-01', MASTER)).toBe(13)
  })

  it('returns null rather than guessing when a date is missing or junk', () => {
    expect(calculateAge(null, MASTER)).toBeNull()
    expect(calculateAge('not-a-date', MASTER)).toBeNull()
    expect(calculateAge('2014-06-15', undefined)).toBeNull()
  })
})

describe('age groups', () => {
  it('picks the group for the age and gender', () => {
    expect(suggestAgeGroup(12, 'M', ageGroups).id).toBe('ag-b1213')
    expect(suggestAgeGroup(12, 'F', ageGroups).id).toBe('ag-g1213')
    expect(suggestAgeGroup(14, 'M', ageGroups).id).toBe('ag-b1415')
  })

  it('offers nothing when no group covers the age', () => {
    expect(suggestAgeGroup(9, 'M', ageGroups)).toBeNull()
  })

  it('ignores groups switched off for this tournament', () => {
    const off = [{ ...ageGroups[0], active: false }]
    expect(suggestAgeGroup(12, 'M', off)).toBeNull()
  })

  it('reports every match so overlapping groups can be spotted', () => {
    const overlapping = [...ageGroups, { id: 'ag-wide', name: 'Boys 10-14', gender: 'M', minAge: 10, maxAge: 14 }]
    expect(eligibleAgeGroups(12, 'M', overlapping)).toHaveLength(2)
  })
})

describe('weight categories', () => {
  it('treats a class as open at the end its bound is missing', () => {
    expect(matchesWeight({ maxWeight: 35 }, 34.2)).toBe(true)
    expect(matchesWeight({ maxWeight: 35 }, 35)).toBe(true)
    expect(matchesWeight({ maxWeight: 35 }, 35.1)).toBe(false)
    expect(matchesWeight({ minWeight: 45 }, 60)).toBe(true)
    expect(matchesWeight({ minWeight: 45 }, 45)).toBe(false)
  })

  it('puts a player on the boundary in the lighter class', () => {
    expect(suggestWeightCategory(35, 'ag-b1213', weightCategories).id).toBe('w35')
    expect(suggestWeightCategory(35.1, 'ag-b1213', weightCategories).id).toBe('w40')
  })

  it('never crosses into another age group\'s classes', () => {
    expect(suggestWeightCategory(34, 'ag-b1415', weightCategories)).toBeNull()
  })

  it('has no opinion when the weight is unknown', () => {
    expect(suggestWeightCategory(null, 'ag-b1213', weightCategories)).toBeNull()
  })
})

describe('categorisation (Rule 2)', () => {
  it('places a kumite player from gender, age and weight', () => {
    const result = categorizePlayer(
      { dob: '2014-06-15', gender: 'M', weight: 34.2 }, EVENTS.KUMITE, config
    )
    expect(result.age).toBe(12)
    expect(result.ageGroup.name).toBe('Boys 12-13')
    expect(result.weightCategory.name).toBe('-35 KG')
    expect(result.resolved).toBe(true)
    expect(categoryLabel(result, EVENTS.KUMITE)).toBe('Boys 12-13 / Kumite / -35 KG')
  })

  it('needs no weight for kata', () => {
    const result = categorizePlayer(
      { dob: '2014-06-15', gender: 'M' }, EVENTS.KATA, config
    )
    expect(result.resolved).toBe(true)
    expect(result.weightCategory).toBeNull()
    expect(categoryLabel(result, EVENTS.KATA)).toBe('Boys 12-13 / Kata')
  })

  it('says why it cannot place a kumite player with no weight', () => {
    const result = categorizePlayer({ dob: '2014-06-15', gender: 'M' }, EVENTS.KUMITE, config)
    expect(result.resolved).toBe(false)
    expect(result.issues).toContain('Weight is required for kumite')
  })

  it('says why when the age falls outside every group', () => {
    const result = categorizePlayer(
      { dob: '2020-06-15', gender: 'M', weight: 20 }, EVENTS.KUMITE, config
    )
    expect(result.resolved).toBe(false)
    expect(result.issues.join(' ')).toMatch(/No age group covers age 6/)
  })

  it('says why when no weight class covers the player', () => {
    const result = categorizePlayer(
      { dob: '2014-06-15', gender: 'M', weight: 34.2 }, EVENTS.KUMITE,
      { ...config, weightCategories: [{ id: 'w20', ageGroupId: 'ag-b1213', name: '-20 KG', maxWeight: 20 }] }
    )
    expect(result.resolved).toBe(false)
    expect(result.issues.join(' ')).toMatch(/No weight category in Boys 12-13 covers 34.2 kg/)
  })

  it('flags bad data instead of registering someone into the wrong group', () => {
    const result = categorizePlayer({ gender: 'M', weight: 34 }, EVENTS.KUMITE, config)
    expect(result.age).toBeNull()
    expect(result.resolved).toBe(false)
  })
})

describe('lifecycles', () => {
  it('walks a tournament through the PRD order', () => {
    const order = [
      TOURNAMENT_STATUS.DRAFT, TOURNAMENT_STATUS.REGISTRATION_OPEN,
      TOURNAMENT_STATUS.REGISTRATION_CLOSED, TOURNAMENT_STATUS.VERIFICATION,
      TOURNAMENT_STATUS.WEIGH_IN, TOURNAMENT_STATUS.DRAW_GENERATED,
      TOURNAMENT_STATUS.READY, TOURNAMENT_STATUS.LIVE,
      TOURNAMENT_STATUS.COMPLETED, TOURNAMENT_STATUS.ARCHIVED,
    ]
    order.slice(0, -1).forEach((from, i) => {
      expect(tournamentLifecycle.can(from, order[i + 1])).toBe(true)
    })
  })

  it('refuses to skip the middle of the lifecycle', () => {
    expect(tournamentLifecycle.can(TOURNAMENT_STATUS.DRAFT, TOURNAMENT_STATUS.LIVE)).toBe(false)
    expect(() => assertTransition(
      tournamentLifecycle, TOURNAMENT_STATUS.DRAFT, TOURNAMENT_STATUS.LIVE
    )).toThrow(InvalidTransition)
  })

  it('lets an admin reopen registration but never unarchive', () => {
    expect(tournamentLifecycle.can(
      TOURNAMENT_STATUS.REGISTRATION_CLOSED, TOURNAMENT_STATUS.REGISTRATION_OPEN
    )).toBe(true)
    expect(tournamentLifecycle.next(TOURNAMENT_STATUS.ARCHIVED)).toEqual([])
  })

  it('allows a rejected registration to be corrected and resubmitted', () => {
    expect(registrationLifecycle.can(
      REGISTRATION_STATUS.REJECTED, REGISTRATION_STATUS.DRAFT
    )).toBe(true)
  })

  it('lets a completed match be reopened, which Rule 6 then makes auditable', () => {
    expect(matchLifecycle.can(MATCH_STATUS.COMPLETED, MATCH_STATUS.IN_PROGRESS)).toBe(true)
    expect(matchLifecycle.next(MATCH_STATUS.WALKOVER)).toEqual([])
  })
})
