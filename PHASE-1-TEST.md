# Phase 1 - Testing Guide

## ✅ Server Status
**Dev server is running on: `http://localhost:5176/`**
(Ports 5173-5175 were in use, so it picked 5176)

No compilation errors! All components are working.

## 🧪 How to Test the New Judge Interface

### Step 1: Open the App
```
http://localhost:5176/
```

### Step 2: Login as Judge 1
- Click "Judge 1" button
- Email and password auto-fill
- Click "Sign in"

### Step 3: See "Waiting for first match"
You'll see this because we haven't built the Referee interface yet to create matches.

### Step 4: Manually Create a Test Match
**Open your browser console (F12)** and run this:

```javascript
// Simulate a match for testing
window.testMatch = {
  id: 'match-test-001',
  status: 'open',
  akaName: 'Kenji Yamamoto',
  aoName: 'Takeshi Nakamura'
};

// Force the judge interface to show the match
localStorage.setItem('currentMatch', JSON.stringify(window.testMatch));
location.reload();
```

### Step 5: See the Complete Judge Interface!
After reload, you'll now see:

**The full scoring interface with:**
- ✅ Match names (Kenji vs Takeshi)
- ✅ Scoring Guidelines (collapsible with tabs)
- ✅ Red competitor section (left side)
  - Technique panel
  - Power panel
  - Clarity panel
  - Overall panel
  - Average score (updates in real-time)
- ✅ Blue competitor section (right side)
  - Same 4 panels
  - Same average calculation
- ✅ Submit/Change buttons at bottom

## 🎨 Try These Actions

### Adjust Scores
1. Click the **[+]** button on any criterion → Score increases by 0.1
2. Click the **[−]** button → Score decreases by 0.1
3. Click score number directly and type → Direct input (1.0-10.0)

### Watch Real-time Updates
1. Change any score
2. Watch the **Average** number update below each competitor
3. Formula: (Score1 + Score2 + Score3 + Score4) / 4

### See Color Feedback
- Scores **9.0+** = Green (excellent)
- Scores **7.0-8.9** = Blue (good)
- Scores **5.0-6.9** = Yellow (average)
- Scores **1.0-4.9** = Red (poor)

### Read Scoring Guidelines
1. Click **"▶ Scoring Guidelines"** to expand
2. Click tabs: **Technique**, **Power**, **Clarity**, **Overall**
3. See scale examples (1-10 for each)
4. See tips for judging
5. Click again to collapse

### Submit Scores
1. Adjust all 8 scores (4 per competitor)
2. Click **"Submit All Scores"**
3. See **"✓ Scores submitted"** message
4. Notice button changes to **"Change My Scores"**

### Change After Submitting
1. Click **"Change My Scores"**
2. Adjust any score
3. Notice button is now enabled again
4. Click **"Submit All Scores"** to resubmit

### Lock When Closed
1. Open console and run:
   ```javascript
   window.testMatch.status = 'closed';
   location.reload();
   ```
2. Now all score panels are **disabled/grayed out**
3. Can't submit anymore
4. Shows "Round closed" message

## 📊 Technical Test

### Component Files Created
- ✅ `src/components/ScoreEntryPanel.jsx` - Score entry widget
- ✅ `src/components/ScoreEntryPanel.css` - Styling
- ✅ `src/components/ScoringGuidelines.jsx` - Help panel
- ✅ `src/components/ScoringGuidelines.css` - Help styling

### Files Updated
- ✅ `src/pages/Judge.jsx` - Now uses new components

### Verify in Console
```javascript
// Check components loaded
console.log('Components should be loaded');

// Check score calculation
const avg = (8.0 + 8.5 + 7.9 + 8.1) / 4;
console.log('Expected average: 8.1, Actual: ' + Math.round(avg * 10) / 10);
```

## 🎯 Features to Verify

Check these work correctly:

✅ **Score Entry**
- [ ] Can increase/decrease with +/- buttons
- [ ] Can type directly into input field
- [ ] Scores are clamped to 1.0-10.0
- [ ] Increments are 0.1

✅ **Average Calculation**
- [ ] Updates in real-time as scores change
- [ ] Correctly calculates 4 scores ÷ 4
- [ ] Rounded to 1 decimal place

✅ **Color Coding**
- [ ] 1-4 = Red
- [ ] 5-6 = Yellow
- [ ] 7-8 = Blue
- [ ] 9-10 = Green

✅ **Guidelines**
- [ ] Panel expands/collapses
- [ ] Tabs switch between criteria
- [ ] Each criterion has description + scale + tips

✅ **Status Management**
- [ ] Shows "Waiting for referee to open round" when closed
- [ ] Shows "✓ Scores submitted" when saved
- [ ] Button changes from Submit to Change

✅ **UI Responsive**
- [ ] Side-by-side layout on desktop
- [ ] Stacks vertically on mobile
- [ ] All buttons and inputs work on phone

## 🚀 Advanced Testing

### Test on Multiple Judge Screens
1. Open `http://localhost:5176/` in 4 different browser windows/tabs
2. Login as Judge 1, 2, 3, 4 in each
3. All 4 should see the same match (when referee builds interface)
4. Each should score independently
5. None should see each other's scores until reveal

### Test Score Ranges
Try these score combinations:
```javascript
// Excellent scores
// Technique: 9.5, Power: 9.8, Clarity: 9.2, Overall: 9.5
// Average should be: 9.5

// Mixed scores
// Technique: 6.0, Power: 8.0, Clarity: 7.0, Overall: 7.5
// Average should be: 7.1

// Poor scores
// Technique: 3.2, Power: 2.8, Clarity: 3.5, Overall: 3.0
// Average should be: 3.1
```

### Test Mobile View
1. Open DevTools (F12)
2. Click "Toggle device toolbar" or press Ctrl+Shift+M
3. Select iPhone SE or similar
4. Verify:
   - Layout stacks vertically
   - Buttons still work
   - Text is readable
   - No horizontal scrolling

## 📱 Mobile Testing Checklist

- [ ] Layout is single column
- [ ] Score panels are full width
- [ ] Buttons are large enough to tap
- [ ] No horizontal scroll needed
- [ ] Guidelines panel works on mobile
- [ ] Score input is easy to use

## 🐛 If Something's Wrong

### Scores won't change
- Check console for errors: F12 → Console
- Try refreshing: F5
- Check that match.status = 'open'

### Guidelines don't show
- Click "▶ Scoring Guidelines" to expand
- Try refreshing page
- Check browser console for errors

### Average not calculating
- Verify all 4 scores are set
- Check browser console for math errors
- Try manual calculation

### App crashes
- Open console (F12)
- Note the error message
- Check for typos in component files
- Restart dev server: `npm run dev`

## ✅ Success Criteria

Phase 1 is successful if:
1. ✅ Judge interface loads without errors
2. ✅ Can enter scores for 4 criteria per competitor
3. ✅ Averages calculate and update in real-time
4. ✅ Guidelines panel shows/hides with content
5. ✅ Submit button works
6. ✅ Mobile layout is responsive
7. ✅ No console errors

**If all of these work: Phase 1 is COMPLETE!**

## 🎉 Next Steps

Once you've tested Phase 1:

1. **Test with all 4 judges** simultaneously
2. **Review the code** in `src/components/` and `src/pages/Judge.jsx`
3. **Plan Phase 2** - Referee Dashboard
4. **Start Phase 2** - Build match creation and control interface

---

**Ready to test? Go to: `http://localhost:5176/`**
