# Flashy - Violet Pulse Theme v3

Redesign direction based on your reference image:
- Keep the purple + cyan family.
- Shift role ownership so UI feels cleaner and more premium.
- Use violet as atmosphere and identity, not as the default fill everywhere.

Palette source:
- Dominant: `#9C54D5`
- Support: `#462964`
- Accent: `#5EE2F0`
- Brand Gradient: `#462964 -> #9C54D5 -> #5EE2F0`

Brand feel:
Confident - Modern - Luminous - Focused - Audio-first

---

## 1) Role Switch (Element Reassignment)

This is the key redesign decision.

Before:
- Dominant violet drove most active and primary elements.
- Support mostly sat in background and text emphasis.

Now:
- `Support (#462964)` is the primary action and structural anchor.
- `Dominant (#9C54D5)` is used for selected states, glow, and branded emphasis.
- `Accent (#5EE2F0)` is reserved for audio/live/now-playing moments.

Why this works:
- Better text contrast on buttons and controls.
- Less visual fatigue from constant bright violet.
- Clear semantic split: structure vs energy vs signal.

---

## 2) Foundation Tokens

### Core Brand Colors
- `color.support.700`: `#462964`
- `color.dominant.500`: `#9C54D5`
- `color.accent.400`: `#5EE2F0`
- `color.gradient.brand`: `linear-gradient(135deg, #462964 0%, #9C54D5 52%, #5EE2F0 100%)`

### Neutrals (Light)
- `color.bg.canvas`: `#F8F8FB`
- `color.bg.surface`: `#FFFFFF`
- `color.border.subtle`: `#E7E7F1`
- `color.text.primary`: `#1B1B1F`
- `color.text.secondary`: `#5C5C70`
- `color.text.onDark`: `#FFFFFF`

### Neutrals (Dark)
- `color.bg.canvas.dark`: `#140D20`
- `color.bg.surface.dark`: `#221533`
- `color.border.subtle.dark`: `#3A2A50`
- `color.text.primary.dark`: `#F3F1F8`
- `color.text.secondary.dark`: `#B7AEC9`

---

## 3) Semantic Tokens

### Actions
- `action.primary.bg`: `#462964`
- `action.primary.text`: `#FFFFFF`
- `action.primary.hover`: `#543378`
- `action.primary.pressed`: `#3A2254`

- `action.secondary.bg`: `rgba(70, 41, 100, 0.08)`
- `action.secondary.border`: `rgba(70, 41, 100, 0.22)`
- `action.secondary.text`: `#462964`

### Selection and Focus
- `state.selected`: `#9C54D5`
- `state.focusRing`: `rgba(156, 84, 213, 0.42)`
- `state.activeGlow`: `0 0 0 4px rgba(156, 84, 213, 0.18)`

### Audio / Live Signal
- `state.audio.live`: `#5EE2F0`
- `state.audio.idle`: `rgba(94, 226, 240, 0.26)`
- `state.audio.glow`: `0 0 18px rgba(94, 226, 240, 0.35)`

---

## 4) Component Recipes (Switched and Rationalized)

### Primary Button
- Fill: `#462964`
- Text/Icon: `#FFFFFF`
- Radius: `14px`
- Height: `48px`
- Shadow: `0 8px 20px rgba(70, 41, 100, 0.30)`
- Use `#9C54D5` only for active halo or progress edge.

### Secondary Button
- Fill: `rgba(70, 41, 100, 0.08)`
- Border: `1px solid rgba(70, 41, 100, 0.22)`
- Text: `#462964`
- Hover tint: `rgba(156, 84, 213, 0.12)`

### Tertiary / Text Button
- Text: `#462964`
- Hover text: `#9C54D5`
- Underline/focus indicator: `#9C54D5`

### Tab Bar
- Inactive text: `#5C5C70`
- Active text: `#462964`
- Active underline/pill: `#9C54D5`
- Optional now-playing dot on active tab: `#5EE2F0`

