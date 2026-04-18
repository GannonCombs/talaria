# Talaria PRD: Fitness Module v4

**Version:** 4.0
**Date:** April 17, 2026
**Scope:** Workout tracking, biometric scoring, social ghost racing, wearable integration, mobile-first entry

---

## 1. Vision

A workout tracker so frictionless that logging a full session takes fewer taps than checking Instagram. It scores every workout honestly, shows progress visually, and makes you want to come back tomorrow. The differentiator: biometric ghost racing — your workout score is validated by your heart rate, and you can race friends' workouts with an effort-adjusted score that levels the playing field regardless of fitness level.

---

## 2. Data Architecture & Talaria-Wide Considerations

### 2.1 Database Strategy

The fitness module is the first module that requires real mobile access (logging at the gym). This forces the broader decision: local SQLite vs. edge-hosted database.

**Recommendation: Turso (edge SQLite) for ALL of Talaria, not just fitness.**

Turso is wire-compatible with SQLite (uses libSQL). The migration from `better-sqlite3` to `@libsql/client` requires minimal code changes — the query syntax is identical, the main difference is async/await. Benefits across all modules:

- Fitness: log workouts at the gym from phone over cell data
- Portfolio: check net worth from your phone on the go
- Housing: browse listings from your couch on your iPad
- Multi-computer sync: both your machines hit the same database
- No tunneling, no sync scripts, no offline-first complexity

**Free tier:** 9 billion row reads, 500 databases, 25 edge locations. More than sufficient.

**Migration path:** Move all tables to Turso at once. Create a single Turso database. Update the connection string in Talaria's db config. Test each module. Deploy. This is a one-time infrastructure change, not a per-module decision.

**Security:** Turso connections are TLS-encrypted. Auth tokens stored as environment variables. For phone access, add a simple auth middleware (password or session token) to Talaria's API routes so the public URL isn't open.

### 2.2 Module Data Isolation

Each module owns its own tables, prefixed by module name: `fitness_workouts`, `fitness_sets`, `portfolio_holdings`, `housing_listings`, etc. No cross-module foreign keys. Modules communicate through Talaria's application layer, not database joins. This keeps each module self-contained and allows independent development.

Shared infrastructure: `user_preferences`, `cleetus_command_log`, `wallet_transactions`, `cost_tracking`. These are shell-level tables used across modules.

---

## 3. The Score System

### 3.1 Base Score (0.00–10.00, two decimal places)

Absolute, MET-based, not personalized. A beginner's first workout might be 1.50. A veteran's heavy day is 7-8. A 9+ day is rare and earned. The score does not adjust to your history — it's a fixed scale. Watching your numbers climb over months IS the motivation.

**Weighted exercises:** effort = Σ(sets × reps × weight × exercise_coefficient). Exercise coefficients: compound movements ~1.0-1.3 (squat 1.3, bench 1.0, deadlift 1.3, OHP 1.1), isolation ~0.5-0.8 (bicep curl 0.6, lateral raise 0.5, cable fly 0.7). Modifier multipliers: 🔥 = 1.1×, 🦥 = 0.85×, 🔄 burnout = 1.15×.

**Drop sets:** "6 reps at 40, 4 reps at 30" = (6 × 40) + (4 × 30) = 360 effort units for that set. Stored as one set entry with primary and drop sub-components.

**Cardio:** effort = duration_minutes × intensity × METs. Running 6mph ~10 METs, walking 3mph ~3.5, cycling moderate ~7. When wearable HR data is available, actual heart rate zones replace estimated METs for higher accuracy.

**Bodyweight:** effort = reps × bodyweight_fraction × difficulty. Push-ups ~0.65×BW, pull-ups ~1.0×, bodyweight squats ~0.6×.

**Daily total** maps summed effort units onto the 0-10 scale via a fixed, population-calibrated curve.

### 3.2 Biometric Multiplier (wearable integration, optional)

