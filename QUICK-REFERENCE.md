# Quick Reference - Karate Scoring System

## 🚀 Quick Start (Copy-Paste Ready)

### Start Dev Server
```bash
cd C:\Users\FTT\Yashwant\kata-app
npm run dev
```
**URL**: `http://localhost:5175/`

### Test Logins
```
Referee:  referee@kata.local / test123
Judge 1:  judge1@kata.local / test123
Judge 2:  judge2@kata.local / test123  
Judge 3:  judge3@kata.local / test123
Judge 4:  judge4@kata.local / test123
Admin:    admin@kata.local / test123
```

### Public Portal
`http://localhost:5175/?portal` (no login)

---

## 📚 Documentation Quick Links

| Need | File | Sections |
|------|------|----------|
| How to use system | [USER-GUIDE.md](USER-GUIDE.md) | Ref/Judge/Admin/Audience |
| System architecture | [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md) | 14 sections |
| Build roadmap | [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md) | 10 phases |
| Getting started | [GETTING-STARTED.md](GETTING-STARTED.md) | This guide |
| Mock data setup | [MOCK-FIREBASE-SETUP.md](MOCK-FIREBASE-SETUP.md) | Test/production |
| Original Firebase | [SETUP-GUIDE.html](SETUP-GUIDE.html) | Real backend |

---

## 💾 Firebase Import Cheat Sheet

### Single Imports
```javascript
import { auth, db } from '../firebase'
import { getScoringTemplate, calculateAverageScore } from '../firebase'
```

### Auth Functions
```javascript
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from '../firebase'
```

### Firestore CRUD
```javascript
import {
  collection, doc, getDoc, getDocs,
  addDoc, setDoc, updateDoc, deleteDoc,
  serverTimestamp, onSnapshot
} from '../firebase'
```

### Query Functions
```javascript
import { query, orderBy, limit } from '../firebase'
```

### Utilities
```javascript
import {
  SCORE_MIN, SCORE_MAX, SCORE_STEP, JUDGE_COUNT,
  clampScore, getScoringTemplate, calculateAverageScore,
  testData, debugData
} from '../firebase'
```

---

## 🪝 Hooks Quick Reference

### useTournament.js
```javascript
import { useTournament, useCategories, useCompetitors, useScoringCriteria } from '../hooks/useTournament'

// Get tournament data
const { tournament, categories, loading } = useTournament(tournamentId)

// Get categories  
const { categories, loading } = useCategories(tournamentId)

// Get competitors in category
const { competitors, loading } = useCompetitors(categoryId)

// Get scoring criteria
const { criteria, loading } = useScoringCriteria('kata') // or 'kumite'
```

### useScores.js
```javascript
import { useScores, useScoreValidation, calculateWinner } from '../hooks/useScores'

// Manage score entry
const { 
  scores, saved, loading, 
  updateScore, submitScores, getCompetitorAverage 
} = useScores(matchId, uid, criteria)

// Update a score
updateScore('competitor1', 'tech', 8.5)

// Submit all scores
await submitScores()

// Get average for one competitor
const avg = getCompetitorAverage('competitor1')

// Validate a score
const { isValid, error } = useScoreValidation(8.5, 1.0, 10.0)

// Calculate winner
const winner = calculateWinner(avg1, avg2) // Returns 'competitor1', 'competitor2', 'tie'
```

### useStandings.js
```javascript
import { 
  useStandings, useCompetitorStats, 
  updateStandingsAfterMatch, formatStanding 
} from '../hooks/useStandings'

// Get current standings
const { standings, loading } = useStandings(categoryId)

// Get individual stats
const { stats, loading } = useCompetitorStats(categoryId, competitorId)

// Update standings after match
const newStandings = updateStandingsAfterMatch(standings, {
  competitor1: 'id1',
  competitor2: 'id2',
  winner: 'competitor1',
  avg1: 8.5,
  avg2: 7.9
})

// Format for display
const display = formatStanding(standing)
// Returns: { rank, name, matches, wins, losses, ties, averageScore }
```

---

## 🎯 Scoring Data Structure

