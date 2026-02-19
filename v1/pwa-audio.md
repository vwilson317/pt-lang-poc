# Feature: Web TTS Sound Bites (PWA First)

## Objective
Enable **listening comprehension training** using browser-native Text-to-Speech (Web Speech API).

The system must:
- Work with only a Portuguese word string
- Require no backend
- Support subtle speed variation
- Function in a Web-first PWA
- Use FontAwesome icons
- Maintain a minimal, swipe-first UX

---

## Platform

Primary: Web (PWA)  
Technology: Web Speech API (`speechSynthesis`)

No Expo-native dependencies in this version.

---

## UX Model

### Audio Trigger
- User taps speaker icon to enable audio (required due to browser autoplay restrictions)
- After first interaction, autoplay may be attempted on future cards

### Controls (Gesture-Based)

| Gesture        | Action         |
|---------------|---------------|
| Tap           | Play at 1.0x  |
| Press & Hold  | Play at 0.75x |
| Double Tap    | Play at 1.25x |

No visible speed toggle.
No settings panel.
No persistent speed indicator.

---

## Speed Philosophy

Use only 3 playback speeds:

- 0.75x → Decode mode
- 1.0x → Baseline
- 1.25x → Challenge mode

Speed is contextual, not a global setting.

---

## Speed Indicator Behavior

Do NOT show a persistent speed label.

Instead:
- Show a temporary micro-indicator (e.g., “0.75x” or “1.25x”) for ~600ms
- Optionally animate icon briefly
- Revert to default speaker icon

---

## Learning Adaptation (Optional, Local Only)

Per word, stored in localStorage:

- If user marks "Don't Know":
  - Next appearance may auto-play at 0.75x once

- After 3 consecutive "Know":
  - Occasionally auto-play at 1.25x (e.g., 1 in 5)

No visible levels.
No streak UI.
Subtle adaptation only.

---

## Data Model

Minimum:

```json
{
  "id": "w001",
  "pt": "agora",
  "en": "now"
}