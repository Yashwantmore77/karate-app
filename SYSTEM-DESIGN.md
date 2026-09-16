# Karate Point System - Complete Design

## 1. System Overview

A comprehensive karate scoring application for tournaments with support for:
- Individual and team competitions
- Multiple scoring criteria
- Real-time scoring and results
- Judge management
- Tournament organization

---

## 2. Core Concepts

### 2.1 Match Structure
- **Tournament**: Container for multiple competitions
- **Category**: Age group, weight class, gender, belt level
- **Division**: Individual or Team competition
- **Match**: Competition between two competitors/teams
- **Round**: Single scoring period (typically 1-2 minutes in kata)

### 2.2 Scoring Elements

#### For Individual Kata (Most Common):
1. **Technique (Tech)**: 0-10 points
   - Accuracy of form
   - Proper execution of techniques
   - Flow and timing

2. **Power**: 0-10 points
   - Strength and impact
   - Control of movements

3. **Clarity (Clear)**: 0-10 points
   - Visibility of techniques
   - Proper stance transitions
   - Clean movements

4. **Overall Impression**: 0-10 points
   - Composure and focus
   - Confidence
   - Presentation

#### Judge Count: 4 judges (standard)

#### Scoring Range: 1.0 to 10.0 (in 0.1 increments)

### 2.3 Competitors
- Name
- Competitor ID (optional)
- Weight class
- Age category
- Belt level
- Gender

### 2.4 Results Calculation
- **Average Score**: Sum of all judge scores ÷ Judge count
- **Ranking**: Ordered by highest average score
- **Tiebreaker**: Highest individual judge scores

---

## 3. Application Structure

### 3.1 Pages/Sections

#### Referee Dashboard
- Create/manage tournaments
- Create/manage categories
- Create matches
- Control match flow
- View real-time results
- Manage judges and scoring criteria

#### Judge Interface
- View current match and competitors
- Enter scores for each criterion
- Submit scores
- View confirmation

#### Results Portal (Public Display)
- Current match information
- Competitor scores (blinded until reveal)
- Leaderboard/standings
- Tournament progression

#### Admin Panel
- Tournament management
- Competitor registration
- Category management
- Judge assignment
- Historical data/reports

### 3.2 Match Workflow

1. **Setup Phase**
   - Create tournament
   - Define categories and scoring criteria
   - Register competitors
   - Assign judges

2. **Pre-Match**
   - Select competitors for match
   - Load match data for judges

3. **During Match**
   - Referee opens match for scoring
   - Judges enter scores independently
   - Portal shows submission status (no scores visible)

4. **Reveal Phase**
   - All judges have submitted
   - Referee reveals final scores and winner
   - Portal displays results

5. **Post-Match**
   - Scores saved to history
   - Standings updated
   - Next match loaded

---

## 4. Scoring Criteria Configuration

### Default (Kata Scoring)
```json
{
  "criteria": [
    { "name": "Technique", "code": "tech", "weight": 1.0, "min": 1.0, "max": 10.0, "step": 0.1 },
    { "name": "Power", "code": "power", "weight": 1.0, "min": 1.0, "max": 10.0, "step": 0.1 },
    { "name": "Clarity", "code": "clear", "weight": 1.0, "min": 1.0, "max": 10.0, "step": 0.1 },
    { "name": "Overall", "code": "overall", "weight": 1.0, "min": 1.0, "max": 10.0, "step": 0.1 }
  ]
}
```

### Alternative (Kumite - Combat)
```json
{
  "criteria": [
    { "name": "Points", "code": "points", "weight": 1.0, "min": 0, "max": 99, "step": 1 },
    { "name": "Control", "code": "control", "weight": 0.5, "min": 1.0, "max": 10.0, "step": 0.1 },
    { "name": "Sportsmanship", "code": "sport", "weight": 0.5, "min": 1.0, "max": 10.0, "step": 0.1 }
  ]
}
```

---

## 5. Data Model

### Tournament
```
{
  id: string
  name: string
  date: timestamp
  location: string
  scoringTemplate: "kata" | "kumite" | "custom"
  categories: Category[]
  matches: Match[]
  status: "pending" | "active" | "completed"
  createdAt: timestamp
}
```

### Category
```
{
  id: string
  tournamentId: string
  name: string (e.g., "U12 Boys Kata")
  ageGroup: string
  gender: "M" | "F" | "Mixed"
  division: "Individual" | "Team"
  weightClass: string (optional)
  beltLevel: string (optional)
  competitors: Competitor[]
  matches: Match[]
}
```

### Competitor
```
{
  id: string
  categoryId: string
  name: string
  competitorId: string (optional)
  rank: number (initial seed)
  totalScore: number (sum of average scores)
  averageScore: number (overall performance)
  matches: number (count completed)
}
```

### Match
```
{
  id: string
  categoryId: string
  round: number
  competitor1: {
    id: string
    name: string
    role: "AKA" | "AO" (red/blue)
  }
  competitor2: {
    id: string
    name: string
  }
  status: "pending" | "open" | "scoring" | "revealed" | "completed"
  scores: {
    competitor1: {
      [judgeName]: {
        [criterionCode]: number
      }
    }
    competitor2: { ... }
  }
  results: {
    winner: string (competitor id)
    averageScores: {
      competitor1: number
      competitor2: number
    }
  }
  createdAt: timestamp
  startedAt: timestamp
  completedAt: timestamp
}
```