### Scoring Criteria Template (Kata)
```javascript
[
  { 
    name: 'Technique', 
    code: 'tech', 
    weight: 1.0, 
    min: 1.0, 
    max: 10.0, 
    step: 0.1 
  },
  // ... 3 more criteria
]
```

### Score Entry Object
```javascript
{
  competitor1: {
    tech: 8.0,
    power: 8.5,
    clear: 7.9,
    overall: 8.1
  },
  competitor2: {
    tech: 7.5,
    power: 8.0,
    clear: 8.2,
    overall: 7.8
  }
}
```

### Match Object
```javascript
{
  id: 'match-123',
  categoryId: 'cat-u12-boys',
  competitor1: { id: 'c1', name: 'Kenji' },
  competitor2: { id: 'c2', name: 'Takeshi' },
  status: 'open', // pending, open, scoring, revealed, completed
  scores: { /* judge scores */ },
  results: {
    winner: 'c1',
    avg1: 8.15,
    avg2: 7.9
  }
}
```

### Standings Row
```javascript
{
  id: 'comp-001',
  name: 'Kenji Yamamoto',
  rank: 1,
  matches: 3,
  wins: 3,
  losses: 0,
  ties: 0,
  totalScore: 24.8,
  averageScore: 8.27
}
```

---

## 🔧 Common Patterns

### Load and Display Competitors
```javascript
export default function CompetitorList({ categoryId }) {
  const { competitors, loading } = useCompetitors(categoryId)
  
  if (loading) return <div>Loading...</div>
  
  return (
    <div>
      {competitors.map(comp => (
        <div key={comp.id}>
          <span>#{comp.number}</span>
          <span>{comp.name}</span>
        </div>
      ))}
    </div>
  )
}
```

### Score Entry Panel
```javascript
export default function ScorePanel({ criterionName, value, onChange, disabled }) {
  const bump = (delta) => onChange(clampScore(value + delta))
  
  return (
    <div className="panel">
      <div>{criterionName}</div>
      <button onClick={() => bump(-0.1)} disabled={disabled}>−</button>
      <input value={value.toFixed(1)} onChange={e => onChange(parseFloat(e.target.value))} />
      <button onClick={() => bump(0.1)} disabled={disabled}>+</button>
    </div>
  )
}
```

### Display Standings
```javascript
export default function LeaderboardDisplay({ categoryId }) {
  const { standings } = useStandings(categoryId)
  
  return (
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Name</th>
          <th>Matches</th>
          <th>Average Score</th>
        </tr>
      </thead>
      <tbody>
        {standings.map((s, idx) => (
          <tr key={s.id}>
            <td>{idx + 1}</td>
            <td>{s.name}</td>
            <td>{s.matches}</td>
            <td>{s.averageScore.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
```

---

## 📊 Scoring Formula Reference

### Basic Average
```
Average = (J1 + J2 + J3 + J4) / 4

Example: (8.0 + 8.5 + 7.9 + 8.1) / 4 = 8.125 → 8.1
```

### Weighted Average (if criteria have weights)
```
Score = Σ(Criterion_Avg × Weight) / Σ(Weights)

Example:
- Tech: 8.0 × 1.0 = 8.0
- Power: 8.5 × 1.0 = 8.5
- Clear: 7.9 × 1.0 = 7.9
- Overall: 8.1 × 1.0 = 8.1
Total: 32.5 ÷ 4 = 8.125 → 8.1
```

### Winner Determination
```
if avg1 > avg2: competitor1 wins
if avg2 > avg1: competitor2 wins
if avg1 = avg2: tie (tiebreaker rules apply)
```

---

## 🔗 File Dependencies

```
firebase.js
├── uses: firebase-mock-expanded.js
└── exports: All auth, Firestore, utilities

App.jsx
├── imports: firebase, Login, Judge, Referee, Portal
└── manages: Auth state and role routing

Judge.jsx (to enhance)
├── imports: useScores, useScoringCriteria
└── displays: Score entry panels

Referee.jsx (to enhance)
├── imports: useTournament, useMatch, useScores
└── displays: Match control

Portal.jsx (to enhance)
├── imports: useCurrentMatch, useStandings
└── displays: Public results

Hooks
├── useTournament.js → Tournament, Category, Competitor data
├── useScores.js → Score entry and calculations
└── useStandings.js → Rankings and standings
```

