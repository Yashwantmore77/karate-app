// PRD Rule 2: a player's category is suggested from gender + age + event +
// weight, against the tournament's own configuration. Nothing here knows what
// a real age group or weight class is — those come from the tournament.

import { calculateAge, suggestAgeGroup, eligibleAgeGroups } from './age.js'

export const EVENTS = { KATA: 'kata', KUMITE: 'kumite' }

/**
 * A weight class is open-ended at one side when the other bound is absent:
 * "-35 KG" has only a maximum, "+45 KG" only a minimum.
 */
export function matchesWeight(category, weight) {
  if (weight == null) return false
  if (category.minWeight != null && weight <= category.minWeight) return false
  if (category.maxWeight != null && weight > category.maxWeight) return false
  return true
}

export function eligibleWeightCategories(weight, ageGroupId, weightCategories = []) {
  return weightCategories.filter((category) =>
    category.active !== false
    && (!ageGroupId || category.ageGroupId === ageGroupId)
    && matchesWeight(category, weight)
  )
}

export const suggestWeightCategory = (weight, ageGroupId, weightCategories) =>
  eligibleWeightCategories(weight, ageGroupId, weightCategories)[0] || null

/**
 * Suggests where a player belongs, and says why when it cannot decide. Kata
 * needs no weight class, so a kata entry is placed on age and gender alone.
 *
 * The result is a suggestion: the PRD lets an admin override it, and every
 * override is expected to reach the audit log.
 */
export function categorizePlayer(player, event, config = {}) {
  const { masterAgeDate, ageGroups = [], weightCategories = [] } = config
  const issues = []

  const age = calculateAge(player.dob, masterAgeDate)
  if (age == null) issues.push('Date of birth or master age date is missing or invalid')

  const eligibleGroups = eligibleAgeGroups(age, player.gender, ageGroups)
  const ageGroup = suggestAgeGroup(age, player.gender, ageGroups)
  if (age != null && !ageGroup) {
    issues.push(`No age group covers age ${age} for ${player.gender || 'unspecified gender'}`)
  }
  if (eligibleGroups.length > 1) {
    issues.push(`Age ${age} matches ${eligibleGroups.length} overlapping age groups`)
  }

  if (event === EVENTS.KATA) {
    return { age, ageGroup, weightCategory: null, issues, resolved: !!ageGroup && !issues.length }
  }

  const weight = player.weight ?? null
  if (weight == null) issues.push('Weight is required for kumite')

  const weightCategory = ageGroup
    ? suggestWeightCategory(weight, ageGroup.id, weightCategories)
    : null
  if (ageGroup && weight != null && !weightCategory) {
    issues.push(`No weight category in ${ageGroup.name} covers ${weight} kg`)
  }

  return {
    age,
    ageGroup,
    weightCategory,
    issues,
    resolved: !!ageGroup && !!weightCategory && !issues.length,
  }
}

/** The label a draw sheet shows, e.g. "Boys 12-13 / Kumite / -35 KG". */
export function categoryLabel({ ageGroup, weightCategory }, event) {
  const parts = [ageGroup?.name, event === EVENTS.KATA ? 'Kata' : 'Kumite', weightCategory?.name]
  return parts.filter(Boolean).join(' / ')
}
