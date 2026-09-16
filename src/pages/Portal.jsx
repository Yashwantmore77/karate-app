import { useEffect, useState } from 'react'
import { collection, onSnapshot, db, JUDGE_COUNT } from '../firebase'
import { useCurrentMatch } from '../useMatch'

export default function Portal() {
  const { match, ready } = useCurrentMatch()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!match) { setCount(0); return }
    return onSnapshot(collection(db, 'matches', match.id, 'submitted'), (s) =>
      setCount(s.size)
    )
  }, [match?.id])

  if (!ready) return <div className="center muted">Loading…</div>
  if (!match) return <div className="center muted">No match yet.</div>

  const revealed = match.status === 'revealed' && match.winner

  return (
    <div className="board">
      <div className={`side aka-bg ${revealed && match.winner === 'AKA' ? 'win' : ''}`}>
        <div className="side-name">{match.akaName}</div>
        <div className="side-score">{revealed ? match.akaTotal?.toFixed(1) : '—'}</div>
      </div>

      <div className="middle">
        {match.status === 'pending' && <span className="muted">Round not open</span>}
        {match.status === 'open' && (
          <span className="counting">{count} / {JUDGE_COUNT} scored</span>
        )}
        {revealed && (
          <span className="winner-text">
            {match.winner === 'TIE'
              ? 'Tie'
              : `${match.winner === 'AKA' ? match.akaName : match.aoName} wins`}
          </span>
        )}
      </div>

      <div className={`side ao-bg ${revealed && match.winner === 'AO' ? 'win' : ''}`}>
        <div className="side-name">{match.aoName}</div>
        <div className="side-score">{revealed ? match.aoTotal?.toFixed(1) : '—'}</div>
      </div>
    </div>
  )
}
