import { bracketSvg, placesFromPlayers, placesFromBracket, sheetsForPlayers, sheetSize } from './bracketSheet'

describe('printed draw sheet', () => {
  it('signs off with four judges and the referee', () => {
    const svg = bracketSvg({ title: 'KARATE DEVELOPMENT ASSOCIATION DISTRICT DEWAS', event: 'U-14 Boys -35 KG', size: 16 })
    expect(svg).toContain('KARATE DEVELOPMENT ASSOCIATION DISTRICT DEWAS')
    expect(svg).toContain('U-14 Boys -35 KG')
    for (const who of ['Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Referee']) expect(svg).toContain(who)
    expect(svg).not.toContain('Judge 5')
    expect(svg).toContain('3rd/4th Place')
    // 16 + 8 + 4 + 2 boxes in the tree, 3 for the medals, 3 for the 3rd/4th bout
    expect(svg.match(/<rect /g)).toHaveLength(30 + 3 + 3)
  })

  it('places players so every bye is a single one', () => {
    const names = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    expect(sheetSize(names.length)).toBe(16)
    const places = placesFromPlayers(names)
    expect(places).toHaveLength(16)
    for (let bout = 0; bout < 8; bout += 1) expect(places[bout * 2]).not.toBe('')
    expect(places.filter(Boolean)).toHaveLength(10)
  })

  it('splits a big category over several sheets, and fits small ones', () => {
    const many = Array.from({ length: 20 }, (_, i) => `P${i}`)
    expect(sheetsForPlayers({ title: 'T', event: 'E', names: many }).map((s) => [s.size, s.sheet])).toEqual([[16, 'Sheet 1 of 2'], [16, 'Sheet 2 of 2']])
    const pools = [{ label: 'Pool A', names: many.slice(0, 9) }, { label: 'Pool B', names: many.slice(9, 17) }]
    expect(sheetsForPlayers({ title: 'T', event: 'E', groups: pools }).map((s) => [s.size, s.sheet, s.columns[0].filter(Boolean).length]))
      .toEqual([[16, 'Pool A · Sheet 1 of 2', 9], [8, 'Pool B · Sheet 2 of 2', 8]])
    expect(sheetsForPlayers({ title: 'T', event: 'E', names: ['a', 'b', 'c'] })[0].size).toBe(4)
  })

  it('reads a generated bracket, third-place bout included', () => {
    const rounds = [
      { matches: [{ aka: { name: 'A' }, ao: { name: 'B' } }, { aka: { name: 'C' }, ao: { name: 'D' } }] },
      { matches: [{ aka: { name: 'A' }, ao: { name: 'D' } }, { thirdPlace: true, aka: { name: 'B' }, ao: { name: 'C' } }] },
    ]
    const sheet = placesFromBracket(rounds)
    expect(sheet.size).toBe(4)
    expect(sheet.columns[0]).toEqual(['A', 'B', 'C', 'D'])
    expect(sheet.columns[1]).toEqual(['A', 'D'])
    expect(sheet.third).toEqual(['B', 'C'])
  })
})
