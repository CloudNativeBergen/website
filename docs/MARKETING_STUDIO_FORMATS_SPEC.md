# Studio cards sized for social posting

Decided in a design interview on 2026-09-30 (issue #1168) and checked against the code before writing.
Follows [`MARKETING_ASSETS_SPEC.md`](./MARKETING_ASSETS_SPEC.md) §7, which scheduled it, and amends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) where a render Task meets a Channel (§4).

## 1. What changes

The studio's cards have the shapes they happened to be built in — speaker cards square, sponsor
cards 16:9, the promo 2:1 — captured at four times their CSS size, so a speaker card is 1024 px and
under the gallery's 1080 px warning. LinkedIn shows 1.91:1 in the feed and crops a square to it on
desktop; Bluesky keeps any shape. Cropping a square card to 1.91:1 cuts off the name or the logo.

A card gains a **Format**: a shape and a pixel size, nothing more. Every template in scope is laid out
for every Format at that Format's full pixels, and a render Task asks for one.

Not in this work, each a decision:

- **The meme generator and video stay square.** Canvas, timeline, export and poster are built on one
  1080 square constant; a non-square canvas is its own effort with its own spec, not a layout variant.
  The video spec deferred the shape question here; the answer is "not yet".
- **The photo collage** keeps its shape.
- **No per-card Format**: the Format is chosen once per studio tab.

## 2. Formats

A fixed set of three:

| Format    | Shape  | Pixels    | Where it is native                           |
| --------- | ------ | --------- | -------------------------------------------- |
| square    | 1:1    | 1080×1080 | Bluesky; LinkedIn on mobile                  |
| landscape | 1.91:1 | 1200×628  | LinkedIn feed and link cards                 |
| portrait  | 4:5    | 1080×1350 | LinkedIn mobile feed at full height; Bluesky |

Every size clears the 1080 px short-side warning, stays under Bluesky's 2000 px and, as a JPEG, well
under its 1 MB. A card is captured at exactly its Format's pixels, never at a scale of its CSS size.

## 3. Templates and layouts

Speaker cards and sponsor thank-you cards first, in all three Formats; the conference promo second,
in the same three.

**One composition per template with a reflow rule: every element survives in every Format; only its
place and size change. Nothing is dropped.** A dropped QR silently changes what a post drives to; the
cards exist to be recognisable across platforms. The brand pattern fills every Format.

- **Speaker card.** Square is today's layout at 1080. Landscape puts the photo left at full height
  and stacks header, name, talk title and event name on the right, QR in the lower right. Portrait
  keeps the square's stack and spends the extra height on the talk title at a larger size, QR below.
- **Sponsor card.** Square stacks tagline, logo, tier, event line, QR. Landscape is today's 16:9
  layout widened to 1.91:1, logo left, text right. Portrait stacks with the logo given the middle
  third.
- **Conference promo** (second slice): the same rule; its layout is decided when that slice is built.

Every template has a Storybook story per Format, and the capture is checked against the story: the
shot succeeding is not the same as the shot being of the right thing.

## 4. Choosing a Format

- **In the studio**: one **Format switch** per tab (Square, Landscape, Portrait) above the card grid,
  changing every card on the tab. Download and "Save to gallery" capture the Format shown. A gallery
  entry saved from the studio **records its Format**.
- **On a render Task**: the Task carries a Format. It **defaults from the Channel** — LinkedIn →
  landscape, Bluesky → square, a manual or unset Channel → square — and the organizer may override it
  on the Task before rendering. The studio opens on the Task's Format with the switch preset.

## 5. One render per Format

A Task keeps one asset. So a render Task produces one Format, and there is **one render Task per
Format needed**: Recipe expansion and the Triggers create a publishing Recipe's render Prerequisite
once per distinct Format among its dependent publishing Tasks. Two Channels wanting square share one
render; LinkedIn and Bluesky at their defaults get two. A publishing Task's Format is **derived from
its Channel**, never stored. The Task model, the gallery's replace-on-re-render rule and the erasure
walk are untouched.

Rejected: a multi-asset Task (reopens three finished specs for one Task row), and letting the other
Channel crop (what this spec exists to stop).

## 6. The gallery and the picker

- The post editor's picker ranks entries whose Format matches the post's Channel first. A mismatch
  **warns**, naming the crop the platform will apply, and never refuses: the organizer may want it.
- Everything without a Format reads as **square** — render Tasks, Recipes and gallery entries alike —
  with no migration: square is what every existing render is. The field is append-only on the Task
  and Recipe shapes.
- An uploaded gallery image has no Format; the picker ranks it by the shape of its width and height.

## 7. Slices

1. **Formats and card layouts** — the three Formats as one constant; speaker and sponsor cards laid out
   per Format and captured at the Format's pixels; the Format switch per tab; Download and Save to
   gallery capturing the Format shown; the gallery entry's Format; a story per template and Format.
2. **Render Tasks per Format** — the Task's Format, its Channel default and override in the Task
   editor, the studio opening preset, Recipe expansion and the Triggers per distinct Format,
   copy-to-new-edition carrying it. Needs 1.
3. **Picker ranking and the mismatch warning** — uploads ranked by shape. Needs 1; independent of 2.
4. **The conference promo** in three Formats. Needs 1.
