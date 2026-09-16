# Kata scoring — React + Firebase

Four judges score both competitors from their phones. The referee opens the round
and reveals. A scoreboard updates live. No backend server.

## 1. Firebase console

1. Create a project at console.firebase.google.com (Spark / free plan is fine)
2. **Build → Firestore Database → Create database** → start in production mode
3. **Build → Authentication → Get started → Email/Password → Enable**
4. Under Authentication → Users, add five accounts:

   ```
   referee@kata.local
   judge1@kata.local
   judge2@kata.local
   judge3@kata.local
   judge4@kata.local
   ```

   Use any password you'll remember. Copy each account's **User UID**.

5. In Firestore, create a collection called `roles`. Add one document per account,
   using the **UID as the document ID**:

   | Document ID   | Fields                                  |
   |---------------|-----------------------------------------|
   | referee's UID | `role: "referee"`                        |
   | judge1's UID  | `role: "judge"`, `seat: 1` (number)      |
   | judge2's UID  | `role: "judge"`, `seat: 2`               |
   | judge3's UID  | `role: "judge"`, `seat: 3`               |
   | judge4's UID  | `role: "judge"`, `seat: 4`               |

   `seat` must be a **number**, not a string.

6. **Project settings → Your apps → Web app** → register one, copy the config values

## 2. Local setup

```bash
npm install
cp .env.example .env      # paste your Firebase config values in
npm run dev
```

Open http://localhost:5173 and sign in as the referee.
The scoreboard is at http://localhost:5173/?portal — no login needed.

## 3. Deploy

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick your project
npm run build
firebase deploy
```

Deploy the rules too — `firebase deploy` covers both because they're listed in
`firebase.json`. Verify in the console that `firestore.rules` matches this repo;
the default rules deny everything and nothing will work until you replace them.

## 4. On the phones

Open the deployed URL in Chrome on Android → menu (⋮) → **Add to Home screen**.
Then set screen timeout to 10 minutes and turn on Do Not Disturb.

## How it runs

1. Referee enters both names → **Create match**
2. Referee taps **Open round** — judges' steppers unlock
3. Each judge sets a score for AKA and AO, taps **Submit scores**
4. Referee sees seats fill in, but not the values
5. Referee taps **Reveal** — totals computed, scoreboard shows the winner
6. Referee creates the next match

## Changing the scoring rules

`src/firebase.js` holds the range, step and judge count. If you change the range,
update the matching bounds in `firestore.rules` — they're enforced server-side.

Totals are a straight sum of all four judges. To switch to a trimmed mean, change
the reduce in `reveal()` inside `src/pages/Referee.jsx`.

## Known limits

- The referee's phone computes the total. If it dies mid-reveal, nobody writes the result.
- No offline queueing. A judge with no signal can't submit.
- Free tier: 50k reads and 20k writes per day. A match costs about 12 writes.