When heart rate data is available for the workout window, the base score is adjusted (0.85–1.25×) based on actual cardiovascular effort vs. expected effort for the logged exercises.

- HR consistently in cardio zone (>70% max HR) during weights → multiplier >1.0
- HR barely elevated during logged heavy sets → multiplier <1.0
- HR matches expected exertion → multiplier ~1.0

Scores with biometric data show a small ❤️ badge. Scores without are still valid, just unverified. The biometric layer is always optional — the app works fully without any wearable.

### 3.3 Trend Arrow

Alongside the score: ↑ (above your 30-day rolling average for this split), ↓ (below), → (matching). Provides relative context without gaming the absolute score.

### 3.4 Rest Days vs. Skip Days

**Declared rest day:** Tap "Rest Day" button or say "Cleetus, rest day." Earns 0.50 points if following 2+ consecutive workout days. Soft blue dot on heatmap. Does NOT break streaks.

**Skip day:** No log, no declaration. Gray on heatmap. First skip day: streak continues. Two consecutive skip days: streak breaks.

---

## 4. Split Rotation System

### 4.1 Configuration

Define your rotation once: Push → Pull → Legs → Rest → (repeat). Each split template contains: name, muscle groups, ordered exercises with default sets/reps/weight, first exercise flagged as compound (includes warmup set).

### 4.2 Daily Auto-Selection

The app tracks your position in the rotation. When you open fitness: "Today: Push Day" with the full template pre-loaded. One tap to start.

**Swap:** One button shows your other split templates. Tap to swap. The rotation reorders — you'll do the swapped split next time. The cycle stays intact.

**Open Workout:** For off-script days. Blank session. Scores normally. Doesn't affect rotation.

### 4.3 Template Learning

Templates evolve with your routine. If you've added cable flies to push day for 4 consecutive sessions, they become part of the template. If you've dropped an exercise 3 sessions in a row, the app suggests removing it.

---

## 5. Machine Calibration System

### 5.1 The Problem

Same exercise, different machines, different effective weights. A cable machine with a 2:1 pulley ratio means the "50 lb" stack is actually 25 lbs of resistance. A plate-loaded leg press at one gym uses a different sled angle than another, changing effective load. Some machines simply aren't calibrated correctly.

### 5.2 The Solution: Gym Profiles + Machine Adjustments

**Gym Profiles:** Define the gyms you visit. Each gym is a named location (e.g., "LA Fitness Jollyville", "Apartment Gym").

**Machine Adjustments:** Per exercise, per gym, store a calibration modifier. This is a simple multiplier or offset:

- "Cable Fly at LA Fitness: ×0.5" (2:1 pulley, displayed weight is double actual resistance)
- "Cable Fly at Apartment Gym: ×1.0" (standard, no adjustment)
- "Leg Press at LA Fitness: ×0.7" (steeper angle = less effective weight)

**How it works in practice:** When you start a workout, the app asks which gym you're at (or auto-detects based on your phone's location if you grant permission). Your exercise templates load with that gym's calibrated weights. If you normally bench 185 but at the apartment gym the dumbbells are lighter, your template shows the apartment gym's last-used weights for that exercise.

**Impact on scoring:** The score uses the calibrated (effective) weight, not the displayed weight. This keeps scores comparable across gyms. Moving 100 lbs of effective resistance scores the same whether the machine says "100" or "200."

**Entry:** The first time you do an exercise at a new gym, you set the adjustment once. After that, it's automatic. A small gym icon on the exercise card shows which gym profile is active. Tap it to switch or adjust.

### 5.3 Simple Alternative

If full gym profiles feel like overkill: just let exercises have a per-gym note. "Cable fly — Apartment gym uses double-pulley, actual weight is half displayed." The note shows when logging and when reviewing history. No score adjustment math, just a reminder. Start with this, upgrade to calibration multipliers if the note approach isn't enough.

---

## 6. Data Entry

### 6.1 The Set Bubble Grid

Each exercise is a compact card. Pre-filled from your most recent session at the current gym.

