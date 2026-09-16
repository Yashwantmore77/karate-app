# Karate Scoring System - User Guide

## Table of Contents
1. [Quick Start](#quick-start)
2. [For Referees](#for-referees)
3. [For Judges](#for-judges)
4. [For Admins](#for-admins)
5. [For Audience](#for-audience)
6. [Common Tasks](#common-tasks)
7. [Scoring Rules](#scoring-rules)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Accessing the System

1. **Open your browser** and go to the application URL
2. **You'll see the login page** with quick-select buttons:
   - Referee
   - Judge 1, 2, 3, 4
3. **Click your role** to auto-fill credentials (test mode: password is `test123`)
4. **Click "Sign in"**

### Your First Time

**If you're the Referee:**
- You'll see the Referee Dashboard
- Start by creating a tournament

**If you're a Judge:**
- You'll see the Judge Interface
- Wait for the referee to open a match
- Enter your scores when ready

**If you're in the Audience:**
- Go to `/?portal` to see the public scoreboard
- See live match information
- View final results

---

## For Referees

### Role Overview
As the referee, you:
- Create tournaments and categories
- Manage competitors
- Assign judges
- Control match flow
- View all scores in real-time
- Reveal results to the public

### Creating a Tournament

1. Click **"Create Tournament"** on the dashboard
2. Enter:
   - **Tournament Name** (e.g., "Spring Karate Championship 2026")
   - **Location** (optional)
   - **Date** (optional)
3. Click **"Create"**

### Managing Categories

A category is a competition group (e.g., "U12 Boys Kata", "U16 Girls Kumite")

**To add a category:**
1. Open your tournament
2. Click **"Add Category"**
3. Fill in:
   - **Category Name** (e.g., "U12 Boys Kata")
   - **Age Group** (U8, U12, U16, Adult)
   - **Gender** (M/F/Mixed)
   - **Type** (Individual/Team)
4. Click **"Save"**

### Registering Competitors

1. Select a **Category**
2. Click **"Add Competitor"**
3. Enter:
   - **Competitor Name**
   - **Competitor ID** (optional - bib number, ID card, etc.)
   - **Seed/Initial Rank** (1 = top seed)
4. Click **"Add"**
5. Repeat for all competitors

### Assigning Judges

1. Click **"Manage Judges"** on tournament dashboard
2. For each judge:
   - Select their **Name/Email**
   - Assign to **Categories** they'll judge
3. Click **"Save Assignments"**

### Creating a Match

1. Select the **Category** you're running
2. Click **"Create Match"**
3. System shows:
   - **Competitor 1 (Red/AKA)**
   - **Competitor 2 (Blue/AO)**
4. Click **"Create"** to confirm
5. The match is now ready to score

### Running a Match - Step by Step

#### Step 1: Display Match Info
- Portal automatically shows:
  - Competitor names
  - Current round
  - Category name
- **Note**: Scores are NOT shown yet

#### Step 2: Notify Judges
- Tell judges: "Match is starting - Competitor 1 vs Competitor 2"
- Judges load the match on their devices

#### Step 3: Open Match for Scoring
- Click **"Open Round"** on your referee screen
- Judges' **Score Input Buttons** now become active
- Portal shows: "Match open - waiting for scores"

#### Step 4: Monitor Submissions
- You see in real-time:
  - Which judges have submitted (✓)
  - Which are still scoring (⏳)
  - Exact scores as each judge submits
  
Example: "2/4 judges scored"

#### Step 5: Reveal Results
- **When all 4 judges have submitted:**
  - Click **"Reveal Result"** button
  - System calculates winner
  - Portal displays final scores

- **If you need to force reveal:**
  - Click **"Reveal anyway (3/4)"**
  - Scores calculated with judges who submitted

#### Step 6: Review Results
- You see:
  - **Individual judge scores** (all criteria)
  - **Average score** for each competitor
  - **Winner** (highest average)
  - **Scoring breakdown**

#### Step 7: Next Match
- Click **"Create Next Match"**
- Select next pair of competitors
- Repeat from Step 1

### Scoring Criteria Explained

By default, four judges score each competitor on four criteria:

1. **Technique (Tech)** - 1.0 to 10.0
   - Accuracy of form
   - Proper execution of each move
   - Correct transitions
   - Judge thinking: "How well did they execute the techniques?"

2. **Power** - 1.0 to 10.0
   - Strength and impact in moves
   - Controlled power
   - Proper weight distribution
   - Judge thinking: "How powerful was their performance?"

3. **Clarity (Clear)** - 1.0 to 10.0
   - Can you clearly see each technique?
   - Distinct movements (not blurred)
   - Clean stance changes
   - Judge thinking: "How clear and visible was each movement?"

4. **Overall Impression** - 1.0 to 10.0
   - Total composure and focus
   - Confidence and presence
   - Presentation
   - Judge thinking: "Overall, how good was this performance?"

### How Scores Are Calculated

**Average Score = (Judge 1 + Judge 2 + Judge 3 + Judge 4) ÷ 4**

Example:
- Judge 1 scores: 8.0
- Judge 2 scores: 8.5
- Judge 3 scores: 7.9
- Judge 4 scores: 8.1
- **Average = 8.1**

### Winner Determination

The competitor with the **higher average score wins**.

If tied:
1. Look at highest individual judge score
2. If still tied, system picks (or you decide manually)

---

## For Judges

### Role Overview
As a judge, you:
- Score competitors independently
- Don't see other judges' scores until reveal
- Submit scores for all criteria
- Cannot change scores after submission

### Logging In

1. **Click your judge number** (Judge 1, 2, 3, or 4) on login page
2. Credentials auto-fill: `judgeX@kata.local` / `test123`
3. Click **"Sign in"**

### Your Screen

After signing in, you see:

```
┌─────────────────────────────┐
│ Seat [Your Judge Number]    │
└─────────────────────────────┘

         [Waiting for first match...]
```

### When a Match Starts

The referee opens a match. Your screen updates:

```
┌─────────────────────────────┐
│ Seat 1                      │
└─────────────────────────────┘

    Competitor 1 vs Competitor 2
    
    [Round is open - you can score now]
```

### Entering Your Scores

You'll see **4 scoring panels**, one for each criterion:

#### Panel 1: Technique Score
```
┌─────────────────────┐
│ COMPETITOR 1        │
│ Technique Score     │
│ [−] 8.0 [+]         │ ← Use +/− buttons or type
└─────────────────────┘
```

**What to evaluate:**
- Did they perform the forms correctly?
- Were the techniques accurate?
- Good control and transitions?
- Range: 1.0 (poor) to 10.0 (excellent)

#### Panel 2: Power Score
```
┌─────────────────────┐
│ COMPETITOR 1        │
│ Power Score         │
│ [−] 8.5 [+]         │
└─────────────────────┘
```

**What to evaluate:**
- How strong were their movements?
- Controlled power (not wild)?
- Good weight transfer?
- Range: 1.0 (weak) to 10.0 (powerful)

#### Panel 3: Clarity Score
```
┌─────────────────────┐
│ COMPETITOR 1        │
│ Clarity Score       │
│ [−] 7.9 [+]         │
└─────────────────────┘
```

**What to evaluate:**
- Can you see each technique clearly?
- Clean, sharp movements?
- Distinct stance transitions?
- Range: 1.0 (blurry/unclear) to 10.0 (crystal clear)

#### Panel 4: Overall Score
```
┌─────────────────────┐
│ COMPETITOR 1        │
│ Overall Impression  │
│ [−] 8.1 [+]         │
└─────────────────────┘
```

**What to evaluate:**
- Composure and focus?
- Confidence and presence?
- Overall presentation?
- Range: 1.0 (lacks confidence) to 10.0 (excellent presence)

### Scoring Both Competitors

**You score BOTH competitors:**

1. Set all 4 scores for **Competitor 1 (Red)**
2. Set all 4 scores for **Competitor 2 (Blue)**

### Adjusting Your Scores

**Before submitting:**
- Click the [+] or [−] buttons to adjust
- Or click the number to type directly
- Increment: 0.1 (e.g., 8.0 → 8.1 → 8.2)
- Range: 1.0 to 10.0 (no zeros, no 10.1)

### Submitting Your Scores

Once you've entered all 8 scores (4 per competitor):

1. Review all scores are visible
2. Click **"Submit Scores"** button
3. You see: **"✓ Scores submitted"**
4. Your button changes to **"Change my scores"** (if round still open)
5. Portal now shows: **"3/4 judges scored"** (example)

### IMPORTANT: Judge Rules

✅ **You CAN:**
- See your own scores before reveal
- Change your scores (if round is still open)
- Ask referee for clarification on criteria

❌ **You CANNOT:**
- See other judges' scores (until reveal)
- Change scores after REVEAL
- Communicate your scores to other judges
- Discuss match with other judges during scoring

### What Happens After You Submit

- Other judges continue scoring
- Referee waits for all 4 judges
- Once everyone submits: **Reveal happens**
- Portal shows final scores and winner
- You see all 4 judges' scores displayed

---

## For Admins

### Creating Judge Accounts

1. Go to **Admin Panel**
2. Click **"Manage Judges"**
3. **Add New Judge:**
   - Email: `judge@example.com`
   - Name: `John Smith`
   - Status: Active
4. Click **"Create"**
5. Judge gets login link via email (or you provide credentials)

### Tournament Management

- **Create** tournaments with name, date, location
- **Organize** competitors into categories
- **Assign** judges to categories
- **Monitor** ongoing matches
- **Archive** completed tournaments
- **Export** results (CSV, PDF)

### Judge Performance Analytics

After tournament:
- View judge consistency scores
- See average score spread
- Identify outlier scores
- Use for judge training/feedback

### Data Management

- **Backup** tournament data
- **Export** results
- **Archive** old tournaments
- **Purge** test data

---

## For Audience

### Viewing Live Results

1. **Open your browser** to: `[app-url]/?portal`
   - Or ask referee for the portal link
   - No login required!

2. **You see:**
   ```
   ┌─────────────────────────────┐
   │ RED COMPETITOR  vs  BLUE    │
   │    [name]           [name]  │
   │      —                 —    │
   │  (no scores shown yet)      │
   │                             │
   │  Status: Match Open         │
   │  2/4 judges scored          │
   └─────────────────────────────┘
   ```

3. **Match phases:**
   - **"Round not open"** → Match is loading
   - **"2/4 judges scored"** → Match in progress
   - **"[winner name] wins"** → Results revealed
   - Shows: Final scores and winner name

### Leaderboard View

Portal also shows:
- **Current category standings**
- **Competitor rankings**
- **Points progression**
- Updates in real-time

### Tips for Audience

- Screen automatically refreshes
- No need to reload
- Works on phones/tablets
- Good for projecting on big screen
- Turn on "Do Not Disturb" on phones using portal

---

## Common Tasks

### "I Need to Change a Competitor's Name"

**Before their match:**
1. Go to Category settings
2. Click on competitor
3. Edit name
4. Save

**After their match:**
- Can't change (score already linked)
- Document change in notes

### "A Judge Didn't Show Up"

**Option 1: Use 3 judges**
- Referee can click "Reveal anyway (3/4)"
- Average calculated from 3 scores

**Option 2: Add replacement**
1. Assign new judge to category
2. Give them login
3. They can score remaining matches

### "I Made a Mistake in My Score"

**If round is still open:**
- Click **"Change my scores"**
- Adjust any criterion
- Click **"Submit"** again

**If round is already revealed:**
- ❌ Cannot change
- Referee can note issue in records
- Affects no future matches

### "I Need to Redo a Match"

**Option 1: Clear and Rerun**
1. Click **"Clear Match Results"**
2. Same competitors re-score
3. All judges re-enter scores

**Option 2: Archive and Create New**
1. Mark match as archived
2. Create new match with same competitors
3. Full re-score required

### "Competitor Isn't Loading on My Judge Screen"

**Troubleshooting:**
1. Referee: Click "Refresh Match"
2. Judge: Wait 5 seconds, then reload page
3. Judge: Re-login if issues continue
4. Referee: Verify match is marked "Open"

### "Portal Isn't Showing Live Updates"

**Try:**
1. Refresh the page (F5)
2. Clear browser cache
3. Close and reopen
4. Check internet connection
5. Try different browser

### "How Many Competitors Per Match?"

- **Individual Kata**: 2 competitors per match
- **Team Competition**: Up to 5 per team

---

## Scoring Rules

### Valid Score Range

- **Minimum**: 1.0
- **Maximum**: 10.0
- **Increment**: 0.1
- **Valid scores**: 1.0, 1.1, 1.2, ... 9.9, 10.0

### Invalid Scores (System Won't Accept)

- ❌ 0.0 (too low)
- ❌ 10.1 (too high)
- ❌ 8 (must be 8.0)
- ❌ "good" (must be number)
- ❌ 8.05 (only 1 decimal place)

### Judging Guidelines

#### Technique (1-10 Scale)
- **1-3**: Barely recognizable forms
- **4-5**: Forms present but with major errors
- **6-7**: Generally correct with minor errors
- **8-9**: Highly accurate execution
- **10**: Perfect technique, flawless execution

#### Power (1-10 Scale)
- **1-3**: Weak, lacks impact
- **4-5**: Some power, inconsistent
- **6-7**: Good consistent power
- **8-9**: Strong, controlled power
- **10**: Excellent powerful execution

#### Clarity (1-10 Scale)
- **1-3**: Movements blurry or unclear
- **4-5**: Somewhat clear but hard to follow
- **6-7**: Clear transitions
- **8-9**: Very clear and distinct
- **10**: Crystal clear, sharply visible

#### Overall (1-10 Scale)
- **1-3**: Lacks confidence, uncomfortable
- **4-5**: Somewhat confident
- **6-7**: Good composure
- **8-9**: Excellent presence and composure
- **10**: Outstanding confidence and presence

### Scoring Philosophy

**Remember:**
- Score **what you see**, not what you think
- Be **consistent** across competitors
- Use **full range** (don't cluster all scores around 7-8)
- **Ignore politics** - judge fairly
- **Justify high scores** - excellence should be clear

---

## Troubleshooting

### Login Issues

| Problem | Solution |
|---------|----------|
| "Wrong email or password" | Check capitalization. Use exact email provided. Test mode password is `test123`. |
| Can't sign in at all | Clear browser cookies. Try incognito/private mode. |
| "No role assigned" | Referee: verify this judge's account is assigned to category. |

### Scoring Issues

| Problem | Solution |
|---------|----------|
| Score won't save | Check valid range (1.0-10.0). Try refreshing page. |
| Can't see other judges' scores | This is correct! Blind scoring until reveal. |
| Portal shows wrong scores | Refresh portal page. Scores update in real-time. |
| "Reveal" button disabled | All 4 judges must submit first. OR use "Reveal anyway". |

### Match Issues

| Problem | Solution |
|---------|----------|
| Match not loading | Referee: click "Refresh". Judge: reload page. |
| Competitors not showing | Referee: verify match setup. Check category has competitors. |
| Stuck on "waiting for match" | Ask referee to create next match. Then reload. |

### Connection Issues

| Problem | Solution |
|---------|----------|
| Scores disappeared | Auto-saved to cloud. Refresh page. |
| Slow scoring | Check internet speed. Try wired connection. Close other apps. |
| Portal freezes | Clear cache. Try different browser. Check connection. |

### If You're Still Stuck

**Contact the tournament organizer:**
- Referee contact info should be provided
- Or visit the help desk at tournament location

---

## Key Principles of This System

1. **Blind Scoring** → Judges don't influence each other
2. **Real-time Monitoring** → Referee sees everything
3. **Transparent Results** → Scores calculated automatically
4. **Fast Workflow** → Complete matches in 2-3 minutes
5. **No Cheating** → Rules prevent score manipulation
6. **Mobile-Friendly** → Works on phones and tablets

---

## Tournament Night Checklist

**Before tournament starts:**
- ✓ Test all judge devices
- ✓ Login as each judge (make sure credentials work)
- ✓ Check internet connection
- ✓ Test portal display on big screen
- ✓ Verify all competitors are registered
- ✓ Brief judges on scoring criteria
- ✓ Assign judges to categories

**During tournament:**
- ✓ Create first match
- ✓ Notify judges
- ✓ Open scoring
- ✓ Monitor submissions
- ✓ Reveal results
- ✓ Show portal between rounds

**After tournament:**
- ✓ Generate final standings
- ✓ Export results
- ✓ Print certificates
- ✓ Archive tournament

---

## Summary

This system ensures:
- **Fair scoring** through blind judging
- **Fast competition** with real-time results
- **Accurate math** with automatic calculations
- **Clear communication** with live portal
- **Easy operation** with simple workflow

**Questions?** Refer to this guide or ask your tournament referee!
