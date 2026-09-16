# Implementation Roadmap - Karate Scoring System

## Project Structure

```
src/
├── components/
│   ├── TournamentDashboard.jsx      (Referee main screen)
│   ├── CategoryManager.jsx           (Create/edit categories)
│   ├── CompetitorManager.jsx         (Register competitors)
│   ├── JudgeAssignment.jsx           (Assign judges)
│   ├── MatchCreator.jsx              (Create matches)
│   ├── MatchDisplay.jsx              (Show current match)
│   ├── ScoreEntry.jsx                (Judge scoring interface)
│   ├── ResultsDisplay.jsx            (Show results/standings)
│   └── Portal.jsx                    (Public display - updated)
├── pages/
│   ├── AdminPanel.jsx                (Admin functions)
│   ├── Judge.jsx                     (Judge interface - enhanced)
│   ├── Referee.jsx                   (Referee interface - enhanced)
│   ├── Login.jsx                     (Login with tabs - done)
│   └── Portal.jsx                    (Public leaderboard - updated)
├── hooks/
│   ├── useTournament.js              (Tournament management)
│   ├── useMatch.js                   (Match management - updated)
│   ├── useScores.js                  (Score handling)
│   └── useStandings.js               (Calculate standings)
├── firebase.js                       (Configuration)
├── firebase-mock.js                  (Basic mock)
├── firebase-mock-expanded.js         (Full system mock)
└── main.jsx
```

---

## Phase 1: Core Data Structure (Week 1)

### ✅ Completed
- [x] Mock Firebase with test data
- [x] Test users and roles
- [x] Sample tournament, categories, competitors
- [x] Scoring templates (kata, kumite)

### ⏳ In Progress
- [ ] Update firebase.js to use firebase-mock-expanded.js
- [ ] Create data initialization script
- [ ] Verify data structure in all tests

### Components to Update
1. **firebase.js** - Point to expanded mock
2. **firebase-mock-expanded.js** - Ensure all methods work
3. **Test suite** - Verify mock behaves correctly

---

## Phase 2: Admin Panel (Week 2)

### What Admins Need
- [x] Create tournaments
- [x] Create categories  
- [x] Register competitors
- [ ] Manage judges
- [ ] Configure scoring criteria
- [ ] View tournament data

### Components to Build

#### AdminPanel.jsx
```jsx
export default function AdminPanel() {
  // Show admin options:
  // - Tournament Management
  // - Category Management
  // - Competitor Management
  // - Judge Management
  // - Settings
}
```

#### TournamentManager.jsx
```jsx
// List tournaments
// Create new tournament
// Edit tournament
// Delete tournament (archive)
// Import/export tournament data
```

#### CategoryManager.jsx
```jsx
// List categories in tournament
// Add category (name, age, gender, division)
// Edit category
// Delete category
// Assign judges to category
```

#### CompetitorManager.jsx
```jsx
// Show competitors in category
// Add competitor (name, ID, seed)
// Bulk import competitors
// Edit competitor
// Delete competitor
// Export competitor list
```

#### JudgeAssignment.jsx
```jsx
// List available judges
// Assign judges to categories
// View judge assignments
// Remove judge from category
// Send login links to judges
```

---

## Phase 3: Referee Dashboard (Week 3)

### What Referees Need
- [ ] View current tournament
- [ ] View categories and standings
- [ ] Create matches
- [ ] Control match state
- [ ] View judge submissions
- [ ] Reveal results
- [ ] Manage multiple rounds

### Components to Build

#### TournamentDashboard.jsx
```jsx
// Show:
// - Tournament name, date, location
// - List of categories
// - Current standings
// - Quick actions (new match, view results)
```

#### MatchCreator.jsx
```jsx
// Select category
// Select two competitors
// Create match
// Match appears on judge screens
```

#### MatchController.jsx
```jsx
// Show current match
// Display competitor names
// Show judge submission status
// Open/close scoring
// Reveal/hide results
```

