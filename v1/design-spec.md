# PT Flashcard App — UI Spec (Option #3: Soft Gradient Modern)

A calm, modern, “techy” look (indigo → deep blue → violet gradients). Friendly but not childish.
Optimized for fast sessions with swipe gestures + audio playback + lightweight HUD.

---

## 1) Screen Layout

### Regions
1. **Header HUD (fixed)**
   - Left: ✅ correct count
   - Middle: 🃏 remaining cards
   - Right: ⏱ elapsed session timer (counts up)
2. **Card Stage (center)**
   - Primary Portuguese word
   - Audio button (“Tap to play”)
3. **Gesture Layer**
   - Swipe right = Know (then confirm via 3 English choices)
   - Swipe left = Don’t know (shows answer, re-queues)

### Spacing (baseline)
- Safe area top + **12px**
- HUD height: **44px**
- Card container width: **86–90%** of screen width
- Card stage vertical padding: **24px**
- Primary CTA/button min height: **52px**

---

## 2) Visual Style

### 2.1 Background (Soft Gradient Modern)
- Base background is a **multi-stop gradient** (no neon streaks).
- Add very subtle noise texture (optional) for depth.

**Gradient suggestion**
- Top: deep indigo
- Middle: deep blue
- Bottom: violet tint

**Optional accents**
- Faint blurred blobs behind the card (10–15% opacity) for depth.
- No hard edges, no sharp beams.

---

## 3) Color Tokens (Design System)

> Adjust exact hex values to taste; keep relationships consistent.

### Core
- `bg0`: `#070A1A` (deep base)
- `bg1`: `#0B1B4A` (deep blue)
- `bg2`: `#2B1C6B` (violet)
- `surface`: `rgba(255,255,255,0.08)` (glass surface)
- `surfaceStrong`: `rgba(255,255,255,0.12)`
- `stroke`: `rgba(255,255,255,0.18)`
- `textPrimary`: `#FFFFFF`
- `textMuted`: `rgba(255,255,255,0.72)`

### Semantic
- `good`: `#35FF8A`
- `bad`: `#FF3D5A`
- `info`: `#22D3FF` (timer accent)
- `brand`: `#6A5CFF` (primary accent)

---

## 4) Typography

### Primary word (Portuguese)
- Size: **44–56**
- Weight: **800**
- Letter spacing: **-0.5**
- Color: `textPrimary`

### Secondary text
- Button label: **16–18**, weight **700**
- HUD numbers: **16–18**, weight **700**
- HUD labels (if any): **12–13**, weight **600**, `textMuted`

Recommended font families:
- iOS: SF Pro
- Android: System / Inter (optional)

---

## 5) Header HUD (Styled)

### Structure
A **single soft-glass bar** containing three clusters.

**Left cluster**
- Icon: FontAwesome `faCircleCheck` (or `faCheck`)
- Count: correct
- Icon: FontAwesome `faCircleXmark` (or `faXmark`)
- Count: wrong

**Middle cluster**
- Icon: FontAwesome `faLayerGroup` (or `faClone`)
- Count: remaining cards

**Right cluster**
- Icon: FontAwesome `faClock`
- Time: elapsed `MM:SS` (counting up)

### Styling
- Container:
  - Height: **44**
  - Radius: **22**
  - Fill: `surface`
  - Border: `1px stroke`
  - Optional blur: **8–16** (platform dependent)
- Pills inside HUD:
  - Height: **30–32**
  - Radius: **16**
  - Fill: `surfaceStrong`
  - Border: `1px rgba(255,255,255,0.12)`
- Accents:
  - Correct icon tinted `good`
  - Wrong icon tinted `bad`
  - Timer icon tinted `info`
  - Remaining icon tinted `brand`

### Behavior
- Correct increment: quick scale pulse on correct pill (1.00 → 1.05 → 1.00, 140ms)
- Wrong increment: subtle shake (4–6px) + red border brighten for 120ms
- Remaining decrement: number “ticks” (fade/slide up 8px over 160ms)

---

## 6) Flashcard Component

### Card Container
- Width: **86–90%**
- Height: **160–200** (responsive)
- Radius: **28–32**
- Fill: soft light surface on dark background
  - Example: `linear-gradient(rgba(255,255,255,0.14) → rgba(255,255,255,0.06))`
- Border: `1px stroke`
- Shadow: soft drop shadow (no neon glow)

### Word Placement
- Centered horizontally
- Slightly above center vertically to make room for CTA

### Audio Button (“Tap to play”)
- Pill button
- Height: **52**
- Radius: **26**
- Fill: `brand` with subtle gradient (brand → slightly darker brand)
- Text: `textPrimary`
- Icon: FontAwesome `faVolumeHigh` (or `faVolumeUp`)
- Press state:
  - Scale: **0.98**
  - Brighten fill slightly
  - Optional haptic (mobile)

---

## 7) Swipe & Confirmation Flow

### Default card state
- Shows Portuguese word + audio button.
- No English shown yet.

### Swipe LEFT = “Don’t know”
- Immediately reveal:
  - English translation (single correct)
  - Optional short hint: “to let / to allow / to leave”
- Counts:
  - `wrong += 1`
- Card behavior:
  - Re-queue card (end of session queue is fine)
- After a short delay (500–800ms), proceed to next card.

### Swipe RIGHT = “Know”
- Show **3 English options** (multiple choice confirm).
- User must pick one:
  - If correct:
    - `correct += 1`
    - `remaining -= 1`
    - advance to next card
  - If wrong:
    - `wrong += 1`
    - keep card in queue (re-queue)
    - optionally show correct choice briefly (400–600ms)

### Option UI (confirm step)
- Uses the same soft-glass style:
  - Option tiles: radius **18–22**, fill `surfaceStrong`, border `stroke`
  - Correct selection: border tint `good`
  - Wrong selection: border tint `bad`

---

## 8) Timer Rules (Counts Up)

- Starts on first card shown (or first interaction—choose one; recommended: **on first card shown**)
- Format:
  - `< 1 hour`: `MM:SS`
  - `>= 1 hour`: `H:MM:SS`
- Always visible in HUD.

---

## 9) Icon Set (FontAwesome)

Recommended icons:
- Correct: `faCircleCheck`
- Wrong: `faCircleXmark`
- Remaining cards: `faLayerGroup` (or `faClone`)
- Timer: `faClock`
- Audio: `faVolumeHigh`

Notes:
- Keep icons **18px** in HUD and **18–20px** in button.
- Use consistent stroke/weight style across all icons.

---

## 10) Implementation Notes (React Native / Web-friendly)

- Prefer a single `Theme` object exporting tokens above.
- HUD: `position: absolute` top; respects safe area.
- Card stage: center aligned; swipes via gesture handler.
- Blur:
  - If blur unavailable on web, emulate glass with opacity + subtle border + shadow.
- Keep animations short and subtle (120–180ms) to match “modern calm” style.

---

## 11) Acceptance Checklist

- [ ] Background is gradient + calm (no neon streaks)
- [ ] HUD is a glass bar with three clusters (correct/wrong, remaining, timer)
- [ ] Card is soft-glass, rounded, premium
- [ ] Swipe left skips MCQ; swipe right triggers MCQ confirm
- [ ] Timer counts up and is always visible
- [ ] FontAwesome icons used consistently