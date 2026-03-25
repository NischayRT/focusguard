# FocusGuard

> AI-powered focus intelligence for your desktop. Real-time gaze detection that tells you exactly when you're working and when you drift — down to the second.

[![Platform](https://img.shields.io/badge/platform-Windows-blue?style=flat-square)](https://github.com/NischayRT/FocusGuard/releases)
[![Electron](https://img.shields.io/badge/Electron-28-47848F?style=flat-square&logo=electron)](https://electronjs.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python)](https://python.org)
[![MediaPipe](https://img.shields.io/badge/MediaPipe-FaceMesh-FF6F00?style=flat-square)](https://developers.google.com/mediapipe)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com)

---
## Download

[![Download for Windows](https://img.shields.io/badge/Download-Windows%20Installer-0078D4?style=for-the-badge&logo=windows)](https://github.com/NischayRT/FocusGuard/releases/download/v1.0.0/FocusGuard-Setup-1.0.0.exe)

[View all releases](https://github.com/NischayRT/FocusGuard/releases/tag/v1.0.0)

## What is FocusGuard?

FocusGuard is a desktop productivity application that uses your webcam and a local AI model to measure focus in real time. Unlike traditional Pomodoro timers that assume you are working during a session, FocusGuard actually detects whether you are looking at your screen — and records the exact seconds you were focused vs away.

Every two seconds while your timer is running, FocusGuard analyzes a frame from your webcam using MediaPipe FaceMesh to detect your head orientation and eye state. The result is a session report with precise metrics: focused time, away time, focus percentage, and a minute-by-minute breakdown.

**The AI runs entirely on your machine. No frames, no video, no biometrics are ever sent to any server.**

---

## Screenshots

> Timer screen · Session report · Session history
![alt text](image.png)

---

## Table of Contents

- [How It Works](#how-it-works)
- [The AI Agent — Detailed](#the-ai-agent--detailed)
- [Privacy & Safety](#privacy--safety)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Building for Production](#building-for-production)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Detection Thresholds](#detection-thresholds)
- [Roadmap](#roadmap)
- [License](#license)

---

## How It Works

### The full pipeline, step by step

```
1. User starts focus timer
         ↓
2. Webcam activates (OS camera light turns on)
         ↓
3. Every 2 seconds:
   WebcamPreview.jsx captures a frame via <canvas>
   → toDataURL('image/jpeg', 0.7) → base64 string
         ↓
4. POST /analyze { frame: "<base64>" }
   → localhost:5000 (local Flask server)
         ↓
5. Python decodes frame → OpenCV → BGR numpy array
         ↓
6. MediaPipe FaceMesh processes array
   → 468 facial landmark coordinates (normalized 0–1)
         ↓
7. GazeEstimator extracts:
   - Head yaw  (left/right turn, from nose-to-eye ratios)
   - Head pitch (up/down tilt, from nose-to-chin angle)
   - Eye Aspect Ratio (EAR, from eyelid landmark distances)
         ↓
8. Threshold check:
   |yaw| > 25°  OR  |pitch| > 20°  OR  EAR < 0.18
   OR face not detected  →  mark second as "AWAY"
         ↓
9. ScoreCalculator updates rolling 30-sample window
   → returns focus_score (0–100), should_nudge (bool)
         ↓
10. React UI updates:
    - Live status: FOCUSED / DISTRACTED
    - Focus score bar
    - Yaw/pitch readout
    - Timer tracks focused vs away seconds
         ↓
11. If should_nudge:
    - Single low beep (440→280Hz, 0.5s)
    - Electron desktop notification
         ↓
12. When focus restored:
    - Single positive double-beep (440+660Hz)
         ↓
13. Session ends → report generated:
    focused_time = elapsed - away_seconds
    focus_pct = (focused_time / total_duration) × 100
         ↓
14. User saves → POST to Supabase sessions table
    (only metadata, never video or biometrics)
```

---

## The AI Agent — Detailed

### What model is being used?

FocusGuard uses **MediaPipe Face Landmarker** (`face_landmarker.task`, float16, ~29MB), an open-source model developed and maintained by Google. It is part of the MediaPipe Tasks library and is publicly available at:

```
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

This model detects **468 facial landmarks** in a single RGB image. Landmarks include the positions of eyes, eyebrows, nose, lips, ears, and face contour — all represented as normalized (x, y, z) coordinates in the range 0–1.

### What FocusGuard does with those 468 landmarks

FocusGuard uses **only a small subset** of landmarks to compute three signals:

#### Signal 1 — Head Yaw (left/right rotation)

```python
# Landmarks used
NOSE_TIP   = 1
LEFT_EYE_L = 226   # left eye outer corner
RIGHT_EYE_R = 446  # right eye outer corner

# Calculation
nose_to_left  = abs(nose.x - left_eye.x)
nose_to_right = abs(nose.x - right_eye.x)
ratio = nose_to_right / (nose_to_left + nose_to_right)
yaw   = (ratio - 0.5) * 90  # degrees

# When facing forward: ratio ≈ 0.5, yaw ≈ 0°
# When turned right:  ratio > 0.5, yaw > 0°
# When turned left:   ratio < 0.5, yaw < 0°
```

#### Signal 2 — Head Pitch (up/down tilt)

```python
# Landmarks used
NOSE_TIP = 1
CHIN     = 152

# Calculation
dy    = chin.y - nose.y
pitch = degrees(atan2(nose.x - chin.x, dy))

# When facing forward: pitch ≈ 0°
# When looking up:     pitch > 0°
# When looking down:   pitch < 0°
```

#### Signal 3 — Eye Aspect Ratio (EAR)

```python
# Landmarks used (left eye)
LEFT_EYE_TOP    = 159
LEFT_EYE_BOTTOM = 145
LEFT_EYE_LEFT   = 33
LEFT_EYE_RIGHT  = 133

# Calculation
vertical   = distance(top, bottom)
horizontal = distance(left, right)
EAR        = vertical / horizontal

# Open eye:   EAR ≈ 0.25–0.35
# Closed eye: EAR < 0.18
# Both eyes averaged
```

### What is NOT being done

The model returns 468 landmark coordinates. FocusGuard reads **8 of them** for gaze/eye signals and ignores the other 460. Specifically:

- No facial recognition or identity matching
- No emotion detection or expression analysis
- No face embedding or biometric encoding
- No lip reading, microexpression tracking, or attention classification
- No machine learning inference beyond the landmark model itself

The classification of "focused vs away" is a simple geometric threshold check — if angle > N degrees, mark as away. There is no neural network inference happening after the landmark model runs.

### Is this AI "surveillance"?

FocusGuard uses the term "AI surveillance" to describe self-monitoring — the same principle as a gym tracking your reps. The AI watches your head orientation on your own device, on your behalf, to give you data about your own behavior. No third party sees this data. No behavioral profiles are built. The "surveillance" output is a number (0–100) and a boolean (focused/not) per 2-second window, stored only as aggregate session statistics.

---

## Privacy & Safety

### Six core guarantees

| Guarantee | Details |
|---|---|
| **No video stored** | Frames are captured, analyzed in <200ms, and discarded. No recording, no buffer, no temp files. |
| **No cloud inference** | The AI model runs on your CPU via a local Python process. No frame ever leaves your machine. |
| **No biometrics saved** | Session records contain only: duration, focus_time, focus_pct, breaks_taken, timeline. No face data. |
| **Camera off when idle** | Webcam activates only when the timer is running. Pausing or stopping the timer kills the camera stream immediately. |
| **Open thresholds** | Detection thresholds (yaw, pitch, EAR) are documented, adjustable in settings, and applied deterministically. |
| **Row-level security** | All Supabase data is protected by RLS. Users can only access their own session rows — even with a leaked anon key. |

### What data is saved to Supabase (on user request only)

```
sessions table:
  id            uuid      — random, not linked to device or identity
  user_id       uuid      — Supabase auth user ID
  created_at    timestamp — session end time
  duration      int       — total timer seconds
  focus_time    int       — seconds where gaze = focused
  focus_pct     int       — focus_time / duration × 100
  distractions  int       — reserved, currently 0
  breaks_taken  int       — number of breaks taken
  mode          text      — always 'focus'
  timeline      jsonb     — [{minute, focus_pct}] per-minute breakdown
```

No camera data, no landmark coordinates, no behavioral embeddings.

### Open source model

The face_landmarker.task model is publicly available from Google. You can inspect it, replace it, or disable the AI entirely — the Pomodoro timer works fully without the Python API running.

---

## Tech Stack

### Desktop application

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Desktop shell | Electron | 28 | Native window, IPC, Python process lifecycle |
| UI renderer | Next.js | 15 (App Router) | React-based UI running inside Electron |
| Styling | Tailwind CSS | v3 | Utility-first CSS |
| Font | JetBrains Mono | — | Monospaced display font |
| AI model | MediaPipe Face Landmarker | float16 | 468 facial landmark detection |
| Computer vision | OpenCV (opencv-contrib-python) | 4.13 | Frame decoding and color conversion |
| AI server | Flask | 3.0 | Local HTTP server at localhost:5000 |
| Server middleware | flask-cors | 4.0 | CORS for Electron → Flask requests |
| Numerical | NumPy | 2.4 | Landmark coordinate math |
| Bundler | PyInstaller | 6.19 | Bundles Python + model into single .exe |
| Installer | electron-builder | 24 | Produces .exe installer (NSIS) |
| Auth + DB | Supabase | — | Google OAuth + Postgres session storage |

### AI pipeline detail

```
Input:   640×480 JPEG frame (base64 encoded, quality 0.7)
         ↓ ~15KB per frame
Decode:  base64 → bytes → numpy uint8 array → cv2.imdecode
         ↓ BGR numpy array (480, 640, 3)
Convert: cv2.cvtColor BGR→RGB
         ↓ RGB numpy array
Infer:   mp.Image(SRGB) → FaceLandmarker.detect()
         ↓ FaceLandmarkerResult
Extract: result.face_landmarks[0] → 468 NormalizedLandmark objects
         ↓ 8 landmarks used
Compute: yaw, pitch, EAR → threshold checks
         ↓ {face_detected, looking_away, eyes_closed, yaw, pitch}
Score:   ScoreCalculator.record() → rolling 30-sample window
         ↓ {focus_score, distraction_streak, should_nudge}
Output:  JSON response → React → UI update
         ↓ ~30–80ms total per frame
```

---

## Prerequisites

| Tool | Version | Check |
|---|---|---|
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Python | 3.10–3.13 | `python --version` |
| Git | any | `git --version` |

---

## Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/NischayRT/FocusGuard.git
cd FocusGuard
```

### 2. Install root dependencies (Electron)

```bash
npm install
```

### 3. Install renderer dependencies (Next.js)

```bash
cd renderer
npm install
npm install @supabase/supabase-js
cd ..
```

### 4. Set up Supabase

**a) Create a project** at [supabase.com](https://supabase.com)

**b) Run the schema** in SQL Editor:

```sql
create table if not exists sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  created_at   timestamptz default now(),
  duration     int,
  focus_time   int,
  focus_pct    int,
  distractions int,
  breaks_taken int default 0,
  mode         text,
  timeline     jsonb
);

alter table sessions enable row level security;

create policy "users own sessions"
  on sessions for all
  using (auth.uid() = user_id);
```

**c) Enable Google OAuth:**
1. Supabase → Authentication → Providers → Google → Enable
2. Create OAuth credentials at [console.cloud.google.com](https://console.cloud.google.com)
3. Authorized redirect URI: `https://YOUR_PROJECT_ID.supabase.co/auth/v1/callback`
4. Also add: `FocusGuard://auth/callback` to Supabase redirect URLs

**d) Create `.env.local`** in `renderer/`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Set up Python AI backend

```bash
cd python-api

# Create virtual environment
python -m venv venv

# Activate
source venv/Scripts/activate   # Windows Git Bash
# source venv/bin/activate     # Mac/Linux

# Install dependencies
pip install flask flask-cors mediapipe opencv-python numpy

# The face_landmarker.task model (~29MB) downloads automatically on first run
```

### 6. Run in development

**Terminal 1 — Python AI backend:**
```bash
cd python-api
source venv/Scripts/activate
python app.py
# → Running on http://127.0.0.1:5000
```

**Terminal 2 — Electron + Next.js:**
```bash
npm run dev
# Starts Next.js on :3000, then launches Electron window
```

> The app works without the Python API running — the timer, breaks, and UI all function fully. Only gaze detection and focus scoring require the API.

---

## Building for Production

```bash
# Windows (from project root)
scripts\build.bat
```

Or step by step:

```bash
# 1. Build Next.js static export
cd renderer && npm run build && cd ..

# 2. Bundle Python API with PyInstaller
cd python-api
source venv/Scripts/activate
pyinstaller FocusGuard.spec --clean --noconfirm
cd ..

# 3. Package with electron-builder
npx electron-builder --win
```

Output: `dist/FocusGuard-Setup-1.0.0.exe`

---

## Environment Variables

| Variable | File | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `renderer/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `renderer/.env.local` | Supabase anon public key |

---

## Database Schema

```sql
sessions
  id            uuid          PK, auto-generated
  user_id       uuid          FK → auth.users, cascade delete
  created_at    timestamptz   Auto-set on insert
  duration      int           Total timer seconds (including extensions)
  focus_time    int           Seconds classified as focused (elapsed - away)
  focus_pct     int           focus_time / duration × 100, capped at 100
  distractions  int           Reserved (currently 0)
  breaks_taken  int           Break sessions taken during this focus session
  mode          text          Always 'focus' in current version
  timeline      jsonb         Array: [{minute: int, focus_pct: int}]
```

RLS policy: `auth.uid() = user_id` — users can only read/write/delete their own rows.

---

## API Reference

The Python Flask server runs at `http://localhost:5000`.

### `GET /health`

Liveness check. Returns immediately.

```json
{ "status": "ok", "model": "mediapipe-facemesh" }
```

### `POST /analyze`

Analyze a single webcam frame.

**Request:**
```json
{
  "frame": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

**Response:**
```json
{
  "face_detected":       true,
  "looking_away":        false,
  "eyes_closed":         false,
  "yaw":                 -3.24,
  "pitch":               1.87,
  "left_ear":            0.312,
  "right_ear":           0.298,
  "confidence":          1.0,
  "focus_score":         88,
  "distraction_streak":  0,
  "should_nudge":        false,
  "session_focus_pct":   91
}
```

### `POST /session/start`

Resets the rolling score calculator. Call when a new focus session begins.

```json
{ "status": "session started" }
```

### `POST /session/end`

Returns full session stats including per-minute timeline.

```json
{
  "focus_score":        88,
  "session_focus_pct":  91,
  "distraction_streak": 0,
  "should_nudge":       false,
  "window_size":        30,
  "timeline":           [{"minute": 0, "focus_pct": 94}, ...],
  "total_samples":      750
}
```

---

## Detection Thresholds

All thresholds are configurable in Settings → Sensitivity.

| Signal | Strict | Balanced (default) | Relaxed |
|---|---|---|---|
| Head yaw | ±15° | ±25° | ±35° |
| Head pitch | ±12° | ±20° | ±28° |
| Eye aspect ratio | < 0.20 | < 0.18 | < 0.15 |

**Balanced** is recommended for most users. Use **Strict** if you want to be flagged for small head movements. Use **Relaxed** if you frequently read physical materials next to your screen.

---

## Roadmap

- [x] Phase 1 — Packaging & installability (Windows installer)
- [x] Phase 2 — Onboarding & settings
- [ ] Phase 3 — AI calibration (personal threshold tuning per user)
- [ ] Phase 4 — Analytics dashboard (weekly trends, best hours heatmap)
- [ ] Phase 5 — Beta release & metrics collection
- [ ] Mac (.dmg) and Linux (.AppImage) builds
- [ ] Auto-updater via electron-updater
- [ ] Offline session queue (save when back online)

---

## Contributing

Pull requests welcome. For major changes, open an issue first to discuss.

Please do not submit PRs that:
- Add cloud video processing or frame storage
- Change the default behavior to send data off-device
- Remove the RLS policies from the database schema

---

## Author

Built by **Nischay Reddy Thigulla** — [GitHub](https://github.com/NischayRT) · [Portfolio](https://nischay-reddy.vercel.app)