#### StandingsDisplay.jsx
```jsx
// Show current category standings
// Rank, name, matches, average score
// Real-time updates as matches complete
// Export standings
```

---

## Phase 4: Judge Interface Enhancement (Week 4)

### Current Judge Page
- Simple 2-competitor scoring
- 1 score type (overall)

### New Judge Page Needs
- Multiple scoring criteria (Technique, Power, Clarity, Overall)
- Clear display of what each criterion means
- Easy +/- adjustment buttons
- Score entry validation
- Submission confirmation
- Prevent changes after reveal

### Components to Update

#### Judge.jsx (Enhanced)
```jsx
// Show:
// - Competitor 1 name (red/AKA)
// - Competitor 2 name (blue/AO)
// - Four scoring panels (one per criterion)
// - Submit button
// - Score summary before submit
```

#### ScoreEntryPanel.jsx
```jsx
// Individual score panel
// Shows criterion name and description
// +/- buttons or numeric input
// Visual feedback (color range)
// Locked if already submitted
```

#### ScoringGuidelines.jsx
```jsx
// Show scoring scale (1-10)
// Examples for each level
// Criterion description
// Tips for fair scoring
```

---

## Phase 5: Results & Standings (Week 5)

### What's Needed
- [ ] Calculate average scores
- [ ] Determine winners
- [ ] Update standings after each match
- [ ] Display results to audience
- [ ] Export results

### Components to Build

#### ResultsCalculator.js (Hook/Utility)
```js
// Input: All 4 judge scores
// Output: Average, winner, tiebreaker info
// Formula: (J1 + J2 + J3 + J4) / 4
```

#### LeaderboardDisplay.jsx
```jsx
// Show sorted standings
// Rank | Name | Matches | Avg Score
// Highlight current round
// Show progression
```

#### ResultsExport.jsx
```jsx
// Export to CSV
// Export to PDF
// Generate certificates
// Print scoresheets
```

---

## Phase 6: Portal / Public Display (Week 6)

### Current Portal
- Shows current match
- Shows submission status
- Shows final results

### Enhanced Portal Needs
- [ ] Match information display
- [ ] Judge submission status
- [ ] Live score reveal
- [ ] Category standings
- [ ] Tournament progression
- [ ] Refresh automatically

### Components to Update

#### Portal.jsx (Enhanced)
```jsx
// Show:
// - Current category
// - Current match competitors
// - Live judge submission count
// - Final scores and winner
// - Current standings/leaderboard
// - Auto-refresh every 2 seconds
```

#### PortalLeaderboard.jsx
```jsx
// Display standings in big text
// Rank, name, score
// Highlight leaders
// Update as matches complete
```

---

## Phase 7: Data Persistence & Backup (Week 7)

### What's Needed
- [ ] Save all tournament data
- [ ] Save all match results
- [ ] Save judge performance metrics
- [ ] Backup/restore functionality
- [ ] Export reports

### Functions to Create

#### DataManager.js
```js
// Save tournament to cloud
// Load tournament from cloud
// Export to CSV/JSON
// Import from CSV/JSON
// Backup all data
// Generate reports
```

---

## Phase 8: Error Handling & Edge Cases (Week 8)

### Scenarios to Handle
- [ ] Judge disconnects mid-scoring
- [ ] Network connection lost
- [ ] Browser refresh
- [ ] Duplicate submissions
- [ ] Invalid scores
- [ ] Missing competitors
- [ ] Judge not logged in
- [ ] Multiple matches open
- [ ] Admin deletes competitor

### Handlers Needed
```js
// Auto-save draft scores
// Recover from disconnects
// Validate all inputs
// Prevent race conditions
// Clear error states
// Graceful degradation
```

---

## Phase 9: Testing & Polish (Week 9)

### Testing
- [ ] Unit tests for calculations
- [ ] Integration tests for match flow
- [ ] UI/UX testing
- [ ] Performance testing
- [ ] Security testing

