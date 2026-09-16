# URL-Based Routing Architecture

## Overview

The application now uses React Router with ID-based URLs to ensure:
- **Separate, focused UIs** - Each page shows only what's relevant to that context
- **Trackable navigation** - URLs contain IDs for bookmarking and history
- **Data persistence on refresh** - Page refreshes load data from URL parameters
- **Backward/forward navigation** - Browser back/forward buttons work correctly

## URL Structure

### Admin Routes
```
/admin                                    - Tournament List
  /admin/tournament/:tournamentId         - Tournament Detail (Categories)
    /admin/tournament/:tournamentId/category/:categoryId  - Category Detail (Competitors)
```

**Admin Flow:**
1. User sees all tournaments → clicks tournament
2. Router navigates to `/admin/tournament/tournament-001`
3. Page loads tournament data using ID from URL
4. User sees categories for that tournament → clicks category
5. Router navigates to `/admin/tournament/tournament-001/category/cat-001`
6. Page loads category and competitors using both IDs
7. Page refresh still works (data loaded from URL IDs)

---

### Referee Routes
```
/referee                               - Tournament/Category List
  /referee/category/:categoryId         - Match List
    /referee/match/:matchId             - Match Control
```

**Referee Flow:**
1. User selects tournament from dropdown
2. Categories load for that tournament
3. User clicks category → navigates to `/referee/category/cat-001`
4. Page shows matches in that category
5. User clicks match → navigates to `/referee/match/match-001`
6. Page loads match details and competitor info
7. Referee controls match state (open/reveal/reopen)
8. Page refresh loads match data from URL

---

### Judge Routes
```
/judge                         - Available Matches
  /judge/match/:matchId        - Score Entry
```

**Judge Flow:**
1. User sees all open matches (status = 'open')
2. User clicks match → navigates to `/judge/match/match-001`
3. Page loads match competitors and scoring interface
4. Judge enters scores for both competitors
5. Judge submits scores
6. Page refresh loads previous scores from localStorage

---

## Data Flow Pattern

### Page Load with ID
```
URL: /admin/tournament/tournament-001/category/cat-001

1. Extract IDs from URL params
   - tournamentId = "tournament-001"
   - categoryId = "cat-001"

2. Load data using IDs
   - Tournament: Get from tournaments array in localStorage
   - Category: Get from categories-tournament-001 in localStorage
   - Competitors: Get from competitors-cat-001 in localStorage

3. Display only relevant UI for this context
```

### Navigation with useNavigate
```
// In any page component
import { useNavigate } from 'react-router-dom'

const navigate = useNavigate()

// Navigate with ID
onClick={() => navigate(`/admin/tournament/${tournament.id}`)}
```

### URL-Based Data Loading
```
// In page component, use URL params
import { useParams } from 'react-router-dom'

const { tournamentId, categoryId } = useParams()

useEffect(() => {
  // Load data based on URL IDs
  const tournament = getTournament(tournamentId)
  const category = getCategory(tournamentId, categoryId)
}, [tournamentId, categoryId])
```

---

## File Structure

### Routers (URL Mapping)
```
src/routes/
├── AdminRouter.jsx          - Maps /admin/* paths
├── RefereeRouter.jsx        - Maps /referee/* paths
└── JudgeRouter.jsx          - Maps /judge/* paths
```

### Admin Pages (Separate UIs)
```
src/pages/admin/
├── AdminTournamentList.jsx       - List all tournaments
├── AdminTournamentDetail.jsx     - View tournament + create categories
└── AdminCategoryDetail.jsx       - View category + add competitors
```

### Referee Pages (Separate UIs)
```
src/pages/referee/
├── RefereeCategoryList.jsx       - Select tournament & category
├── RefereeMatchList.jsx          - View matches + create new
└── RefereeMatchControl.jsx       - Control single match
```

### Judge Pages (Separate UIs)
```
src/pages/judge/
├── JudgeMatchList.jsx            - List available matches
└── JudgeScoring.jsx              - Score single match
```

### Styles (One per Component)
```
src/styles/
├── AdminTournamentList.css
├── AdminTournamentDetail.css
├── AdminCategoryDetail.css
├── RefereeCategoryList.css
├── RefereeMatchList.css
├── RefereeMatchControl.css
├── JudgeMatchList.css
└── JudgeScoring.css
```

---

## Key Advantages

### 1. Separate Focused UIs
- Admin sees only tournament management, not judge scoring
- Referee sees only match control, not admin setup
- Judge sees only scoring, not tournament setup
- **No cognitive overload** - each UI has single purpose