**First exercise in each split:** Includes a hollow/outlined warmup bubble before working sets (configured warmup weight, e.g., 1×12 @ 135 before bench working sets).

**Set bubbles:** Circles showing weight (top) / reps (bottom).

**Interactions:**
- **Tap** → confirm as-is (fills with split color)
- **Long-press** → inline edit weight/reps (number pad)
- **Swipe right on row** → add set (clones last values)
- **Swipe left on bubble** → remove set
- **Double-tap confirmed bubble** → emoji modifier picker

**Drop sets:** A small "+" icon inside the bubble adds a drop sub-set. Displays as one bubble with a split layout: "6@40 / 4@30" — primary on top, drop on bottom, thin dividing line.

**Default assumptions:** Unmodified bubbles assume last session's values. Minimum interaction for an unchanged workout = one tap per exercise to confirm.

### 6.2 Emoji Modifiers

Three modifiers, applied per set:

- 🔥 **Fire** — perfect execution. Multiplier: 1.1×
- 🦥 **Sloth** — weak, lazy, bad form. Multiplier: 0.85×
- 🔄 **Burnout** — reduced weight, repped to failure. Multiplier: 1.15×

Applied via iMessage-style reaction picker. Persist in history. Inform future weight suggestions (🦥 → "stay at this weight," 🔥 → "try +5 lbs").

### 6.3 Cardio Entry

**With wearable:** Zero entry. GPS route, distance, pace per segment (auto-detects run vs. walk transitions), heart rate zones, calories — all pulled automatically after sync. Displays as: "Run: 2.0 mi in 17:30 (8:45/mi) → Walk: 0.5 mi in 8:10 (16:20/mi). Avg HR 152."

**Without wearable:** Simple card: Activity type dropdown (Run/Walk/Bike/Other), Duration (minutes), Distance (optional). One dropdown + one number = done.

### 6.4 Voice Entry

"Cleetus, log push day. Bench press, 4 sets of 10 at 185, fire on set 3. Incline dumbbell, 3 sets of 10 at 65. Pushdown, 3 sets of 12 at 50, last set sloth."

Cleetus confirms: "Logged push day. Score: seven point two four. Beating your ghost by point three."

**Quick confirm:** "Cleetus, standard push day." → Logs all exercises with last session's values. Zero changes. One sentence.

---

## 7. The Projection Engine

### 7.1 Live Score Display (pinned during active workout)

Two modes, toggled by tapping the score:

**Building Up:** "Current: 4.21 → Projected: 7.38"
Progress bar fills left to right, color-graded: red-orange (0-3), amber (3-5), green (5-7), teal (7-9), gold (9+).

**Counting Down:** "7.38 — 57% complete — 3.17 remaining"
Bar depletes right to left as exercises are completed.

### 7.2 What-If Queries

"Cleetus, what if I skip triceps?" → "Score drops to six point one two."
"Cleetus, what if I add a burnout on bench?" → "Score bumps to seven six one."

---

## 8. Ghost Mode

### 8.1 Personal Ghost (always available)

Your best-ever session of the current split type loads as the ghost. Each exercise card shows: green edge (ahead of ghost), red edge (behind), neutral (matching). Top displays: "Ghost: 7.82 (best Push, Mar 14). You: 6.41 after 4/6 exercises."

Beat your ghost → confetti animation, new PR badge, ghost updates to today.

### 8.2 Ghost Mode Activation

Ghost mode is **opt-in per workout**, not forced. When you start a session, a small "Race Ghost" toggle is available. Three options:

- **Off** — no ghost, just log your workout
- **Personal** — race your own best
- **Surprise** — the app randomly selects either your personal ghost OR a friend's recent workout of the same split type. You don't know which until the session starts. This is the gamification surprise element. "You're racing... Jake's Tuesday Push! He scored 6.89."

The surprise mode adds an element of not knowing who you're up against, which creates a "let's find out" energy. If it picks your own ghost, you're trying to beat yourself. If it picks a friend, you're competing without planning to.