### Card / Player Surface
- Card bg: `#FFFFFF`
- Radius: `18px`
- Border: `1px solid #ECEAF3`
- Shadow: `0 10px 30px rgba(19, 12, 29, 0.10)`
- Hero card can use brand gradient with white text.

### Playback Controls
- Primary play button fill: `#9C54D5`
- Play icon: `#FFFFFF`
- Skip/shuffle icons default: `#9B96AC`
- Active control state: `#462964`
- Live/equalizer highlight: `#5EE2F0`

### Slider / Progress
- Track base: `#DDD8EB`
- Progress fill: `#9C54D5`
- Scrub thumb (active): `#462964`
- Buffered/secondary signal: `#5EE2F0`

---

## 5) Layout and Visual Rhythm

- Use large soft surfaces with isolated color accents (like the reference).
- Keep one high-energy element per region:
  - either gradient,
  - or violet emphasis,
  - or cyan signal.
- Favor whitespace and rounded corners over extra decorative lines.

Spacing scale:
- `4, 8, 12, 16, 24, 32`

Radius scale:
- `10, 14, 18, 24`

---

## 6) Motion and State Language

### Press and Tap
- Duration: `140-180ms`
- Easing: `ease-out`
- Scale: `0.98` on press

### Selection Change
- Violet fade/slide duration: `180-220ms`
- No hard flash cuts

### Audio Activity
- Cyan pulse loop duration: `900-1200ms`
- Opacity oscillation only (avoid aggressive size jumps)

### Error/Warning
- Keep errors neutral and readable.
- Avoid red explosions against this palette.
- Use subtle shake + text guidance.

---

## 7) Logo and Icon Direction

Preferred mark:
- Vertical pulse bars motif (from your image direction).
- Base in `#462964`.
- Highlights in `#9C54D5` and `#5EE2F0`.

Icon background:
- Solid `#462964` or dark brand gradient.

Do not:
- Over-detail tiny icons with multi-stop micro-gradients.
- Use literal lightning symbols.

---

## 8) Accessibility Guardrails

- Maintain minimum contrast:
  - body text `>= 4.5:1`
  - large text/icons `>= 3:1`
- Do not place `#5EE2F0` text on white for long text.
- Prefer `#462964` or dark neutral for small labels.
- Use color plus shape/state for meaning (not color alone).

---

## 9) Implementation Tokens (TypeScript Example)

```ts
export const theme = {
  color: {
    support700: "#462964",
    dominant500: "#9C54D5",
    accent400: "#5EE2F0",
    bgCanvas: "#F8F8FB",
    bgSurface: "#FFFFFF",
    textPrimary: "#1B1B1F",
    textSecondary: "#5C5C70",
    borderSubtle: "#E7E7F1",
  },
  gradient: {
    brand: "linear-gradient(135deg, #462964 0%, #9C54D5 52%, #5EE2F0 100%)",
  },
  action: {
    primaryBg: "#462964",
    primaryHover: "#543378",
    primaryPressed: "#3A2254",
    primaryText: "#FFFFFF",
  },
  state: {
    selected: "#9C54D5",
    audioLive: "#5EE2F0",
    focusRing: "rgba(156, 84, 213, 0.42)",
  },
};
```

---

## 10) Quick UI Mapping (Use This First)

If you need fast defaults:
- Page background: `#F8F8FB`
- Main cards: `#FFFFFF`
- Primary CTA: `#462964`
- Active/selected state: `#9C54D5`
- Audio/live indicator: `#5EE2F0`
- Header hero area: brand gradient

Color balance target per screen:
- `70%` neutral surfaces
- `20%` support violet structure (`#462964` family)
- `8%` dominant violet emphasis (`#9C54D5` family)
- `2%` accent cyan signal (`#5EE2F0`)

---

## 11) Screen-by-Screen Direction (Second Pass)