### 2. Trackable URLs
- Bookmark a specific tournament: `/admin/tournament/tournament-001`
- Share match ID with judge: `/judge/match/match-001`
- Deep-link to category: `/admin/tournament/tournament-001/category/cat-001`
- **Browser history works correctly**

### 3. Data Persistence on Refresh
- URL contains all info to reconstruct page state
- Page refresh loads data from URL IDs
- **No data loss** when user refreshes accidentally

### 4. Backward/Forward Navigation
- Browser back button works correctly
- Browser forward button works correctly
- Each URL in history has complete context
- **Natural browser behavior**

### 5. Scalability
- Easy to add new pages (just add Route + page component)
- Each page is independent module
- Easy to test (each route is separate)
- Easy to refactor (changes isolated to one page)

---

## URL ID Examples

### Tournament
```
tournamentId = "tournament-" + Date.now()
Example: "tournament-1726515234567"
Stored in: localStorage['tournaments']
```

### Category
```
categoryId = "cat-" + Date.now()
Stored in: localStorage['categories-tournament-001']
```

### Match
```
matchId = "match-" + Date.now()
Stored in: localStorage['matches-category-001']
```

### Competitor
```
competitorId = "comp-" + Date.now()
Stored in: localStorage['competitors-category-001']
```

All IDs are **unique and stable** - remain same across page refreshes.

---

## Loading Data from URL ID

### Pattern Used
```javascript
const { tournamentId } = useParams()

useEffect(() => {
  // 1. Get from localStorage using ID
  const stored = localStorage.getItem('tournaments')
  const tournaments = JSON.parse(stored || '[]')
  
  // 2. Find by ID
  const tournament = tournaments.find(t => t.id === tournamentId)
  
  // 3. Load into state
  setTournament(tournament)
}, [tournamentId])
```

### Why This Works
- **Consistent Data Store**: All data in localStorage with predictable keys
- **ID-Based Lookup**: All arrays store objects with unique IDs
- **URL as Source of Truth**: URL ID is always primary identifier
- **No Props Drilling**: Each page is self-contained and loads its own data

---

## Browser Back/Forward Behavior

### Example Scenario
1. Start: `/admin` (home)
2. Click tournament-001 → `/admin/tournament/tournament-001`
3. Click category-001 → `/admin/tournament/tournament-001/category/cat-001`
4. User clicks browser back → `/admin/tournament/tournament-001` (category list reloads)
5. User clicks browser back → `/admin` (tournament list reloads)
6. User clicks browser forward → `/admin/tournament/tournament-001` (match list loads)
7. User clicks browser forward → `/admin/tournament/tournament-001/category/cat-001` (competitors load)

**All state is re-derived from URL** - no manual state restoration needed.

---

## Testing & Verification

### Manual Test Flow
1. **Admin Path:**
   - Navigate to `/admin` → see tournament list
   - Click tournament → URL is `/admin/tournament/:id`, see categories
   - Click category → URL is `/admin/tournament/:id/category/:id`, see competitors
   - Refresh page → data still loads correctly
   - Browser back → returns to tournament detail
   - Browser forward → returns to category detail

2. **Referee Path:**
   - Navigate to `/referee` → select tournament
   - Click category → URL is `/referee/category/:id`, see matches
   - Click match → URL is `/referee/match/:id`, see match control
   - Refresh page → match data loads correctly

3. **Judge Path:**
   - Navigate to `/judge` → see available matches
   - Click match → URL is `/judge/match/:id`, see scoring interface
   - Refresh page → previous scores load correctly

---

## Migration from Old System

### Old System (Problems)
- All UI mixed on one page
- State passed via props (prop drilling)
- No URL tracking
- Refresh loses context
- Browser back/forward broken

### New System (Benefits)
- Each UI on separate route
- Data loaded from URL IDs
- All navigation tracked in URL
- Refresh reloads from URL ID
- Browser back/forward works

### Data Storage (Unchanged)
- Still using localStorage
- Same data structure
- Same persistence behavior
- Direct JSON stringify/parse

---

## Future Enhancements

### Phase 4: Real Firebase
- Replace localStorage with Firestore
- Real-time updates with onSnapshot
- URL IDs same format
- Data loading pattern unchanged

### Phase 5: Query Parameters
- Add `/referee/match/:matchId?judgeView=true`
- Add `/admin/tournament/:id?edit=true`
- URL encodes all page state

### Phase 6: URL State
- `/admin?view=tournaments&sort=date&filter=active`
- URL becomes complete application state
- No localStorage needed for UI state

---

## Summary

**Every URL is a complete application state.**

When user navigates to:
- `/admin/tournament/tournament-001`
- System loads tournament-001 data
- Shows only tournament context UI
- Browser back/forward preserved
- Refresh reloads same state
- All from URL alone

**This is the gold standard of web navigation.**