### Judge
```
{
  id: string
  email: string
  name: string
  tournamentIds: string[]
  categoryIds: string[]
  status: "active" | "inactive"
}
```

### Standings/Leaderboard
```
{
  categoryId: string
  timestamp: timestamp
  entries: [
    {
      rank: number
      competitorId: string
      competitorName: string
      matches: number
      totalScore: number
      averageScore: number
      trend: "up" | "down" | "same"
    }
  ]
}
```

---

## 6. Key Features

### 6.1 Judge Management
- Assign judges to categories
- Blind scoring (judges don't see other judges' scores)
- Judge performance tracking
- Judge timeout handling

### 6.2 Result Management
- Auto-calculation of averages
- Automatic winner determination
- Tie-breaking rules
- Historical score tracking

### 6.3 Public Display (Portal)
- Live match information (names, no scores)
- Judge submission status
- Final results after reveal
- Category standings
- Tournament progression

### 6.4 Flexibility
- Configurable scoring criteria
- Custom point ranges
- Weighted criteria support
- Multiple scoring templates

### 6.5 Data Integrity
- Server-side validation
- Judge score isolation
- Audit trail
- No score modification after reveal

---

## 7. Security & Rules

### 7.1 Judge Rules
- ✓ Can see assigned matches only
- ✓ Can enter scores only when match is "open"
- ✓ Can see their own scores before reveal
- ✗ Cannot see other judges' scores until reveal
- ✗ Cannot modify scores after submission
- ✗ Cannot see results until reveal

### 7.2 Referee Rules
- ✓ Full control of match flow
- ✓ Can see all scores immediately
- ✓ Can reveal results when all judges submit
- ✓ Can force reveal before all submit
- ✗ Cannot modify judge scores

### 7.3 Admin Rules
- ✓ Setup tournaments and categories
- ✓ Register competitors
- ✓ Assign judges
- ✓ View historical data
- ✓ Generate reports

---

## 8. Calculation Formulas

### Average Score (Basic)
```
Average = (Judge1 + Judge2 + Judge3 + Judge4) / 4
```

### Average Score (Weighted Criteria)
```
CriterionTotal = (Judge1 + Judge2 + Judge3 + Judge4) / 4
FinalScore = Σ(CriterionTotal × Weight) / Σ(Weights)
```

### Tiebreaker (If averages equal)
1. Highest individual judge score
2. Most judges voting for competitor
3. Coin flip (if still tied)

### Ranking
1. Sort by average score (descending)
2. Apply tiebreaker
3. Assign final ranks

---

## 9. Phase Workflow

### Match Phases

**1. PENDING**
- Match created
- Waiting to start
- Judges not yet loaded

**2. OPEN**
- Referee clicked "Start Match"
- Judges can see competitor info
- Judges can enter scores
- Portal shows "Match in Progress" (no scores)

**3. SCORING**
- At least one judge has submitted
- Other judges still entering
- Portal shows submission count (e.g., "3/4 judges scored")

**4. REVEALED**
- All judges submitted OR referee forced reveal
- All scores visible
- Winner determined
- Portal displays final results

**5. COMPLETED**
- Match archived
- Results saved
- Standings updated

---

## 10. Error Handling

### Scenarios
- Judge disconnects mid-scoring
- Referee closes match accidentally
- Score validation fails (outside range)
- Database connection lost
- Multiple users on same account

### Responses
- Auto-save draft scores
- Reconnect and resume
- Validation on submit
- Graceful error messages
- Prevent duplicate submissions

---

## 11. Reporting & Analytics

### Available Reports
- Tournament results
- Judge performance (score distribution, consistency)
- Competitor progression
- Category statistics
- Historical trends

### Data Exports
- CSV exports of all results
- PDF certificates
- Printable scoresheets

---

## 12. Future Enhancements

1. **Kumite (Combat) Scoring**
   - Real-time point tracking
   - Judge point adjustment
   - Penalty/warning system

2. **Team Scoring**
   - Team average calculations
   - Team rankings

3. **Mobile App**
   - Native iOS/Android apps
   - Offline support
   - Biometric judge selection

4. **AI/Analytics**
   - Judge bias detection
   - Score pattern analysis
   - Performance predictions

5. **Integration**
   - External ranking systems
   - Video integration
   - Livestream portal

---

## 13. Technology Stack

- **Frontend**: React + Vite
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Real-time**: Firestore listeners
- **Storage**: Firestore collections
- **Deployment**: Firebase Hosting

---

## 14. Database Collections Structure

```
tournaments/
├── {tournamentId}
│   ├── categories/
│   │   ├── {categoryId}
│   │   │   ├── competitors/
│   │   │   │   └── {competitorId}: Competitor data
│   │   │   └── matches/
│   │   │       └── {matchId}: Match data
│   ├── judges/
│   │   └── {judgeId}: Judge assignment
│   └── settings: Tournament config

leaderboards/
├── {tournamentId}
│   └── {categoryId}
│       ├── standings: Current rankings
│       └── history: Previous standings snapshots

judgePerformance/
└── {judgeId}: Analytics and consistency data
```

---

This design provides:
✓ Flexibility for different scoring systems
✓ Real-time judge blind scoring
✓ Accurate result calculation
✓ Scalable tournament management
✓ Clear role separation
✓ Audit trail for integrity