### A) Home / Library Screen
Purpose:
- Calm browse space with clear hierarchy and low visual noise.

Style mapping:
- Top header zone: very soft gradient wash, low opacity overlay.
- Section titles and key chips: `#462964`.
- Active filter/tab chip: `#9C54D5` fill, white text.
- List rows/cards: white surface with subtle border.
- "Now playing" mini badge/dot only: `#5EE2F0`.

Avoid:
- Full-width saturated gradient behind scrollable content.
- Cyan used for non-audio actions.

### B) Player Screen (Primary Brand Moment)
Purpose:
- Most expressive screen, but still controlled.

Style mapping:
- Album hero region can carry the strongest gradient treatment.
- Main play button: `#9C54D5` (single hero emphasis).
- Secondary transport controls (skip, queue, repeat): `#462964` active, muted neutral inactive.
- Progress track fill: `#9C54D5`; live/equalizer reaction: `#5EE2F0`.
- Lyrics/timestamps should remain neutral for readability.

Avoid:
- Making every control violet and cyan at once.
- Bright cyan text on light backgrounds.

### C) Search Screen
Purpose:
- Functional, fast scanning.

Style mapping:
- Search field border/focus: support to dominant transition (`#462964` -> `#9C54D5`).
- Result highlight and selected row edge: `#9C54D5`.
- Audio preview indicators only: `#5EE2F0`.
- Keep artwork cards mostly neutral with one accent per row.

### D) Profile / Settings Screen
Purpose:
- Utility-first and trustworthy.

Style mapping:
- Prefer neutral surfaces + support text/actions.
- Toggle on-state: `#462964`; focus ring: dominant violet.
- Destructive controls use semantic warning colors, not theme cyan.
- Premium/upgrade card may use brand gradient to distinguish from standard settings rows.

---

## 12) Component State Matrix (Concrete Overrides)

### Buttons
- Primary default: bg `#462964`, text white.
- Primary hover: bg `#543378`.
- Primary pressed: bg `#3A2254`.
- Primary focused: keep bg, add dominant focus ring.
- Primary disabled: bg `#CFC8DC`, text `#FFFFFF`.

- Secondary default: light support tint + support border.
- Secondary hover: slightly stronger dominant tint.
- Secondary pressed: reduce opacity and border contrast.

### Tabs / Segmented Controls
- Default: neutral text.
- Hover: support text.
- Active: support text + dominant indicator.
- Active + now playing: tiny cyan dot only.

### Sliders / Progress Bars
- Base track: neutral.
- Progress: dominant violet.
- Thumb active drag: support violet.
- Live playback pulse/equalizer: cyan.

### Input Fields
- Border default: `#DAD5E8`.
- Hover border: `#B9AECB`.
- Focus border: `#462964`.
- Focus ring: `rgba(156, 84, 213, 0.28)`.
- Cursor/caret: `#462964`.

---

## 13) Controlled Swap Tests (What To Try)

Run these as A/B variants in design/dev and keep the winner:

### Swap Test 1: Primary CTA Ownership
- A: primary CTA in `#462964` (recommended baseline).
- B: primary CTA in `#9C54D5`.
- Success metric: readability + perceived premium feel + reduced visual fatigue.

### Swap Test 2: Player Hero Intensity
- A: full gradient hero background.
- B: white card with gradient only on artwork frame and play button glow.
- Success metric: content legibility and focus on transport controls.

### Swap Test 3: Active Tab Treatment
- A: dominant underline only.
- B: dominant pill background.
- Success metric: scan speed and clutter at small screen widths.

### Swap Test 4: Cyan Usage Discipline
- A: cyan only for audio/live states (recommended baseline).
- B: cyan also used for generic links/highlights.
- Success metric: semantic clarity and signal strength for "currently playing".

Decision rule:
- If a variant makes the UI feel busier without improving clarity, reject it.
- Keep no more than one "high-energy" visual treatment per region.