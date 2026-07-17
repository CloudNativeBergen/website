# Schedule editor — UX principles

The design north-star for the admin schedule editor (`src/components/admin/schedule/*`).
Change the editor freely, but treat the **principles** below as invariants: they
encode research and deliberate product decisions, and quietly regressing them is a
regression even when the code still compiles. Each principle notes _why_ and, where
relevant, the evidence.

## 1. The editor's job is to reveal where the open time is

Scheduling is a planning task: the organizer is looking for _free space_ to drop a
talk into. A flat list "shows commitments, not the free space around them" — so the
editor must always make **duration, breaks, and gaps visible**, and make open time a
**first-class, tappable target**, not an absence. This is why both the desktop grid
and the mobile time-rail render empty time explicitly.

## 2. Two surfaces, one engine

All scheduling logic lives in the pure, tested core (`src/lib/schedule/`:
`reducer`, `operations`, `rules`, `time`, `validation`). The desktop drag board and
the mobile view are **thin UIs over that engine** — they never re-implement overlap,
swap, or placement rules. Any placement a UI offers must be one the reducer accepts;
mirror `operations.moveProposal` (e.g. `fitsInTrack` / `canSwapTalks` /
`canPlaceDisplacedBack` + the end-of-day guard) rather than inventing a parallel check.

## 3. Desktop drags; mobile taps — deliberately

Below `md` (< 768px) the pixel-drag board is replaced by a tap-driven view
(`MobileScheduleView`). The two layouts are mutually exclusive so the DnD context and
touch sensors never mount on a phone. **Do not** try to make the fine-grained pixel
timeline finger-friendly — touch drag on a dense timeline is imprecise and hijacks
scrolling. Locked decision (2026-07).

## 4. The four core operations, and how each is reachable

Every common operation must have a clear, non-drag path on mobile:

| Operation                                | Model                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Add** (unassigned → slot)              | tap an open slot → drawer of _fitting_ talks → tap one; or Unassigned → pick up → tap a slot |
| **Move / adjust** (change time or track) | pick up a talk → tap an open slot (any track, after swiping)                                 |
| **Swap** two talks                       | pick up a talk → tap another talk                                                            |
| **Remove**                               | pick up → **Remove** (explicit; destructive actions are never a "drop")                      |

**Pick-up → drop is the unifying model**: drag is just "pick up, then drop", so on
touch it becomes two taps where **the drop target decides the operation** (empty slot
= move/add, occupied talk = swap). This maps 1:1 onto `moveProposal`, needs no engine
change, and — critically — restores **swap**, which the earlier sheet-based flow could
not express (its pickers only offered free slots).

## 5. Mode must be loud, and only valid targets are offered

"Placing mode" is a mode, and hidden modes are a classic usability failure. So it is
**always visible**: a sticky banner naming what's being placed, with Cancel/Remove
(and Rename/Duration for services) always in reach. While placing, the rail becomes a
target picker where **only legal targets are enabled** (validity computed from the
same rules the reducer uses) and invalid ones are dimmed — the UI never lets you
attempt a drop that would silently fail. Tapping the source cancels.

## 6. Convey duration and gaps without the pixel-timeline's costs

The mobile agenda is a **clamped, gap-collapsing time-rail**, not a uniform card list
and not a literal pixel timeline. Card height is proportional to duration but
`clamp(min, …, max)` — a floor (≥ touch target, ~56px) keeps a 5-minute break tappable,
a ceiling stops a 90-minute workshop from dominating the scroll. A **duration chip**
carries the exact length when heights hit the clamp. Breaks render as their own muted
segments; open time renders as dashed "assign here" slots; sub-10-minute gaps collapse
to a slim divider (too small to hold a talk). Models: Fantastical's DayTicker,
Mobiscroll's min-row-height.

## 7. Column switching must look and feel swipeable

With multiple tracks (columns) on one phone screen:

- **Peek the adjacent track** (~7vw each side via a scroll-snap carousel of
  `basis-[86vw]` panels). A peeking neighbour is the single strongest cue that the
  panel swipes _and_ that another column exists — swipe is otherwise invisible.
- **Fixed, all-visible tab strip** synced to the carousel: the active tab updates
  _live_ as you swipe past a track's midpoint (it should track the drag, not jump on
  release). Tabs are the accessible, non-swipe equivalent.
- `scroll-snap-stop: always` — one track per fling; a fast swipe can't skip a track.
- **Never auto-advance** columns.

## 8. Accessibility is not optional

- Every swipe has a tap/keyboard equivalent (the tab strip: `role=tab/tabpanel`,
  roving `tabindex`, arrow keys).
- Bottom sheets are real modals: focus moves in on open, **Tab is trapped** (both
  directions), focus is restored on close, and body scroll is locked.
- Touch targets ≥ 44px; visible `focus-visible` outlines; placing banner is a
  `role="status"`; rail buttons carry descriptive `aria-label`s.

## 9. Persistence is safe by construction

- Saves are conference-scoped and use optimistic concurrency (`ifRevisionId`); a
  stale write surfaces as a distinct conflict, never a silent last-write-wins.
- The client can't produce a payload the server rejects (shared rules); ghost slots
  (dangling talk refs) are stripped on load and on save so they can't brick a day.
- Every dirty day is persisted on save — never just the visible one.

---

_Evidence for the mobile decisions (peek/affordances, time-rail vs list, Trello-style
column swipe) comes from NN/g, Baymard, Material 3, Apple HIG, and teardowns of
Google/Apple Calendar, Fantastical, and Trello. See the redesign PRs for the cited
research briefs._