### Polish
- [ ] Responsive design
- [ ] Accessibility
- [ ] Loading states
- [ ] Error messages
- [ ] Confirmations
- [ ] Help text

---

## Phase 10: Deployment & Documentation (Week 10)

### Deployment
- [ ] Switch to real Firebase
- [ ] Setup Firestore security rules
- [ ] Test real backend
- [ ] Deploy to production
- [ ] Setup backup system

### Documentation
- [ ] User manual (✅ done)
- [ ] Admin guide
- [ ] Judge guide  
- [ ] Troubleshooting
- [ ] Video tutorials
- [ ] API documentation

---

## Implementation Order (Priority)

### Critical Path (Required for MVP)
1. ✅ Design complete system
2. ✅ Create mock Firebase
3. ✅ Login with role selection
4. Admin panel basics
5. Create tournament/categories/competitors
6. Create matches
7. Judge scoring with criteria
8. Results display
9. Portal/public display
10. Results calculations

### Important Features (Phase 2)
11. Standings/leaderboard
12. Data export
13. Judge management
14. Multiple rounds
15. Blind scoring enforcement

### Polish & Enhancement (Phase 3)
16. Error handling
17. Performance optimization
18. Mobile responsiveness
19. Accessibility
20. Testing suite

---

## Technology Stack

### Frontend
- React 18.3
- Vite 5.4
- CSS (vanilla)
- React Hooks

### Backend
- Firebase Auth
- Firestore
- Cloud Functions (optional)

### Development
- Node.js
- npm
- Git

---

## File Dependencies

```
firebase.js
├── firebase-mock-expanded.js (test)
└── firebase.js (production)

App.jsx
├── Login.jsx (updated)
├── Judge.jsx (to update)
├── Referee.jsx (to update)
├── AdminPanel.jsx (to create)
└── Portal.jsx (to update)

Referee.jsx
├── TournamentDashboard.jsx (to create)
├── MatchCreator.jsx (to create)
├── MatchController.jsx (to create)
└── StandingsDisplay.jsx (to create)

Judge.jsx
├── ScoreEntryPanel.jsx (to create)
├── ScoringGuidelines.jsx (to create)
└── useScores.js (to create)

Portal.jsx
├── PortalLeaderboard.jsx (to create)
└── useStandings.js (to create)

Hooks
├── useTournament.js (to create)
├── useMatch.js (exists, needs update)
├── useScores.js (to create)
└── useStandings.js (to create)
```

---

## Next Steps

1. **Immediate (Today)**
   - Update firebase.js to use firebase-mock-expanded.js
   - Test that login and basic pages still work
   - Verify mock data loads correctly

2. **This Week**
   - Start building AdminPanel.jsx
   - Create TournamentManager, CategoryManager
   - Get admin flow working

3. **Next Week**
   - Enhance Judge.jsx with multiple criteria
   - Create scoring panels
   - Update results calculation

4. **Week 3**
   - Build referee dashboard
   - Create match management
   - Test full workflow

5. **Week 4-10**
   - Complete remaining phases
   - Testing and polish
   - Deployment

---

## Success Metrics

- ✅ Complete tournament setup in < 5 minutes
- ✅ Score a full match in < 3 minutes
- ✅ All 4 judges can score independently
- ✅ Results calculated automatically
- ✅ Audience sees live updates
- ✅ System handles 100+ competitors
- ✅ No data loss on disconnect
- ✅ Run full tournament in < 2 hours

---

## Known Limitations (To Address)

- Mock data resets on page refresh
- No real database persistence
- Limited error recovery
- Single tournament at a time
- No judge bias detection
- No historical analytics
- No mobile app

---

## Future Enhancements

1. Real-time leaderboard updates
2. Judge performance analytics
3. Automated match bracket generation
4. Video integration
5. Mobile native app
6. Multi-language support
7. SMS notifications
8. QR code check-in
9. Competitor seeding algorithm
10. Tournament templates
