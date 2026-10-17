# Session Feedback

Status: **ready for implementation**. This spec is where the wayfinder map
[Speaker feedback via session QR codes](https://github.com/CloudNativeBergen/website/issues/1415)
ends up. Every decision below was made on a closed map ticket. The spec
gathers them and links to the ticket that holds each one's reasoning; to change
a decision, reopen its ticket.

Two kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a correction made while writing this spec or during
  its review, usually because a decided rule couldn't be implemented as
  written.
- **Implementation detail:** an engineering choice no other part of the spec
  depends on.

## 1. What this delivers

Every **confirmed** talk gets a **Feedback Code**: a short code on the
conference's own domain, shown to its speakers as a QR code. Attendees scan
it and answer in one tap (green, yellow or red), optionally with a comment,
anonymously. Speakers see the result live from the end of their session.
Organizers see every session ranked on a new admin page, moderate comments,
and remove spam.

The physical green/yellow/red cards stay. Their counts (Card Counts, today's
`talk.audienceFeedback`) are added to the scanned responses everywhere.

### Out of scope

- Showing Session Feedback publicly (programme, speaker pages).
- Restricting feedback to verified ticket holders. Revisit only if abuse
  appears.
- Multi-question surveys or several scored dimensions.
- A conference-wide event survey that isn't tied to a session.
- **Not yet specified** (in scope for a later effort, not this one): breakdowns
  by track, format and day; comparison with previous editions; a dashboard
  widget; comment filters on the admin page (Flagged / All / Not for me /
  Hidden).

## 2. Vocabulary

These terms are added to `CONTEXT.md` in the same PR.

- **Session Feedback**: what attendees think of one speaker-led session, per
  talk, shared by all its speakers. It combines Feedback Responses and Card
  Counts.
- **Feedback Response**: one anonymous attendee's answer about a session: a
  Feedback Colour and an optional comment.
- **Feedback Colour**: green, yellow or red. On screen: **Loved it**, **It was
  OK**, **Not for me**.
- **Card Counts**: the physical-card totals an organizer enters.
- **Feedback Code**: the session's short code, unique within its conference.
- **Feedback Window**: from the start of the session's earliest slot until 24
  hours after its latest slot ends.

Never call any of this a **review**: in this app a review is an organizer's CFP
score (`sanity/schemaTypes/review.ts`). Avoid "rating" too.

## 3. Decision index

| Area                                   | Decided on                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope and standing decisions           | [Speaker feedback via session QR codes](https://github.com/CloudNativeBergen/website/issues/1415) (map Notes)                                                                                                                      |
| Sanity quota, limits, burst behaviour  | [Research: Sanity quota and storage cost of anonymous Feedback Responses](https://github.com/CloudNativeBergen/website/issues/1416) (`docs/research/speaker-feedback-sanity-quota.md` on `research/speaker-feedback-sanity-quota`) |
| Storage, one answer per device, guards | [Decide where Feedback Responses are stored and how repeat submissions are limited](https://github.com/CloudNativeBergen/website/issues/1417)                                                                                      |
| Feedback Code                          | [Decide the Feedback Code URL and what it reveals](https://github.com/CloudNativeBergen/website/issues/1418)                                                                                                                       |
| Feedback Window                        | [Decide how the feedback window is computed from the schedule](https://github.com/CloudNativeBergen/website/issues/1419)                                                                                                           |
| Attendee page                          | [Prototype the attendee Feedback Response form](https://github.com/CloudNativeBergen/website/issues/1420) (branch `prototype/speaker-feedback-attendee-form`)                                                                      |
| Speaker view                           | [Prototype the speaker's Feedback Code and Session Feedback view](https://github.com/CloudNativeBergen/website/issues/1421) (branch `prototype/speaker-feedback-speaker-view`)                                                     |
| Admin page and talk panel              | [Prototype the admin Session Feedback page](https://github.com/CloudNativeBergen/website/issues/1422) (branch `prototype/speaker-feedback-admin`)                                                                                  |
| Notifications                          | [Decide whether and how speakers are notified of their Session Feedback](https://github.com/CloudNativeBergen/website/issues/1423)                                                                                                 |
| Privacy, retention, erasure            | [Decide privacy, retention and erasure for Session Feedback](https://github.com/CloudNativeBergen/website/issues/1424)                                                                                                             |
| Refinements and slicing                | [Write the speaker feedback spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1425)                                                                                                             |

## 4. Data model

### 4.1 `feedbackResponse` (new document type)

One document per Feedback Response
([#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

| Field         | Type                           | Notes                                                                        |
| ------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| `_id`         | string                         | Deterministic, §7.3. Never chosen by the client.                             |
| `talk`        | reference → `talk`             | Required.                                                                    |
| `conference`  | reference → `conference`       | Required; the talk's conference. Every read is scoped by it.                 |
| `colour`      | `'green' \| 'yellow' \| 'red'` | Required.                                                                    |
| `comment`     | string, ≤ 1,000 characters     | Optional. Trimmed; an empty comment is stored as absent.                     |
| `submittedAt` | datetime                       | Server time of the latest submission from this device.                       |
| `flaggedAt`   | datetime                       | Set when a speaker flags the comment; cleared by Keep, Hide or Remove (§10). |
| `hiddenAt`    | datetime                       | Set when an organizer hides the comment; cleared by Unhide.                  |

No IP address, user agent, device token or anything else that identifies the
attendee is stored
([#1424](https://github.com/CloudNativeBergen/website/issues/1424)).

The Studio shows the type read-only to organizers; it is written only by the
server.

### 4.2 Additive `talk` fields

`talk` is not one of the append-only `conference`/`organization` types, but
every change here is additive anyway.

| Field                   | Type                                                   | Notes                                                                                                 |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `feedbackCode`          | string                                                 | §5. Read-only in Studio.                                                                              |
| `feedbackFolded`        | object `{greenCount, yellowCount, redCount, foldedAt}` | Scanned totals kept after the retention fold (§12.2) or an erasure fold (§12.3). Read-only in Studio. |
| `feedbackSummarySentAt` | datetime                                               | Set once when the summary notification goes out (§11.1).                                              |

`audienceFeedback` (Card Counts) is unchanged.

### 4.3 Totals

The **scanned** count for a colour is the number of live `feedbackResponse`
documents of that colour plus `feedbackFolded.<colour>Count` (0 if absent). The
**combined** count adds `audienceFeedback.<colour>Count`. Every speaker and
admin surface shows combined counts with a scanned-vs-cards breakdown
([#1421](https://github.com/CloudNativeBergen/website/issues/1421)). Hidden
comments still count (§10.3).

One function computes this for every surface (speaker section, dashboard chip,
admin table, talk panel, summary notification); no surface sums by itself.

## 5. Feedback Code

Decided on [#1418](https://github.com/CloudNativeBergen/website/issues/1418).

- **Shape:** 6 characters from `SHORT_CODE_ALPHABET` with `drawShortCode`
  (`src/lib/marketing/short-code.ts`). Unique **within the conference**: the
  minter is seeded with the conference's existing `feedbackCode` values
  (`createShortCodeMinter`). Codes are normalized with `normalizeShortCode`
  before lookup.
- **Minted when first needed:** the first time a speaker of a **confirmed** talk
  opens the speaker section (§9), if the talk has none and the conference has
  not ended (`isConferenceOver`). A talk of an edition that ended before launch
  never gets one ([#1421](https://github.com/CloudNativeBergen/website/issues/1421)).
  The write is `setIfMissing`, so two concurrent first views keep the first
  code. _Refinement (spec):_ a collision with another talk's code between the
  read of existing codes and the write is caught by the uniqueness check in the
  same mutation path (re-read after write; on a clash, mint again).
- **URL:** `https://<conference primary domain>/f/<code>`. The code resolves
  only within the conference that serves the requesting host.
- **Rotation:** organizers only, from the talk's admin panel (§10.4). The old
  code stops resolving at once; responses are kept.
- **Studio Duplicate:** `talk` is added to `SHORT_CODE_TYPES` in
  `sanity/actions/shortCodeSafeActions.ts`, so Duplicate never copies a
  `feedbackCode`. Asserted against the real exported Studio config, not the
  helper alone.
- **Lookup caching:** the code → talk lookup is a cached, conference-scoped read
  tagged per conference and invalidated on mint and on rotation, so a rotated
  code dies on the next request. _Refinement (spec):_ "stops working at once"
  needs the tag invalidation; a time-based cache alone would keep a rotated
  code alive.

## 6. Feedback Window

Decided on [#1419](https://github.com/CloudNativeBergen/website/issues/1419).

- **Source:** the current `schedule` documents. A talk's slots are every
  `tracks[].talks[]` entry whose `talk._ref` is the talk, across all schedule
  days of the conference. Placeholder slots never carry a code.
- **Window:** from the start of the earliest slot until 24 hours after the end
  of the latest slot, as one continuous span even across days. Each slot instant
  is `osloLocalInputToIso(\`${date}T${HH:mm}\`)` (`src/lib/time.ts`), which is
  DST-correct.
- **No slot:** no window. The page says feedback opens when the session starts.
- **Moves follow automatically:** the code belongs to the talk, not a slot. A
  talk removed from the schedule closes.
- **Speaker visibility:** speakers see feedback once the latest slot has ended
  **or** `isConferenceOver(conference)` is true. Nothing is stored.
- **No organizer override.**
- **New helper (Implementation detail):** no existing helper returns all of a
  talk's slots (`SCHEDULE_INFO_PROJECTION` and `confirmedSessionsForSpeaker`
  return only the first). Add one pure function
  `feedbackWindow(slots, now) → { state: 'unscheduled' | 'before' | 'open' |
'closed', opensAt?, closesAt?, lastSlotEnd?, feedbackVisible }` fed by a
  scoped query for the talk's slots, and use it for the page, the speaker
  section, the admin panel and the summary cron.

## 7. The attendee page, `/f/<code>`

Decided on [#1420](https://github.com/CloudNativeBergen/website/issues/1420),
[#1417](https://github.com/CloudNativeBergen/website/issues/1417) and
[#1418](https://github.com/CloudNativeBergen/website/issues/1418).

### 7.1 Route and chrome

- `src/app/(public)/f/[code]/page.tsx`. `(public)` is the chrome-less group (no
  navigation, footer or cookie banner); it only applies `TenantThemeStyle`.
- Conference from `getConferenceForCurrentDomain()`; a host with no conference
  is a 404.
- **English only. Minimal page:** the conference logo at the top
  (`ConferenceLogo` with `pickConferenceLogoProps()`), dark mode supported.
- `noindex`.

### 7.2 States

| State            | Shown when                                                                               | Content                                                                                                                                                                                                                                                                  |
| ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Open**         | window open                                                                              | Talk title and speakers (if public), "How was this session?", three full-width buttons: **Loved it** (green, smiling face), **It was OK** (yellow, minus circle), **Not for me** (red, frowning face). Footer: "Anonymous. You can change your answer until <closesAt>." |
| **Answered**     | open, and this device has a response                                                     | "Thanks! You answered <label>", **Change answer**, the comment box ("Comment for the speaker (optional)", 1,000-character counter, **Send comment** / **Update comment**), **Delete my answer**, a link back to the programme.                                           |
| **Not yet open** | `before` or `unscheduled`                                                                | "Feedback opens when the session starts". The start time is added only when the talk is public.                                                                                                                                                                          |
| **Closed**       | `closed`                                                                                 | "Feedback for this session has closed", explaining that feedback closes 24 hours after a session ends.                                                                                                                                                                   |
| **Unknown**      | the code doesn't resolve in this conference, or was rotated, or the talk isn't confirmed | One generic page ("This feedback code isn't valid…") that reveals nothing.                                                                                                                                                                                               |

"Public" means the talk is on the conference's public programme. The title and
speakers never appear otherwise, so an early-shared code can't reveal an
unannounced acceptance.

Colour is never the only signal: every button has an icon and words.

### 7.3 Device token and deterministic id

- **Cookie:** `feedback_device`, a random 128-bit token plus an HMAC over it,
  signed with a server secret. httpOnly, `Secure` outside development,
  `SameSite=Lax`, **`Path=/f`**, no `Domain` (host-only), **30 days**.
  _Refinement (spec):_ the `hostCookie()` helper's `__Host-` prefix requires
  `Path=/`, which contradicts the decided `/f` scope, so this cookie does not
  use the prefix; it is still host-only because no `Domain` is set.
- **Signing (Implementation detail):** follow the module-private `sign()`
  pattern of `src/lib/volunteer/token.ts` with a label of its own; a new env
  secret or a labelled derivation of an existing one, documented in
  `docs/TENANT_SECRETS.md` if new.
- The server mints the token on the first submit if the request carries no
  valid one. A token that fails verification is replaced, never trusted.
- **Response id:** `feedbackResponse.` + hex SHA-256 of
  `<token>:<talk _id>`, truncated to 32 hex characters. The same device and talk
  always map to the same document.
- A device that clears its cookies produces a new response. That noise is
  accepted ([#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

### 7.4 Submit, change, comment, delete

Public tRPC procedures (`publicProcedure`, conference from
`resolveConferenceId()`, never from the client), following `volunteer.create`:

- `feedback.submit({ code, colour, comment? })`: sets colour and comment.
  "Change answer" and "Send comment" are the same call with the current colour
  or the new one. Written with `createOrReplace` on the deterministic id;
  concurrent resubmissions from one device are last-write-wins.
- `feedback.mine({ code })`: this device's response for the talk, read by id
  through the doc endpoint (`getDocument`), never by GROQ, so a reload right
  after a submit sees it.
- `feedback.deleteMine({ code })`: deletes this device's response while the
  window is open ([#1424](https://github.com/CloudNativeBergen/website/issues/1424)).

**Refused before any write or talk-specific read** (guard before fetch), in this
order:

1. The code must resolve to a **confirmed** talk of the current conference.
2. The window must be open.
3. `submit` only: exactly one valid colour; comment ≤ 1,000 characters after
   trimming.
4. The device token must be one the server minted (`deleteMine`, `mine`: a
   missing or invalid token means "no response", never an error that differs
   by talk).

Refusals 1 and 2 return the same responses the page states use; a code from
another tenant is indistinguishable from an unknown code.

**Hidden or flagged state survives a resubmit.** _Refinement (spec):_ a plain
`createOrReplace` would let an attendee wipe `hiddenAt`/`flaggedAt` by
resubmitting. The write therefore preserves both fields from the existing
document (read by id, then replace with a revision guard; on a conflict, retry
once). Both survive an edited comment too: otherwise an attendee whose comment
was hidden could reword it to bring it back.

**No IP rate limit** of any kind
([#1417](https://github.com/CloudNativeBergen/website/issues/1417)): a shared
venue IP behind one bucket would refuse most legitimate keynote feedback. Abuse
is held back by the per-device id, the window, and organizers removing
responses.

**Cost per submit:** the talk and window come from cached reads, so a burst
costs one write per response (plus the by-id read for the revision guard).

## 8. Privacy copy

A new **Session Feedback** section on `/privacy`
([#1424](https://github.com/CloudNativeBergen/website/issues/1424)), shipped
with the first slice that collects anything:

- **What:** a colour and an optional comment about a session, given anonymously
  by scanning its QR code. No name, email or IP address is collected.
- **Cookie:** a 30-day, strictly necessary device-token cookie, used only on
  `/f` pages, so you can change or delete your own answer and so answers aren't
  counted twice. No consent prompt.
- **Who sees it:** the session's speakers see totals and comments; organizers
  see everything and can hide or remove comments.
- **Purpose and legal basis:** helping speakers and organizers improve
  sessions; legitimate interest.
- **Retention:** 24 months after the conference ends; then comments and
  individual answers are deleted and only per-session totals remain.
- **Your rights:** delete your answer yourself while feedback is open. After
  that, answers can't be linked to you; contact the organizers quoting the
  comment.
- **Processors:** Sanity (storage) and Resend (speaker summary emails), both
  already in `src/lib/legal/subprocessors.ts`. No new subprocessor.

## 9. The speaker view

Decided on [#1421](https://github.com/CloudNativeBergen/website/issues/1421).

### 9.1 Placement

A full-width **Session Feedback** section at the top of
`/cfp/proposal/[id]`, above the proposal form, for **confirmed talks only**
(accepted-but-unconfirmed, draft, submitted, rejected and withdrawn show
nothing). It renders on a phone too; the current sidebar is
`hidden lg:block`, which is why it is not in the sidebar.

Two tabs: **Session Feedback** and **Feedback Code**. It opens on the code
until feedback is visible (§6), then on the results.

### 9.2 Feedback Code tab

- The QR code for the URL (§5), rendered with the `qrcode` package already in
  use (`SpeakerShare.tsx`).
- Its state from `feedbackWindow`: "Opens once your session is scheduled",
  "Opens when your session starts (<slot>)", "Open until <closesAt>", "Closed".
- "Put this on your last slide or print the sheet for the room. Attendees scan
  it and answer in one tap; it's anonymous." and the URL.
- Buttons: **PNG for slides**, **SVG**, **Print sheet** (A4: large QR, talk
  title, the short URL without scheme, "How was this session?"), **Copy link**.
- **Present:** the QR full screen with the short URL and "How was this
  session?", ready for a projector.

### 9.3 Session Feedback tab

Shown once feedback is visible (§6); before that, "Your feedback appears here
when your session ends (<slot>)." (or "…once it is on the schedule").

- A stacked colour bar; combined totals (§4.3) under **Loved it / It was OK /
  Not for me**; "<n> responses · <m> comments"; a **Scanned vs cards** toggle.
- A **Live** badge while the window is open; the data refreshes every 30
  seconds through `useIdlePolling` (stops when idle or in a background tab).
- Comments oldest first, each with its colour and time, excluding hidden ones,
  each with a **flag** button (§10.3).

### 9.4 Dashboard chip

On a confirmed talk's row in `/cfp/list` (`CompactProposalList`): "Feedback
Code" until feedback is visible, then "<n>% loved it · <total>". It links to
the section.

### 9.5 What is replaced

`PostConferenceAudienceFeedbackPanel` and the card-count display in
`CompactProposalList`. Talks of an edition that ended before launch (the 29
talks with 2025 Card Counts) show the section **results only**: no code tab,
no code ever minted.

## 10. Admin

Decided on [#1422](https://github.com/CloudNativeBergen/website/issues/1422).

### 10.1 `/admin/feedback`

- `AdminPageHeader` with stat cards: **Responses**, **Loved it** (%),
  **Comments**, **Flagged**.
- A red **flagged by speakers** box listing every flagged comment with the talk
  title and **Keep**, **Hide**, **Remove**.
- One sortable table: session (title, speakers, format, slot, a flag icon if
  any comment is flagged), a colour bar, **Loved it %**, **Responses** (card
  count shown separately), **Comments**. A row expands to that talk's comments
  with the same actions.
- **Ranking:** default sort by the share of "Loved it". Sessions with fewer
  than **10** combined responses show "too few" and sort after the rest. The
  minimum is fixed.
- **Navigation:** a **Session Feedback** entry next to Speakers and Proposals in
  `ADMIN_NAV_SECTIONS` (`src/lib/admin/registry.ts`), with a badge for the
  flagged count. _Refinement (spec):_ nav entries have no badge support today
  (`NavigationItem` is `{name, href, icon}`); the badge needs an optional count
  on the entry, fed by one cheap count query.
- No dashboard widget.

### 10.2 The talk's admin panel

On `/admin/proposals/[id]`, in place of `AudienceFeedbackPanel`:

- Totals per colour, each split into scanned and **card counts editable
  inline**; saving still goes through `proposal.updateAudienceFeedback`.
- **Responses over time:** a bar chart in 10-minute buckets across the window.
  Selecting a range offers **Remove these <n>**.
- **Rotate Feedback Code** (§10.4).
- The comment list with **Hide/Unhide**, **Keep** (on flagged comments) and
  **Remove**.

### 10.3 Hide, Keep, Remove

- **Hide** sets `hiddenAt` and clears `flaggedAt`. The comment disappears from
  every speaker's view; organizers still see it; the colour still counts.
  **Unhide** clears `hiddenAt`.
- **Keep** clears `flaggedAt`; the comment stays visible.
- **Remove** deletes the whole `feedbackResponse` document, colour and comment,
  after a confirmation naming the count ("Remove 38 responses?"). No undo, no
  log. Bulk remove is a single transaction over the selected ids.
- A speaker's **flag** sets `flaggedAt` (one-way for speakers; it can't be
  withdrawn). Every speaker of the talk sees "Flagged for organizers" until an
  organizer acts.

All admin mutations are `adminProcedure`s that check every response id belongs
to a talk of the current conference before writing.

### 10.4 Rotating the code

Confirmation: "/f/<code> stops working now. Printed sheets and slides showing
it will reach a dead page. Existing responses are kept." Rotation mints a new
code (§5) and invalidates the lookup cache.

## 11. Notifications

Decided on [#1423](https://github.com/CloudNativeBergen/website/issues/1423).

### 11.1 Summary when the window closes

- A **daily cron** finds confirmed talks whose window closed since its last
  run, with at least one response and no `feedbackSummarySentAt`.
  _Implementation detail:_ a step in the existing daily
  `cleanup-notifications` cron (04:00) or a new route in `vercel.json`; either
  way it is idempotent.
- Each speaker of the talk gets **one bell notification and one email**: totals
  per colour (Card Counts so far plus scanned), response and comment counts, and
  a link to `/cfp/proposal/<id>` opening the Session Feedback tab.
- New `NotificationType` `session_feedback_summary`, via
  `createNotificationsOnce`. The email is separate from the hub: a template in
  `src/components/email/` sent through Resend (`src/lib/email/`), like other
  speaker mail.
- Then `feedbackSummarySentAt` is set, so it is sent once.
- Not sent: zero responses; a second summary after Card Counts change; past
  editions; anything real-time.

### 11.2 A flag notifies organizers

The speaker flag mutation emits a bell notification inline to the conference's
organizers (`getOrganizerSpeakerIdsForOrg`), excluding the flagging speaker,
linking to `/admin/feedback`. New `NotificationType`
`session_feedback_flagged`. Never-fail: a notification failure doesn't fail the
flag. Speakers aren't told how a flag was resolved.

## 12. Retention and erasure

Decided on [#1424](https://github.com/CloudNativeBergen/website/issues/1424).

### 12.1 Attendee erasure

`feedback.deleteMine` while the window is open (§7.4). Afterwards, organizers
remove a quoted comment with **Remove** (§10.3).

### 12.2 The 24-month fold

- A daily cron step finds talks whose conference ended more than 24 months ago
  and that still have `feedbackResponse` documents.
- For each talk, in one transaction: add each colour's live response count to
  `feedbackFolded` (creating it if absent, setting `foldedAt`), then delete
  every response of the talk.
- **Fold before delete, and idempotent:** the counts added and the documents
  deleted are the same set, read in the same pass, with a revision guard on the
  talk; a re-run over a folded talk with no responses does nothing.
- After the fold, every surface reads `feedbackFolded` through the one totals
  function (§4.3).

### 12.3 Speaker erasure

`eraseSpeakerInPlace` (`src/lib/speaker/erasure.ts`) gains a branch following
the module's existing pattern (an input gather, a field on `ErasureInputs`, a
pure plan step pushed in `buildErasurePlan`):

- Talks where the erased speaker is the **only** entry in `speakers[]` are
  folded early, exactly as §12.2.
- **Co-spoken** talks keep their feedback (the module's rule: never destroy
  data belonging to someone who requested nothing). An organizer removes any
  comment naming the erased person by hand.
- The fold must keep the module's fixed-point property: a second run plans
  nothing.

## 13. Slices

Every slice is filed as an issue labelled `speaker-feedback`, under a parent
implementation issue, with the dependencies below as native blocking edges.
Every UI slice ships its Storybook stories and is visually checked with
`pnpm shoot` at phone width (and desktop for admin), light and dark, per
`AGENTS.md`.

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | After  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1  | **Tracer bullet: scan and tap.** `feedbackResponse` type and `talk.feedbackCode` (§4); minting, uniqueness, lookup cache and Duplicate guard (§5); `feedbackWindow` and the slot query (§6); `/f/<code>` with every state and the one-tap colour submit, the device cookie and deterministic id, all guards (§7, without the comment box and delete); the `/privacy` section (§8); a minimal Feedback Code tab on the speaker page (QR, state, Copy link) so a speaker can get the code. | —      |
| F2  | **Comment, change, delete:** the Answered state (§7.2), Send/Update comment, Change answer, Delete my answer, and preserving moderation state across resubmits (§7.4).                                                                                                                                                                                                                                                                                                                   | F1     |
| F3  | **Speaker results:** the one totals function (§4.3); the Session Feedback tab with live polling and comments (§9.3, without the flag button); the dashboard chip (§9.4); replacing the old panel and card display, past editions results-only (§9.5).                                                                                                                                                                                                                                    | F1     |
| F4  | **Code downloads and Present:** PNG, SVG, Print sheet, Present (§9.2).                                                                                                                                                                                                                                                                                                                                                                                                                   | F1     |
| F5  | **Admin page:** `/admin/feedback` with stats, the ranked table, expanding rows, Hide/Unhide/Remove (§10.1, §10.3), and the nav entry (without the badge).                                                                                                                                                                                                                                                                                                                                | F3     |
| F6  | **Talk admin panel:** totals with inline Card Counts replacing `AudienceFeedbackPanel`, the responses-over-time chart with bulk Remove, Rotate Feedback Code (§10.2, §10.4).                                                                                                                                                                                                                                                                                                             | F5     |
| F7  | **Flags:** the speaker flag button and marker (§9.3, §10.3), the flagged box with Keep (§10.1), the nav badge (§10.1), the organizer notification (§11.2).                                                                                                                                                                                                                                                                                                                               | F2, F5 |
| F8  | **Summary notification:** the cron step, bell and email (§11.1).                                                                                                                                                                                                                                                                                                                                                                                                                         | F3     |
| F9  | **Retention fold and speaker erasure** (§12.2, §12.3).                                                                                                                                                                                                                                                                                                                                                                                                                                   | F3, F5 |

### 13.1 Tickets

Filled in when the slices are filed.

## 14. Verification

Per `AGENTS.md` ("Agent discipline"):

- **Guards are sabotage-proven:** for each refusal in §7.4 and each admin
  scope check in §10.3, remove the guard, show the specific test fails on a
  value (the write happening), restore.
- **Guard before fetch:** a test asserts no talk-specific read or write runs for
  a code of another tenant, and that the refusal is identical to an unknown
  code.
- **Executed GROQ, not mocks,** for the slot query, the code lookup, the totals
  and the fold.
- **Deterministic ids:** the same token and talk give the same id; a different
  token or talk gives a different one; a forged token is replaced.
- **Fixed point:** the fold and the erasure branch, run twice, commit nothing
  the second time.
- **Studio Duplicate:** asserted on the real exported Studio config.
- **Visual:** every new or changed component has a story; captures at phone
  width, light and dark, with the dark-mode mechanism of the story file checked
  (`AGENTS.md`).

## 15. Known gaps and risks

- **Concurrent writes are inferred, not tested:** last-write-wins under
  `createOrReplace` from one device, and the revision-guarded preserve in §7.4.
  Prove both in F1/F2 with a real-client test, not a mock.
- **Plan overage:** whether the Growth Non-Profit plan bills overage or
  hard-caps was not verified; the estimate is 10k–30k live requests per edition
  against ~130k monthly headroom.
- **Document count:** 200–3,000 responses per edition against a 25k or 50k
  limit (Sanity's pages disagree; 7,161 used on 2026-10-17). The 24-month fold
  bounds it.
- **A domain change mid-edition** breaks printed codes; a reprint fixes it.
- **A cleared cookie** produces a second response from the same person.
- **No IP limit:** a determined scripted flood is only remedied after the fact
  (Remove, bulk by time range). Revisit with proof of attendance if abuse
  appears.
