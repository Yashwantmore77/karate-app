// PRD Rule 1: a player's age is ALWAYS taken against the tournament's master
// age date, never against today. A tournament held in March that calculates
// against 1 January must put a player who turns 14 in February in the 12-13
// group, and using the current date would silently move them.

// null and '' both coerce to a valid Date (the epoch), which would quietly
// turn a missing date of birth into age 57 instead of flagging it.
const toDate = (value) => {
  if (value == null || value === '') return null
  return value instanceof Date ? value : new Date(value)
}

const isValid = (date) => date instanceof Date && !Number.isNaN(date.getTime())

/**
 * Whole years from date of birth to the tournament's master age date.
 * Returns null when either date is missing or unparseable, so a caller can
 * report bad data rather than registering someone into the wrong group.
 */
export function calculateAge(dob, masterAgeDate) {
  const born = toDate(dob)
  const at = toDate(masterAgeDate)
  if (!isValid(born) || !isValid(at)) return null

  let age = at.getFullYear() - born.getFullYear()
  const monthDiff = at.getMonth() - born.getMonth()
  // A birthday later in the year than the master date has not happened yet.
  if (monthDiff < 0 || (monthDiff === 0 && at.getDate() < born.getDate())) age -= 1
  return age
}

export const matchesGender = (group, gender) =>
  !group.gender || group.gender === 'Mixed' || group.gender === gender

/**
 * The age groups a player qualifies for. More than one means the tournament's
 * groups overlap, which is the admin's decision to resolve rather than ours.
 */
export function eligibleAgeGroups(age, gender, ageGroups = []) {
  if (age == null) return []
  return ageGroups.filter((group) =>
    group.active !== false
    && matchesGender(group, gender)
    && age >= group.minAge
    && age <= group.maxAge
  )
}

export const suggestAgeGroup = (age, gender, ageGroups) =>
  eligibleAgeGroups(age, gender, ageGroups)[0] || null