### 8.3 Social Ghost Mode

**No wearable required for either party.** Ghost racing works purely on raw scores (weight × reps × modifiers). Both people log their workouts, both get scores, both can race each other's sessions.

**With wearable (one or both):** The biometric multiplier adjusts scores for fairness. If only one person has a wearable, their score gets the biometric adjustment; the other person's score stays raw. This naturally encourages the non-wearable friend to get one, for competitive advantage — "Jake's biometric score is 6.89 but his raw was 7.40 — he was cruising. If you had HR data showing you pushed harder, your adjusted score might beat him."

**Friend connections:** Share an invite link. Friends create an account (PWA, no app store needed). Each person sees only: friend name, daily scores, split type, streak count, badge count. Individual exercises and weights are private unless explicitly shared.

**Weekly leaderboard:** Ranked by average daily score across workout days (not total — this prevents "just work out more days" gaming). Quality over quantity.

**Challenges:** Time-boxed: "7-day highest cumulative score," "30-day longest streak," "who hits a 9.00 first." Created by any friend, accepted by others.

---

## 9. Wearable Integration (Optional)

### 9.1 Design Principle: Device-Agnostic

The app accepts heart rate data, GPS data, and exercise data from any source. The integration layer normalizes data into a common format regardless of device.

### 9.2 Data Consumed

| Data | Use | Source |
|------|-----|--------|
| Heart rate (intraday) | Biometric score multiplier, recovery tracking | Wearable API |
| GPS track | Run route, auto-segmented pace | Wearable API |
| Exercise detection | Auto-import cardio (run, walk, bike) | Wearable API |
| Steps | General activity context | Wearable API |
| Resting heart rate | Long-term fitness trend (should decrease) | Wearable API |
| Sleep data | Recovery context ("bad sleep → lower expected performance") | Wearable API |

### 9.3 Supported Devices (priority order)

**Tier 1 — Recommended: Garmin**
- Richest athletic data: VO2 max, training load, lactate threshold, Body Battery
- Cloud REST API (Garmin Health API) — OAuth2, well-documented
- No subscription fee
- GPS for runs with cadence, stride length, elevation
- Recommended device: Forerunner 165 (~$250) or Vívosmart 5 (~$150 band, minimal bulk for lifting)

**Tier 2 — Supported: Fitbit**
- Adequate HR and GPS data for our needs
- Cloud REST API — simpler than Garmin
- Legacy API deprecated September 2026; migrating to Google Health API
- Recommended device: Charge 6 (~$100)

**Tier 3 — Future: Apple Watch via Apple Health**
- Requires a bridge (no direct cloud REST API — HealthKit is SDK-only)
- Could use a middleware service or export mechanism
- Most users already own one

**Implementation:** Start with whichever device you have (Fitbit). Build the integration layer. If/when you switch to Garmin, swap the API connector. The normalized data format stays the same.

### 9.4 Sync Behavior

