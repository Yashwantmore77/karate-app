// Standard category sets an organiser can load in one step, then edit.
//
// Weights are written as on the federation's chart: "-35" is up to 35 kg,
// "+82" is over 82 kg. Each class starts where the previous one ends.

/** "-20" → { name: '-20 KG', minWeight: <previous>, maxWeight: 20 }; "+60" → open above 60. */
export function weightClasses(chart) {
  let previous = null
  return chart.map((entry) => {
    const kg = Number(String(entry).replace(/[+-]/g, ''))
    const open = String(entry).startsWith('+')
    const row = open
      ? { name: `+${kg} KG`, minWeight: kg, maxWeight: null }
      : { name: `-${kg} KG`, minWeight: previous, maxWeight: kg }
    if (!open) previous = kg
    return row
  })
}

const SGFI_BOYS_17 = ['-35', '-40', '-45', '-50', '-54', '-58', '-62', '-66', '-70', '-74', '-78', '-82', '+82']
const SGFI_GIRLS_17 = ['-32', '-36', '-40', '-44', '-48', '-52', '-56', '-60', '-64', '-68', '+68']

export const CATEGORY_PRESETS = {
  sgfi: {
    label: 'School Games Federation of India (SGFI)',
    description: 'U-14, U-17 and U-19, boys and girls, with the SGFI karate weight classes. Ages are counted on the Master Age Calculation Date; edit the age ranges if your event uses different ones.',
    groups: [
      { name: 'U-14 Boys', gender: 'M', minAge: 8, maxAge: 13, weights: ['-20', '-25', '-30', '-35', '-40', '-45', '-50', '-55', '-60', '+60'] },
      { name: 'U-14 Girls', gender: 'F', minAge: 8, maxAge: 13, weights: ['-18', '-22', '-24', '-26', '-30', '-34', '-38', '-42', '-46', '-50', '+50'] },
      { name: 'U-17 Boys', gender: 'M', minAge: 14, maxAge: 16, weights: SGFI_BOYS_17 },
      { name: 'U-17 Girls', gender: 'F', minAge: 14, maxAge: 16, weights: SGFI_GIRLS_17 },
      { name: 'U-19 Boys', gender: 'M', minAge: 17, maxAge: 18, weights: SGFI_BOYS_17 },
      { name: 'U-19 Girls', gender: 'F', minAge: 17, maxAge: 18, weights: SGFI_GIRLS_17 },
    ],
  },
}
