// Aggregates completed matches into per-competitor win/loss/tie standings.

export const computeStandings = (competitors, matches) => {
  const table = new Map(
    competitors.map((c) => [c.id, { competitor: c, wins: 0, losses: 0, ties: 0, played: 0, scoreFor: 0, scoreAgainst: 0 }])
  )

  matches
    .filter((m) => m.status === 'completed')
    .forEach((m) => {
      const red = table.get(m.redId)
      const blue = table.get(m.blueId)
      if (!red || !blue) return

      red.played += 1
      blue.played += 1
      red.scoreFor += m.avgRed ?? 0
      red.scoreAgainst += m.avgBlue ?? 0
      blue.scoreFor += m.avgBlue ?? 0
      blue.scoreAgainst += m.avgRed ?? 0

      if (m.winner === 'red') {
        red.wins += 1
        blue.losses += 1
      } else if (m.winner === 'blue') {
        blue.wins += 1
        red.losses += 1
      } else {
        red.ties += 1
        blue.ties += 1
      }
    })

  return Array.from(table.values()).sort((a, b) => b.wins - a.wins || (b.scoreFor - b.scoreAgainst) - (a.scoreFor - a.scoreAgainst))
}