Wearable syncs to its cloud when phone is nearby. Talaria polls for new data when you open the fitness module or finish a workout. Not real-time during lifting (wearable APIs don't support live streaming), but data is available within minutes of a sync. For runs, the full GPS track and HR timeline arrive after you stop and sync.

---

## 10. Gamification

### 10.1 Streaks

Consecutive days with a workout OR a declared rest day. Broken by 2 consecutive skip days. Milestones: 7, 14, 30, 60, 90, 180, 365 days.

### 10.2 Levels

Cumulative lifetime effort units → level. Exponential curve. Level 1-10 in the first month, 11-25 in months 2-6, 26-50 in months 6-18, 51+ long-term. Never decreases.

### 10.3 Badges

Earned achievements in a visual grid:

- **Streak:** 7-day, 14-day, 30-day, 60-day, 90-day, 180-day, 365-day
- **PRs:** Per exercise, earned each time you set a new PR
- **Score:** First 5.00+, First 7.00+, First 9.00+, Perfect 10
- **Consistency:** 4 splits in 4 days, No skip days for a month
- **Biometric:** HR verified 10 workouts, Recovery improved 20%, RHR below 60
- **Social:** Beat a friend's ghost, Won a weekly challenge
- **Volume:** 100K lbs moved, 100 miles run, 1000 sets logged

### 10.4 PR Detection

Automatic. When a logged weight or rep count exceeds your all-time max for that exercise: trophy icon, celebration, logged in PR history. "New PR: Bench Press — 225 × 6."

---

## 11. Historical Views

### 11.1 Heat Map Calendar

GitHub-style, 365 squares, prominent placement on the main fitness view.

- Skip day: gray (#E1E4E8)
- Declared rest: soft blue (#79B8FF)
- Score 0.01–3.00: lightest green (#9BE9A8)
- Score 3.01–5.00: light green (#40C463)
- Score 5.01–7.00: medium green (#30A14E)
- Score 7.01–8.99: dark green (#216E39)
- Score 9.00+: gold/amber (#F5A623)

### 11.2 Score Timeline (line chart)

Daily scores over time with a 7-day rolling average smoothing line. Time range toggles: 1W, 1M, 3M, 6M, 1Y, ALL. More jagged than portfolio charts — daily variance is higher.

### 11.3 Exercise Progression Charts

Per-exercise: line chart of max weight (or weight × reps) over time. Dropdown to select exercise. The motivating "watch the line go up" chart.

### 11.4 Volume by Muscle Group

Stacked bar chart, weekly. Flags imbalances: "Push volume is 2.5× Pull volume."

### 11.5 Biometric Trends (if wearable connected)

- Resting heart rate over time (should trend down)
- Average workout HR
- HR recovery speed between sets (should trend faster)
- Cardio distance per week

---

## 12. Intelligent Suggestions

Rule-based (no Claude API costs). Max one suggestion per day, never during active workout.

- **Progression:** "Bench 3×10 at 185 for 4 sessions without 🦥. Consider 190." (Only when confidence is high — multiple clean sessions.)
- **Plateau breaking:** "Squat stuck at 225 for 6 weeks. Consider a deload week at 195, then 5lb weekly increases." (Science-backed.)
- **Recovery:** "Heavy push 3 of last 4 days. Chest volume 40% above average. Consider legs/cardio."
- **Imbalance:** "Push volume consistently 2× pull. Consider adding a row variation."

---

## 13. Rest Timer

Auto-starts when a set is confirmed. Default 90 seconds, configurable per exercise (120s for heavy compound, 60s for isolation).

- Circular countdown on screen
- At zero: two short beeps through active audio output (earbuds if connected) + one haptic vibration
- Auto-silences after 2 beeps — no dismiss button needed
- Timer pauses if you start editing the next set (you're engaged, not resting)
- Music ducks briefly for the beeps, then restores

---

## 14. Example User Journey

### Scenario: Tuesday Push Day at LA Fitness

**5:45 PM — Arrive at gym, open Talaria on phone**

The fitness module loads. The app knows you're on day 2 of your rotation (you did Pull yesterday).

Screen shows: "Today: Push Day" with your template pre-loaded. Below: your streak (14 days), level (Level 22), and the heatmap calendar.

You tap "Start Workout."

The app asks: "Which gym?" (shows your saved gyms). You tap "LA Fitness Jollyville." All exercise weights load with this gym's calibrated values.

A ghost toggle appears: "Race Ghost? Off / Personal / Surprise." You tap Surprise. The app reveals: "You're racing Jake's Tuesday Push! He scored 6.89."

**5:47 PM — Bench Press (compound, first exercise)**

The exercise card shows:

Bench Press 🏋️ (Compound)
Warmup: [○ 12 @ 135]
Set 1: [○ 10 @ 185] Set 2: [○ 10 @ 185] Set 3: [○ 10 @ 185] Set 4: [○ 10 @ 185]

All pre-filled from your last Push session at this gym. The warmup bubble is hollow/outlined.

You do your warmup set. Tap the warmup bubble. It fills gray (warmup confirmed, doesn't contribute to score).

You do Set 1. Tap the bubble. It fills teal. The rest timer starts: 90-second circular countdown. The live score at top updates: "Current: 0.82 → Projected: 7.14 | Ghost: 6.89"

You put in your earbuds and start music. 90 seconds pass. Two short beeps play through earbuds. One vibration. Timer resets.

Set 2. Tap. Timer starts. Score updates: "Current: 1.64 → 7.14 | Ghost: 6.89"

Set 3. This one was perfect — great form, great control. Tap to confirm. Then double-tap the filled bubble. The emoji picker appears: 🔥 🦥 🔄. Tap 🔥. The bubble gets a warm amber ring. Score adjusts: "Current: 2.55 → 7.26 | Ghost: 6.89" (the fire modifier bumped the projection).

Set 4. Tough but you got it. Tap to confirm. No modifier. Score: "Current: 3.31 → 7.18"

You're ahead of Jake's ghost pace. The bench press card shows a green left edge.

**5:58 PM — Incline Dumbbell Press**

Card shows: 3 × 10 @ 65. Pre-filled. You did exactly this. Tap, tap, tap — three bubbles confirmed in ~5 seconds. Score climbs: "Current: 4.73 → 7.18"

**6:04 PM — Tricep Pushdown**

Card shows: 3 × 12 @ 50. You do the first two sets fine. Tap, tap. On set 3, you only got 9 reps and it was ugly. Long-press the third bubble → change reps to 9. Tap to confirm. Double-tap → 🦥. Score adjusts: "Current: 5.88 → 6.95" (the sloth and fewer reps lowered the projection slightly).

**6:12 PM — Cable Flies**

Card shows: 3 × 15 @ 30. But wait — you're at LA Fitness and this cable machine has a 2:1 pulley. Your gym profile already has a ×0.5 calibration for this exercise at this gym. The display shows "30 (eff: 15)" so you know the actual resistance. You do your sets. Tap, tap, tap.

**6:16 PM — You're feeling strong. Add a burnout.**

You tap "+ Add Exercise" at the bottom. Type "bench" — autocomplete shows "Bench Press." You select it. Add one set: 8 reps @ 135 with 🔄 burnout modifier. The projection jumps: "Current: 6.94 → 7.52 | Ghost: 6.89" — you're going to beat Jake!

**6:20 PM — Decide to call it**

You could do one more exercise (your template has overhead tricep extension remaining), but 7.52 is great. You check: "Cleetus, what if I stop now?" "Seven point five two. You beat Jake's ghost by point six three."

You tap "Finish Workout."

**The finish screen:**

Score: 7.52 ↑ (above your 30-day push average of 6.8)
❤️ Biometric: 7.83 (your Fitbit shows elevated HR throughout — you pushed hard)
Ghost: Beat Jake! (6.89) 🏆
New PR: None today
Duration: 33 minutes
Streak: 15 days 🔥
Level: 22 → 22 (68% to Level 23)

The heatmap updates: today's square fills medium green. Your score timeline adds a new point.

**6:25 PM — Walking to your car**

"Cleetus, I also walked half a mile from the gym to my car."

"Logged half mile walk. Score updated to seven point six one."

**Later — at home, laptop**

You open Talaria on your laptop. The fitness module shows today's workout data already (Turso synced it in real time). The portfolio dashboard card shows the updated streak count. Everything is in sync.

Jake gets a notification: "G beat your Push Day ghost! 7.83 (biometric) vs your 6.89."

---

## 15. Mobile Experience

### 15.1 PWA (Progressive Web App)

No app store. Add Talaria to your phone's home screen. Full-screen experience, no browser chrome. Works over cell data via Turso.

### 15.2 Mobile-First Layout

The fitness module is designed for 390px-width (iPhone 14/15). Exercise cards, set bubbles, score display, and timer are all touch-optimized. Bubbles are large enough to tap accurately with sweaty fingers at the gym.

Desktop layout is the same content in a wider viewport — no separate design needed. The exercise cards just get more horizontal breathing room.

---

## 16. Data Model

### 16.1 Tables

```sql
-- Gym profiles
CREATE TABLE fitness_gyms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                      -- "LA Fitness Jollyville"
  latitude REAL,                           -- For auto-detection (optional)
  longitude REAL,
  notes TEXT
);

-- Machine calibration per exercise per gym
CREATE TABLE fitness_calibrations (
  id INTEGER PRIMARY KEY,
  gym_id INTEGER REFERENCES fitness_gyms(id),
  exercise_name TEXT NOT NULL,
  multiplier REAL DEFAULT 1.0,             -- 0.5 = double-pulley, 1.0 = standard
  notes TEXT                               -- "Double-pulley cable machine"
);

-- Split templates
CREATE TABLE fitness_splits (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,                      -- "Push"
  muscle_groups TEXT,                      -- JSON: ["Chest", "Triceps"]
  rotation_order INTEGER NOT NULL,
  exercises TEXT NOT NULL                  -- JSON: [{name, default_sets, default_reps, default_weight, is_compound, warmup_weight}]
);

-- Rotation state
CREATE TABLE fitness_rotation_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  current_split_index INTEGER NOT NULL,
  last_workout_date TEXT
);

-- Workout sessions
CREATE TABLE fitness_workouts (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  split_id INTEGER REFERENCES fitness_splits(id),
  split_name TEXT,
  gym_id INTEGER REFERENCES fitness_gyms(id),
  type TEXT NOT NULL,                      -- "split" | "open" | "rest"
  score_raw REAL,
  score_biometric REAL,
  biometric_multiplier REAL,               -- null if no wearable
  duration_minutes INTEGER,
  started_at TEXT,
  finished_at TEXT,
  notes TEXT,
  ghost_type TEXT,                         -- "personal" | "friend" | "surprise" | null
  ghost_target_id TEXT,                    -- Friend ID or own workout ID
  ghost_beaten BOOLEAN
);

-- Exercises within a workout
CREATE TABLE fitness_exercises (
  id INTEGER PRIMARY KEY,
  workout_id INTEGER REFERENCES fitness_workouts(id),
  exercise_name TEXT NOT NULL,
  exercise_type TEXT NOT NULL,             -- "weighted" | "bodyweight" | "cardio"
  is_compound BOOLEAN DEFAULT FALSE,
  sort_order INTEGER NOT NULL,
  effort_units REAL,
  calibration_multiplier REAL DEFAULT 1.0
);

-- Sets within an exercise
CREATE TABLE fitness_sets (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER REFERENCES fitness_exercises(id),
  set_number INTEGER NOT NULL,
  set_type TEXT DEFAULT 'working',         -- "warmup" | "working" | "burnout"
  weight REAL,
  reps INTEGER,
  drop_weight REAL,                        -- For drop sets
  drop_reps INTEGER,
  modifier TEXT,                           -- "fire" | "sloth" | "burnout" | null
  modifier_multiplier REAL DEFAULT 1.0,
  heart_rate_avg INTEGER,
  heart_rate_peak INTEGER
);

-- Cardio entries
CREATE TABLE fitness_cardio (
  id INTEGER PRIMARY KEY,
  exercise_id INTEGER REFERENCES fitness_exercises(id),
  activity_type TEXT NOT NULL,
  duration_minutes REAL,
  distance_miles REAL,
  pace_per_mile TEXT,
  heart_rate_avg INTEGER,
  heart_rate_max INTEGER,
  calories INTEGER,
  gps_route TEXT,                          -- JSON of lat/lng points
  segments TEXT,                           -- JSON: [{type, distance, pace, hr_avg}]
  wearable_exercise_id TEXT                -- For deduplication
);

-- Personal records
CREATE TABLE fitness_prs (
  id INTEGER PRIMARY KEY,
  exercise_name TEXT NOT NULL,
  record_type TEXT NOT NULL,               -- "max_weight" | "max_reps" | "max_volume" | "best_pace"
  value REAL NOT NULL,
  previous_value REAL,
  workout_id INTEGER REFERENCES fitness_workouts(id),
  achieved_date TEXT NOT NULL
);

-- Friends
CREATE TABLE fitness_friends (
  id INTEGER PRIMARY KEY,
  friend_name TEXT NOT NULL,
  friend_id TEXT NOT NULL UNIQUE,
  connected_date TEXT,
  has_wearable BOOLEAN DEFAULT FALSE
);

-- Badges
CREATE TABLE fitness_badges (
  id INTEGER PRIMARY KEY,
  badge_type TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  earned_date TEXT NOT NULL,
  metadata TEXT                            -- JSON context
);
```

---

## 17. MCP Tools (Cleetus Integration)

Registered with the Phase 1 tool registry:

| Tool | Type | Description |
|------|------|-------------|
| `fitness_get_today` | query | Returns today's split, score, streak, and rotation position |
| `fitness_get_score` | query | Returns score for today or a specific date |
| `fitness_get_streak` | query | Returns current streak length and milestone proximity |
| `fitness_get_next_split` | query | Returns what split is next in rotation |
| `fitness_log_workout` | action | Accepts structured workout data from voice, logs everything |
| `fitness_log_rest_day` | action | Declares a rest day |
| `fitness_log_quick` | action | Logs standard split with last session's values ("standard push day") |
| `fitness_get_prs` | query | Returns PRs, optionally filtered by exercise |
| `fitness_get_suggestion` | query | Returns current progression/recovery suggestion |
| `fitness_what_if` | query | Projection engine query ("what if I skip triceps") |
| `fitness_get_ghost` | query | Returns best session for split type, or friend's recent session |
| `fitness_navigate` | action | Opens fitness module in browser |

---

## 18. Build Order

1. **Turso migration** — move all Talaria tables from local SQLite to Turso. Test all existing modules.
2. **Data model** — create fitness tables in Turso
3. **Split template system** — CRUD for splits, rotation logic, auto-selection
4. **Set entry UI (mobile-first)** — bubble grid with tap-confirm, long-press-edit, swipe-add/remove
5. **Scoring engine** — MET calculations, modifier multipliers, daily score
6. **Workout flow** — start → select gym → log exercises → finish → score display
7. **Projection engine** — live score with projected finish, building-up/counting-down toggle
8. **Heat map calendar** — GitHub-style with color grading
9. **Score timeline + exercise progression charts** — line charts with time range toggles
10. **Gym profiles + calibration** — per-gym per-exercise weight adjustments
11. **Rest timer** — between-set countdown, audio + haptic, auto-silence
12. **Gamification** — streaks, levels, badges, PR detection
13. **Ghost mode (personal)** — load best session, compare during workout
14. **Wearable integration** — device-agnostic layer, Fitbit/Garmin connector, auto-import cardio, biometric multiplier
15. **Social ghost mode** — friend connections, shared scores, leaderboard, challenges, surprise mode
16. **MCP tools** — Cleetus integration for voice control
17. **PWA setup** — service worker, manifest, add-to-home-screen prompt
18. **Intelligent suggestions** — rule-based progression and recovery advice

---

## 19. Dependencies

| Package | Purpose |
|---------|---------|
| `@libsql/client` | Turso connection (replaces better-sqlite3) |
| `recharts` | Charts (score timeline, exercise progression, volume) |
| Wearable API (Garmin/Fitbit) | Heart rate, GPS, exercise data |
| `fuse.js` | Exercise name autocomplete/search |
| Next.js PWA plugin | Service worker, offline shell, add-to-home-screen |
| Existing Talaria stack | Next.js, Tailwind, Inter/JetBrains Mono |