---

## 🏗️ Next Components to Build

### Phase 1: Enhanced Judge Interface
- [ ] ScoreEntryPanel.jsx - Individual criterion scoring
- [ ] ScoringGuidelines.jsx - Help text for each criterion
- [ ] JudgeScreen.jsx - Full judge interface
- Update Judge.jsx to use new components

### Phase 2: Referee Dashboard  
- [ ] TournamentDashboard.jsx - Main referee screen
- [ ] MatchController.jsx - Match control interface
- [ ] MatchDisplay.jsx - Show current match info
- [ ] JudgeStatusBar.jsx - Show judge submissions
- Create/update Referee.jsx

### Phase 3: Admin Interface
- [ ] AdminPanel.jsx - Admin home
- [ ] TournamentManager.jsx - Create/edit tournaments
- [ ] CategoryManager.jsx - Manage categories
- [ ] CompetitorManager.jsx - Register competitors
- [ ] JudgeAssignment.jsx - Assign judges

---

## 🐛 Debug Helpers

### Access Mock Data from Console
```javascript
// In browser console:
window.debugData = () => { /* returns all mock data */ }

// Example:
const data = window.debugData()
console.log(data.tournaments)
console.log(data.categories)
console.log(data.competitors)
```

### Check Current User
```javascript
import { auth } from './firebase'

// In component:
console.log('Current user:', auth.currentUser)
console.log('UID:', auth.currentUser?.uid)
```

### Verify Scores
```javascript
import { calculateAverageScore } from '../firebase'

const scores = {
  judge1: 8.0,
  judge2: 8.5,
  judge3: 7.9,
  judge4: 8.1
}

const avg = calculateAverageScore(scores)
console.log('Average:', avg) // 8.1
```

---

## 🎨 Styling Reference

### Button Classes
```html
<button class="btn">Standard</button>
<button class="btn primary">Primary (blue)</button>
<button class="btn block">Full width</button>
<button class="btn primary block">Primary full width</button>
<button class="btn big">Large</button>
<button class="link">Text link</button>
```

### Text Classes
```html
<p class="title">Large title</p>
<p class="h2">Section heading</p>
<p class="muted">Gray text</p>
<p class="muted small">Gray small text</p>
<p class="error">Error message (red)</p>
```

### Layout Classes
```html
<div class="center">Centered content</div>
<div class="screen">Full screen container</div>
<div class="pad">Padded container</div>
<div class="bar">Top bar</div>
<div class="spacer">Flexible spacer</div>
```

---

## 📱 Responsive Notes

- **Mobile first**: Styles work on phones by default
- **Min width**: 320px (iPhone SE)
- **Tablet**: 768px
- **Desktop**: 1024px+
- **Portal**: Designed for big screens

---

## 🚀 Performance Tips

1. **Memoize calculations**: Use `useMemo` for score averages
2. **Lazy load components**: Import only when needed
3. **Optimize re-renders**: Use `useCallback` for callbacks
4. **Limit listeners**: Unsubscribe when component unmounts
5. **Cache data**: Use hook results across components

---

## ✅ Deployment Checklist

- [ ] Scores calculate correctly
- [ ] All 4 judges can score
- [ ] Referee can reveal results
- [ ] Portal shows live updates
- [ ] Standings update automatically
- [ ] No console errors
- [ ] Mobile friendly
- [ ] Works offline (mock mode)
- [ ] Backup/restore data
- [ ] Real Firebase configured

---

## 📞 Quick Help

**Something not working?**
1. Check browser console (F12)
2. Check [USER-GUIDE.md](USER-GUIDE.md) troubleshooting
3. Verify mock data with `debugData()`
4. Check file imports are correct
5. Restart dev server: `npm run dev`

**Want to understand more?**
- System design: [SYSTEM-DESIGN.md](SYSTEM-DESIGN.md)
- User manual: [USER-GUIDE.md](USER-GUIDE.md)
- Roadmap: [IMPLEMENTATION-ROADMAP.md](IMPLEMENTATION-ROADMAP.md)
- Getting started: [GETTING-STARTED.md](GETTING-STARTED.md)

---

**Version**: 1.0  
**Updated**: 2026-09-16  
**Status**: Active Development
