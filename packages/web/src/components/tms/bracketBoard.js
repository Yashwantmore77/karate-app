// The bracket board's shape, shared by the Bracket tab and the Draw tab's
// knockout sheet so both look like the paper draw sheet: first-round AKA /
// AO boxes on the left, each winner's box between the two it comes from,
// the final on the right, then 1st / 2nd / 3rd and the 3rd/4th place bout.
export const BOX_W = 196
export const BOX_H = 36
export const STEP = 46
export const TOP = 8
export const AKA = '#e53935'
export const AO = '#1e63d6'

/** The board's height for a bracket of `size` places. */
export const boardHeight = (size) => TOP + size * STEP + 20

/** The vertical centre of every box, column by column (first round first). */
export function boardCentres(size) {
  const centres = []
  for (let col = 0, list = Array.from({ length: size }, (_, i) => TOP + STEP * (i + 0.5)); col < Math.log2(size); col += 1) {
    centres.push(list)
    const next = []
    for (let i = 0; i < list.length; i += 2) next.push((list[i] + list[i + 1]) / 2)
    list = next
  }
  return centres
}
