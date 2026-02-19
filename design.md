Here is your design doc written cleanly for a `.md` file.

---

# Portuguese Flash App – V1 Design Document

## Vision

Build a fast, engaging, swipe-based Portuguese vocabulary trainer optimized for:

* Pattern recognition
* Low cognitive friction
* Binary decision making
* Speed-based reinforcement
* Local-first development

V1 prioritizes **habit formation and engagement**, not spaced repetition or database complexity.

No backend.
No interval scheduling.
No results screen.

Everything runs locally using static data + AsyncStorage.

---

# Core Philosophy

* Every session shows the **entire deck**
* User must clear all cards
* Performance measured by:

  * Right count
  * Wrong count
  * Cards remaining
* Minor celebration on completion
* Immediate replay option

This is a **deck-clearing speed loop**, not a spaced repetition system.

---

# Tech Stack

* React Native (Expo managed workflow)
* TypeScript
* react-native-gesture-handler (swipes)
* react-native-reanimated (card animations)
* expo-av (audio playback)
* @react-native-async-storage/async-storage (local persistence)

---

# Data Model (Static Word Data)

Static words returned from a local “API module”.

```ts
type Word = {
  id: string;
  pt: string;              // required
  en?: string;             // optional but expected for most
  audioUrl?: string;       // optional
  pronHintEn?: string;     // optional
};
```

No database in v1.

---

# Session State Model

In-memory state only.

```ts
type SessionState = {
  queue: string[];
  correctSet: Set<string>;
  rightCount: number;
  wrongCount: number;
  deckCount: number;
  startedAt: number;
  cleared: boolean;
  currentCardId: string | null;
  uiState: 
    | "PROMPT"
    | "REVEAL_DONT_KNOW"
    | "CHOICES"
    | "FEEDBACK_CORRECT"
    | "FEEDBACK_WRONG";
};
```

---

# Header (HUD)

Displayed at all times.

Shows:

* ✅ Right
* ❌ Wrong
* 🃏 Remaining

Optional:

* ⏱ Timer (live)

Remaining is defined as:

```
deckCount - correctSet.size
```

No separate results screen.

---

# Card Interaction Flow

## State 1 – PROMPT

Displays:

* Portuguese word
* Audio icon (tap to play)

User can:

* Swipe left
* Swipe right

---

## Swipe Left – Don’t Know

Transition to:
REVEAL_DONT_KNOW

Effects:

* wrongCount++
* Requeue card
* Auto-play audio (if available)

Displays:

* Portuguese
* English translation
* Pronunciation hint (if available)

Auto-advance after ~900ms.

---

## Swipe Right – I Know It

Transition to:
CHOICES

Displays:

* Portuguese
* 3 English options (1 correct, 2 distractors)

No swiping allowed in this state.
User must tap an option.

---

## If Option Correct

Transition to:
FEEDBACK_CORRECT

Effects:

* rightCount++
* Add card to correctSet
* Remove all occurrences of card from queue

Displays:

* Correct option highlighted (green)

Auto-advance after ~450ms.

---

## If Option Wrong

Transition to:
FEEDBACK_WRONG

Effects:

* wrongCount++
* Requeue card

Displays:

* Wrong option highlighted (red)
* Correct answer shown

Auto-advance after ~900ms.

---

# Queue Rules

At session start:

* queue = shuffled array of all word IDs

When incorrect:

* Push ID to end of queue

When correct:

* Remove ID from queue entirely

Next card selection:

* Pop from queue until ID not in correctSet

---

# Session Cleared

When:

```
correctSet.size === deckCount
```

Then:

* Freeze timer
* Disable input
* Show small modal

Modal:

Title:
Mandou bem! / Nice!

Buttons:

* Rodar de novo / Run again
* Encerrar / Done

No results screen.

---

# AsyncStorage (Minimal Persistence)

Stored keys:

* bestClearMs
* runsCount

Optional future additions:

* lifetimeRight
* lifetimeWrong
* perWordStats

---

# V1 Non-Goals

* No SM-2
* No spaced repetition
* No interval tracking
* No backend
* No login
* No user accounts
* No progress graph

---

# V2 Roadmap (Future)

* Introduce SM-2 scheduling
* Per-word mastery tracking
* Sentence mode unlock (based on mastery threshold)
* Verb tracking for grammar unlock
* Reverse cards (English → Portuguese)
* Typing mode
* Audio-first mode

---

# UX Design Principles

* Swipe-based interaction
* Minimal UI
* Fast transitions
* No friction screens
* No unnecessary taps
* Micro celebrations only

---

# Success Criteria for V1

* User can complete full deck daily
* User feels motivated to “beat previous clear time”
* No cognitive overload
* No engineering complexity creep
* Habit established

---