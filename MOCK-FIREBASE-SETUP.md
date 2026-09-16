# Mock Firebase Setup for Testing

This document explains how the project now supports running with mock Firebase data for local testing without a real Firebase backend.

## What's Changed

All Firebase code has been preserved but wrapped to allow switching between:
1. **Mock Firebase** (default) - In-memory test data with no backend required
2. **Real Firebase** - Production Firebase backend

## Test Credentials

The mock Firebase system comes with these pre-configured test accounts:

```
Email                   Password    Role      Seat
referee@kata.local      test123     Referee   -
judge1@kata.local       test123     Judge     1
judge2@kata.local       test123     Judge     2
judge3@kata.local       test123     Judge     3
judge4@kata.local       test123     Judge     4
```

## How to Switch Between Mock and Real Firebase

Edit `src/firebase.js` and change the `USE_MOCK_FIREBASE` flag:

```javascript
// Use mock Firebase for testing
const USE_MOCK_FIREBASE = true

// Or set to false to use real Firebase
const USE_MOCK_FIREBASE = false
```

### When `USE_MOCK_FIREBASE = true` (Default)
- The app uses `src/firebase-mock.js` for all Firebase operations
- All data is stored in memory and lost when the page refreshes
- Perfect for testing UI and flows without setup

### When `USE_MOCK_FIREBASE = false`
- The app uses real Firebase as configured in `.env`
- Requires `.env` file with Firebase credentials (see SETUP-GUIDE.html)
- Persists data in Firestore

## Files

- **src/firebase.js** - Entry point that conditionally exports mock or real Firebase
- **src/firebase-mock.js** - Complete mock implementation of Firebase Auth and Firestore
- **src/App.jsx** - Updated to import from firebase.js instead of firebase/auth and firebase/firestore
- **src/pages/** - All pages updated to import from firebase.js

## What the Mock Implements

### Authentication
- `signInWithEmailAndPassword()` - Validates against test users
- `signOut()` - Clears current user
- `onAuthStateChanged()` - Notifies on auth state changes

### Firestore
- `collection()` - Creates a collection reference
- `doc()` - Creates a document reference  
- `query()` / `orderBy()` / `limit()` - Build queries
- `getDoc()` / `getDocs()` - Fetch data once
- `addDoc()` - Create new document with auto ID
- `setDoc()` - Set document data
- `updateDoc()` - Update document fields
- `deleteDoc()` - Delete a document
- `onSnapshot()` - Subscribe to real-time updates
- `serverTimestamp()` - Returns current Date

### Scoring Configuration
- `SCORE_MIN`, `SCORE_MAX`, `SCORE_STEP`, `JUDGE_COUNT` - Constants
- `clampScore()` - Utility function

## Data Persistence

Mock data is stored in memory in `src/firebase-mock.js`:
- Persists while the app is running
- Resets on page refresh
- Good for testing workflows end-to-end

To preserve data between sessions, you could modify the mock to use `localStorage`, but this is not implemented by default.

## Running the App

```bash
npm install
npm run dev
```

Then:
1. Open `http://localhost:5173`
2. Sign in as one of the test users above
3. The app works exactly like production, but with test data

## Transitioning Back to Real Firebase

1. Verify `.env` file has all Firebase credentials (see SETUP-GUIDE.html, Part 6)
2. Set `USE_MOCK_FIREBASE = false` in `src/firebase.js`
3. Publish Firestore rules from Part 8 of SETUP-GUIDE.html
4. Run `npm run dev` again

## Notes

- The mock uses JavaScript objects for storage, not actual Firestore
- Queries with `orderBy` and `limit` work but are simplified
- No complex Firestore query operators (only basic orderBy/limit)
- All the real Firebase error handling code is preserved in comments
