# Session Feedback

Status: **ready for implementation**. This spec is where the wayfinder map
[Speaker feedback via session QR codes](https://github.com/CloudNativeBergen/website/issues/1415)
ends up. Every decision below was made on a closed map ticket. The spec
gathers them and links to the ticket that holds each one's reasoning; to change
a decision, reopen its ticket.

Three kinds of statement aren't map decisions, and each is marked where it
appears:

- **Refinement (spec):** a correction made while writing this spec or during
  its review, usually because a decided rule couldn't be implemented as
  written.
- **Decided in review:** a decision the user took while this spec was being
  reviewed (§16).
- **Implementation detail:** an engineering choice that changes nothing an
  attendee, speaker or organizer can observe. Named helpers, field names,
  procedure names and file locations in this spec are implementation details
  unless marked otherwise; an implementer may pick better ones.

## 1. What this delivers

Every **confirmed** talk gets a **Feedback Code**: a short code on the
conference's own domain, shown to its speakers as a QR code. Attendees scan it
and answer in one tap (green, yellow or red), optionally with a comment,
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
- **Later, not this effort:** breakdowns by track, format and day; comparison
  with previous editions; a dashboard widget; comment filters on the admin page
  (Flagged / All / Not for me / Hidden).

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
| Refinements, review decisions, slicing | [Write the speaker feedback spec and implementation tickets](https://github.com/CloudNativeBergen/website/issues/1425)                                                                                                             |

## 4. Data model

### 4.1 `feedbackResponse` (new document type)

One document per Feedback Response
([#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

| Field         | Type                           | Notes                                                                  |
| ------------- | ------------------------------ | ---------------------------------------------------------------------- |
| `_id`         | string                         | Deterministic, §7.3. Never chosen by the client.                       |
| `talk`        | reference → `talk`             | Required.                                                              |
| `conference`  | reference → `conference`       | Required; the talk's conference. Every read is scoped by it.           |
| `colour`      | `'green' \| 'yellow' \| 'red'` | Required.                                                              |
| `comment`     | string, ≤ 1,000 characters     | Optional.                                                              |
| `submittedAt` | datetime                       | Server time of the latest submission from this device.                 |
| `flaggedAt`   | datetime                       | Set when a speaker flags the comment; cleared by Keep or Hide (§10.3). |
| `hiddenAt`    | datetime                       | Set when an organizer hides the comment; cleared by Unhide.            |

No IP address, user agent, device token or anything else that identifies the
attendee is stored
([#1424](https://github.com/CloudNativeBergen/website/issues/1424)).

_Implementation detail:_ comments are trimmed and an empty one is stored as
absent; the type is read-only in Studio and written only by the server.

**Deleting a proposal** deletes its responses. _Refinement (spec):_ a
reference from `feedbackResponse` would otherwise block `deleteProposal`
(`BLOCKING_TYPE_DESCRIPTIONS`, `src/lib/proposal/data/sanity.ts`).
`feedbackResponse` joins `NON_BLOCKING_TYPES` and is cascade-deleted in chunks
of `PROPOSAL_DELETE_CHUNK_SIZE`, like the proposal's conversation.

### 4.2 Additive `talk` fields

`talk` is not one of the append-only `conference`/`organization` types, but
every change here is additive anyway.

| Field                   | Type                                                   | Notes                                            |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `feedbackCode`          | string                                                 | §5. Read-only in Studio.                         |
| `feedbackFolded`        | object `{greenCount, yellowCount, redCount, foldedAt}` | Scanned totals kept after a fold (§12.2, §12.3). |
| `feedbackSummarySentAt` | datetime                                               | Claimed before the summary goes out (§11.1).     |

`audienceFeedback` (Card Counts) is unchanged.

### 4.3 Totals

The **scanned** count for a colour is the number of live `feedbackResponse`
documents of that colour plus `feedbackFolded.<colour>Count` (0 if absent). The
**combined** count adds `audienceFeedback.<colour>Count`. Every speaker and
admin surface shows combined counts with a scanned-vs-cards breakdown
([#1421](https://github.com/CloudNativeBergen/website/issues/1421)). Hidden
comments still count (§10.3).

_Implementation detail:_ one function computes totals for every surface
(speaker section, dashboard chip, admin table, talk panel, summary), so they
can't disagree.

### 4.4 Published documents only

_Refinement (spec):_ the Sanity clients use an API version that returns
`drafts.*` documents, and schedules have a `status` (`draft | official |
archived`) with drafts coexisting with official ones. Every query in this
feature, including the slot query, the code lookup, the minter's seed and the
totals, filters out `drafts.**` and `versions.**` ids, and the slot query uses
`OFFICIAL_SCHEDULE_FILTER` (`src/lib/speaker/sanity.ts`). Otherwise an
organizer's draft schedule would open windows, and `drafts.<talkId>` would
match a code twice.

## 5. Feedback Code

Decided on [#1418](https://github.com/CloudNativeBergen/website/issues/1418).

- **Shape:** 6 opaque characters, unique **within the conference**.
  _Implementation detail:_ `SHORT_CODE_ALPHABET`, `drawShortCode` and
  `normalizeShortCode` from `src/lib/marketing/short-code.ts`, with the minter
  seeded with the conference's existing codes (`createShortCodeMinter`). The
  space is 31⁶ against about 100 codes per conference.
- **The talk's own conference, always.** _Refinement (spec):_ a speaker can
  open any of their proposals from any tenant's host
  (`src/lib/proposal/data/sanity.ts`, the owner arm of `getProposal`). Minting,
  the uniqueness seed, the "edition ended" check and the domain in the URL all
  use **`talk.conference`**, never the host's conference. A code is minted only
  when the talk's conference is the one serving the request, so a speaker sees
  the section for another tenant's talk only on that tenant's host.
- **Minted when first needed:** the first time a speaker of a **confirmed** talk
  opens the speaker section (§9) and the talk has none. _Refinement (spec):_
  this happens in a mutation the section calls on mount, not during render,
  because a Server Component render can't invalidate the lookup cache. The
  write is `setIfMissing`; the caller then reads the talk by id and shows
  whichever code won, so two concurrent first views converge on one code.
- **Never for an ended edition.** _Refinement (spec):_ no code is minted once
  `talk.conference` has ended. This implements the decided "no code for an
  edition that ended before launch" and is equivalent afterwards: a code minted
  after the conference ends could never open, since every window has closed.
- **URL:** `<conferenceBaseUrl(talk.conference)>/f/<code>`
  (`src/lib/conference/baseUrl.ts`). The proposal projection must add the
  conference's `domains` for this.
- **Rotation:** organizers only, from the talk's admin panel (§10.4). The old
  code stops resolving at once; responses are kept.
- **Studio Duplicate:** `talk` joins `SHORT_CODE_TYPES` in
  `sanity/actions/shortCodeSafeActions.ts`, which **removes Duplicate on talks
  entirely**; update the helper's `/go`-specific docstring. Assert it against
  the real exported Studio config, not the helper alone.

### 5.1 Code lookup and caching

_Refinement (spec):_ the lookup follows the `/go` short-link pattern
(`src/lib/marketing/short-link.ts`), not a per-code cache entry.

- The code's shape is checked with `normalizeShortCode` first; a malformed code
  is Unknown with no read.
- A code resolves against a **per-conference code index** (code → talk id,
  status, title, speakers, public flag), read through the CDN client
  ([#1417](https://github.com/CloudNativeBergen/website/issues/1417)) and cached
  under its own tag (`feedbackCodeIndexTag(conferenceId)` in
  `src/lib/cache/tags.ts`, not `conferenceTag`, which would flush the whole
  site on every mint). A flood of random codes then costs no Sanity reads.
- The tag is expired with `revalidateTag(tag, { expire: 0 })` (immediate, not
  the default stale-while-revalidate) on: **mint**, **rotation**, a **talk
  status change** (so a withdrawn talk stops resolving), and a **schedule
  save** (§6). Studio edits outside these paths are picked up by a short
  `cacheLife` on the index.

## 6. Feedback Window

Decided on [#1419](https://github.com/CloudNativeBergen/website/issues/1419).

- **Source:** the current, official, published `schedule` documents of the
  talk's conference (§4.4). A talk's slots are every `tracks[].talks[]` entry
  whose `talk._ref` is the talk, across all schedule days. Placeholder slots
  never carry a code.
- **Window:** from the start of the earliest slot until 24 hours after the end
  of the latest slot, as one continuous span even across days. Each slot
  instant is `osloLocalInputToIso(\`${date}T${HH:mm}\`)` (`src/lib/time.ts`),
  which is DST-correct.
- **No slot:** no window. The page says feedback opens when the session starts.
- **Moves follow automatically:** the code belongs to the talk, not a slot. A
  talk removed from the schedule closes.
- **Freshness:** the window is recomputed on every request from a cached
  schedule read; a schedule edit takes effect once that cache refreshes. The
  schedule save path expires it (§5.1).
- **Speaker visibility:** speakers see feedback once the latest slot has ended
  **or** the conference is over. Nothing is stored.
- **No organizer override.**
- _Implementation detail:_ no existing helper returns all of a talk's slots
  (`SCHEDULE_INFO_PROJECTION` and `confirmedSessionsForSpeaker` return only the
  first). Add one pure function
  `feedbackWindow({ slots, conferenceEndDate, now }) → { state: 'unscheduled' |
'before' | 'open' | 'closed', opensAt?, closesAt?, lastSlotEnd?,
feedbackVisible }`. It takes `now` and computes "conference over" itself
  (`isConferenceOver` calls `new Date()` internally), so it is testable without
  mocking the clock.

## 7. The attendee page, `/f/<code>`

Decided on [#1420](https://github.com/CloudNativeBergen/website/issues/1420),
[#1417](https://github.com/CloudNativeBergen/website/issues/1417) and
[#1418](https://github.com/CloudNativeBergen/website/issues/1418).

### 7.1 Route and chrome

- `src/app/(public)/f/[code]/page.tsx` (_Implementation detail_). The
  conference is resolved from the host with `getConferenceForCurrentDomain()`;
  an unknown host or an unavailable conference is handled with `isUnknownHost`
  / `isConferenceUnavailable` (`src/lib/conference/guard.ts`), so a failed read
  isn't reported as not-found.
- **English only. Minimal page:** the conference logo at the top
  (`ConferenceLogo` with `pickConferenceLogoProps()`), no navigation or footer,
  dark mode supported.
- _Refinement (spec):_ the root layout renders analytics on every route. On
  `/f/**`: no `AnalyticsConsentBar`, no PostHog (add `/f` to
  `EXCLUDED_PATH_PREFIXES`, `src/lib/posthog/config.ts`), no Pirsch script and
  no `InstallPrompt`. Otherwise §8's "no consent prompt" would be false and code
  URLs would reach analytics.
- _Refinement (spec):_ `noindex`.

### 7.2 States

| State            | Shown when                                                                                          | Content                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Open**         | window open, no response from this device                                                           | Talk title and speakers (if public), "How was this session?", three full-width buttons: **Loved it** (green, smiling face), **It was OK** (yellow, minus circle), **Not for me** (red, frowning face). Footer: "Anonymous. You can change your answer until <closesAt>." |
| **Answered**     | window open, this device has a response                                                             | "Thanks! You answered <label>", **Change answer**, the comment box ("Comment for the speaker (optional)", 1,000-character counter, **Send comment** / **Update comment**), **Delete my answer**, a link back to the programme.                                           |
| **Not yet open** | `before` or `unscheduled`                                                                           | "Feedback opens when the session starts". The start time is added only when the talk is public.                                                                                                                                                                          |
| **Closed**       | `closed`                                                                                            | "Feedback for this session has closed", explaining that feedback closes 24 hours after a session ends. If this device still has a response: **Delete my answer** (§7.4).                                                                                                 |
| **Unknown**      | the code is malformed, doesn't resolve in this conference, was rotated, or the talk isn't confirmed | One generic page ("This feedback code isn't valid…") that reveals nothing.                                                                                                                                                                                               |

- **"Public"** means `isProgramPublished(conference)`
  (`src/lib/conference/state.ts`) and the talk has a slot in an official
  schedule (§4.4). The title, speakers and start time never appear otherwise,
  so an early-shared code can't reveal an unannounced acceptance.
- Whether this device has a response is decided **on the server** when the page
  renders (the cookie is sent to `/f/<code>`), so a reload shows Answered.
- Colour is never the only signal: every button has an icon and words.

### 7.3 Device token and deterministic id

- **Cookie:** a random 128-bit token plus an HMAC over it, signed with a server
  secret. httpOnly, `Secure` outside development, `SameSite=Lax`,
  **`Path=/f`**, no `Domain` (host-only), **30 days**.
  _Refinement (spec):_ the `hostCookie()` helper's `__Host-` prefix requires
  `Path=/`, which contradicts the decided `/f` scope, so this cookie does not
  use the prefix; it is still host-only because no `Domain` is set.
- **Issued on the first submit**, not on the first scan. _Refinement (spec):_
  a page render can't set a cookie (`cookies().set` works only in Server
  Actions and Route Handlers), and a token is only needed once there is
  something to tie it to.
- A token that fails verification is replaced, never trusted.
- **Response id:** a hash of the token and the talk id, so the same device and
  talk always map to the same document. _Implementation detail:_
  `feedbackResponse.` + the first 32 hex characters of SHA-256 over
  `<token>:<talk _id>`; signing follows the module-private `sign()` pattern of
  `src/lib/volunteer/token.ts`, with a secret documented in
  `docs/TENANT_SECRETS.md` if it is new.
- A device that clears its cookies produces a new response. That noise is
  accepted ([#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

### 7.4 Submit, change, comment, delete

_Refinement (spec):_ these are **Server Actions colocated with
`/f/[code]`**, not tRPC procedures. A `Path=/f` cookie is never sent to
`/api/trpc`, and a tRPC procedure here has no way to set a cookie, so with tRPC
every tap would mint a new token and create a new response. Server Actions post
to the page's own URL, so the cookie arrives and can be set. The conference
comes from the host, never from the client.

- **Submit** (colour, optional comment): sets colour and comment. "Change
  answer" and "Send comment" are the same action with the current or new
  colour.
- **Delete my answer:** deletes this device's response. **Allowed for as long as
  the cookie is valid**, including after the window closes (_Decided in review_,
  R1). It is refused only once the talk has been folded (§12).

**The write** (_Refinement (spec):_ `createOrReplace` takes no revision guard):
a new response is a `create` on the deterministic id; on a 409 (a concurrent
first submit from the same device) it falls through to the update path. An
existing response is a `patch(id).ifRevisionId(rev)` that sets `colour`,
`comment` and `submittedAt` and **never touches `hiddenAt` or `flaggedAt`**, so
an attendee can't un-hide a comment by resubmitting or rewording it. On a
revision conflict it retries once. Concurrent resubmissions from one device are
last-write-wins. The existing response is read by id through the doc endpoint
(`getDocument`), never by GROQ, so a write right after a write sees it. When the
token was minted in this same request, the by-id read is skipped (no document
can exist yet).

**Refused before any write or talk-specific read** (guard before fetch), in
this order:

1. The code must resolve, through the index (§5.1), to a **confirmed** talk of
   the current conference.
2. Submit: the window must be open. Delete: the cookie must be valid and the
   talk not folded.
3. Submit: exactly one valid colour; comment ≤ 1,000 characters after trimming.
4. The device token must be one the server minted. A missing or invalid token
   means "no response from this device" on every path, never an error that
   differs by talk.

Refusals 1 and 2 return the same responses the page states use; a code from
another tenant is indistinguishable from an unknown code.

**What the page learns about its own response:** colour and comment only. It is
never told that a comment was hidden or flagged.

**No IP rate limit** of any kind
([#1417](https://github.com/CloudNativeBergen/website/issues/1417)): a shared
venue IP behind one bucket would refuse most legitimate keynote feedback. Abuse
is held back by the per-device id, the window, and organizers removing
responses.

**Cost:** the code index and the schedule come from cached CDN reads, so a
burst costs one write per response, plus one by-id read for a returning device.

## 8. Privacy copy

A new **Session Feedback** section on `/privacy`
([#1424](https://github.com/CloudNativeBergen/website/issues/1424), amended by
R1), shipped with the first slice that collects anything. The cookie is also
added to the page's existing cookie inventory.

- **What:** a colour and an optional comment about a session, given anonymously
  by scanning its QR code. No name, email or IP address is collected.
- **Cookie:** a 30-day, strictly necessary cookie, used only on `/f` pages, so
  you can change or delete your own answer and so answers aren't counted twice.
  No consent prompt.
- **Who sees it:** the session's speakers see totals and comments; organizers
  see everything and can hide or remove comments.
- **Purpose and legal basis:** helping speakers and organizers improve
  sessions; legitimate interest.
- **Retention:** 24 months after the conference ends; then comments and
  individual answers are deleted and only per-session totals remain.
- **Your rights:** delete your answer yourself from the same browser, through
  the session's QR link, for 30 days after you answered. After that we can't
  tell which answer is yours; contact the organizers quoting the comment and
  they will remove it.
- **Processors:** Sanity (storage) and Resend (speaker summary emails), both
  already in `src/lib/legal/subprocessors.ts`. No new subprocessor.

`PRIVACY_POLICY_VERSION` (`src/lib/privacy/config.ts`) only records volunteer
consent and is not bumped for this.

## 9. The speaker view

Decided on [#1421](https://github.com/CloudNativeBergen/website/issues/1421).

### 9.1 Placement and access

A full-width **Session Feedback** section at the top of `/cfp/proposal/[id]`,
above the proposal form, for **confirmed talks only** (accepted-but-unconfirmed,
draft, submitted, rejected and withdrawn show nothing). It renders on a phone
too; the current sidebar is `hidden lg:block`, which is why it is not in the
sidebar.

Two tabs: **Session Feedback** and **Feedback Code**. It opens on the code
until feedback is visible (§6), then on the results.

_Refinement (spec):_ every speaker-side procedure (ensure code, results, flag)
is refused, before any talk-specific read, unless:

1. the talk belongs to the conference serving the request;
2. the caller is in the talk's `speakers[]`;
3. the talk is confirmed, or (results only) its conference ended before launch
   and it has Card Counts;
4. for a flag: the response belongs to that talk, has a comment and is not
   hidden.

Hidden comments are filtered out **on the server**, never in the client.

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
- Comments oldest first, each with its colour and time, hidden ones excluded,
  each with a **flag** button (§10.3).

### 9.4 Dashboard chip

On a confirmed talk's row in `/cfp/list` (`CompactProposalList`): "Feedback
Code" until feedback is visible, then "<n>% loved it · <total>". It links to
the section.

### 9.5 What is replaced

`PostConferenceAudienceFeedbackPanel` and the card-count display in
`CompactProposalList`. Talks of an edition that ended before launch (the 29
talks with 2025 Card Counts) show the section **results only**: no code tab, no
code ever minted.

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
  on the entry, fed by one count query.
- No dashboard widget.

### 10.2 The talk's admin panel

On `/admin/proposals/[id]`, in place of `AudienceFeedbackPanel`:

- Totals per colour, each split into scanned and **Card Counts editable
  inline**; saving still goes through `proposal.updateAudienceFeedback`.
- **Responses over time:** a bar chart in 10-minute buckets across the window.
  Selecting a range offers **Remove these <n>**.
- **Rotate Feedback Code** (§10.4).
- The comment list with **Hide/Unhide**, **Keep** (on flagged comments) and
  **Remove**.

### 10.3 Hide, Keep, Remove, flag

- **Hide** sets `hiddenAt` and clears `flaggedAt`. The comment disappears from
  every speaker's view; organizers still see it; the colour still counts.
  **Unhide** clears `hiddenAt`.
- **Keep** clears `flaggedAt`; the comment stays visible.
- **Remove** deletes the whole `feedbackResponse` document, colour and comment,
  after a confirmation naming the count ("Remove 38 responses?"). No undo, no
  log. Bulk remove deletes in chunks of at most 100 per transaction.
- A speaker's **flag** sets `flaggedAt` (one-way for speakers; it can't be
  withdrawn). Every speaker of the talk sees "Flagged for organizers" until an
  organizer acts.

All admin actions are `adminProcedure`s that check, before any write, that every
response id belongs to a talk of the current conference.

### 10.4 Rotating the code

Confirmation: "/f/<code> stops working now. Printed sheets and slides showing it
will reach a dead page. Existing responses are kept." Rotation mints a new code
(§5) and expires the index tag immediately (§5.1).

## 11. Notifications

Decided on [#1423](https://github.com/CloudNativeBergen/website/issues/1423).

### 11.1 Summary when the window closes

- A **daily cron** finds confirmed talks whose window closed since its last run,
  with at least one response and no `feedbackSummarySentAt`.
  _Implementation detail:_ a step in the existing daily `cleanup-notifications`
  cron (04:00) or a new route in `vercel.json`.
- **Claim, then send** (_Refinement (spec)_): the cron first sets
  `feedbackSummarySentAt` with a revision guard, then sends. A failed send is
  logged, never retried for the whole talk, so one bad address can't make the
  other speakers get the summary twice.
- Each speaker of the talk **who isn't erased** (`erasedAt` unset) gets **one
  bell notification and one email**: totals per colour (Card Counts so far plus
  scanned), response and comment counts, and a link to `/cfp/proposal/<id>`
  opening the Session Feedback tab. Counts only, never comment text.
- _Implementation detail:_ a new `NotificationType` `session_feedback_summary`
  through `createNotificationsOnce`; the email is separate from the hub, a
  template in `src/components/email/` sent through Resend (`src/lib/email/`),
  like other speaker mail.
- Not sent: zero responses; a second summary after Card Counts change; past
  editions; anything real-time.

### 11.2 A flag notifies organizers

The speaker flag action emits a bell notification inline to the conference's
organizers, excluding the flagging speaker, linking to `/admin/feedback`. It
carries the talk title and **never the comment text** (_Refinement (spec):_
notifications live for 90 days, so a copied comment would outlive Remove, the
fold and erasure). Never-fail: a notification failure doesn't fail the flag.
Speakers aren't told how a flag was resolved. _Implementation detail:_
`NotificationType` `session_feedback_flagged`.

## 12. Retention and erasure

Decided on [#1424](https://github.com/CloudNativeBergen/website/issues/1424).

### 12.1 Attendee erasure

**Delete my answer** for as long as the cookie lasts (§7.4, R1). After that,
organizers remove a quoted comment with **Remove** (§10.3).

### 12.2 The 24-month fold

- A daily cron step finds talks whose conference ended more than 24 months ago
  and that still have `feedbackResponse` documents.
- For each talk: read its responses once, add each colour's count to
  `feedbackFolded` (creating it if absent, setting `foldedAt`) with a revision
  guard on the talk, then delete exactly those documents in chunks of at most
  100 per transaction.
- **Fold before delete, and idempotent:** a crash after the fold and before the
  deletes must not count those responses twice. _Implementation detail:_
  record the folded document ids' count and `foldedAt` watermark so a re-run
  only deletes responses with `submittedAt ≤ foldedAt` without re-adding them,
  and a re-run over a talk with no responses plans nothing.
- After the fold, every surface reads `feedbackFolded` through the totals
  function (§4.3).

### 12.3 Speaker erasure

`eraseSpeakerInPlace` (`src/lib/speaker/erasure.ts`) gains a branch following
the module's existing pattern (an input gather, a field on `ErasureInputs`, a
pure plan step in `buildErasurePlan`):

- Talks where the erased speaker is the **only non-erased speaker**
  (_Refinement (spec):_ "only entry" would never fold a talk whose co-speakers
  were all erased) are folded early, exactly as §12.2, and their
  `feedbackCode` is **unset**, so no new responses arrive about the erased
  person.
- **Co-spoken** talks with another non-erased speaker keep their feedback (the
  module's rule: never destroy data belonging to someone who requested
  nothing). An organizer removes any comment naming the erased person by hand.
- The response deletes run in chunks **after** the erasure transaction, like
  the image-asset delete, so a large talk can't fail the erasure itself.
- The branch keeps the module's fixed-point property: a second run plans
  nothing.

## 13. Slices

Every slice is filed as an issue labelled `speaker-feedback`, under a parent
implementation issue, with the dependencies below as native blocking edges.
Every UI slice ships its Storybook stories and is visually checked with
`pnpm shoot` at phone width (and desktop for admin), light and dark, per
`AGENTS.md`. Every new tRPC endpoint is mocked in the affected UI tests and the
mutation-surface snapshots are updated.

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | After  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1a | **The code, nothing collected yet.** `talk.feedbackCode` and the `feedbackResponse` type with its proposal-delete cascade (§4); published-only queries (§4.4); minting through the ensure-code mutation, the code index and its tag expiries, the Duplicate guard (§5); `feedbackWindow` and the slot query (§6); the speaker section with its access guards (§9.1) and a minimal **Feedback Code** tab (QR, state, Copy link). Demo: a speaker of a confirmed, scheduled talk sees their QR. | —      |
| F1b | **Scan and tap.** `/f/<code>` with Open, Not yet open, Closed and Unknown, chrome and analytics exclusions (§7.1, §7.2); the cookie and deterministic id (§7.3); the Submit action with every guard and the create/patch write (§7.4) and a plain thank-you screen; the `/privacy` section and cookie inventory (§8). Demo: scanning the QR records a colour.                                                                                                                                 | F1a    |
| F2  | **Comment, change, delete:** the Answered state (§7.2) with the comment box, Change answer, Delete my answer (including after the window, R1), and the moderation-preserving update (§7.4).                                                                                                                                                                                                                                                                                                   | F1b    |
| F3  | **Speaker results:** the totals function (§4.3); the **Session Feedback** tab with live polling and comments, hidden ones filtered on the server (§9.3, without the flag button); the dashboard chip (§9.4); replacing the old panel and card display, past editions results-only (§9.5).                                                                                                                                                                                                     | F2     |
| F4  | **Code downloads and Present:** PNG, SVG, Print sheet, Present (§9.2).                                                                                                                                                                                                                                                                                                                                                                                                                        | F1a    |
| F5  | **Admin page:** `/admin/feedback` with stats, the ranked table, expanding rows, Hide/Unhide/Remove (§10.1, §10.3), and the nav entry (without the badge).                                                                                                                                                                                                                                                                                                                                     | F3     |
| F6  | **Talk admin panel:** totals with inline Card Counts replacing `AudienceFeedbackPanel`, the responses-over-time chart with bulk Remove, Rotate Feedback Code (§10.2, §10.4).                                                                                                                                                                                                                                                                                                                  | F5     |
| F7  | **Flags:** the speaker flag button and marker (§9.3, §10.3), the flagged box with Keep (§10.1), the nav badge (§10.1), the organizer notification (§11.2).                                                                                                                                                                                                                                                                                                                                    | F5     |
| F8  | **Summary notification:** the cron step, claim-then-send, bell and email (§11.1).                                                                                                                                                                                                                                                                                                                                                                                                             | F3     |
| F9  | **Retention fold and speaker erasure** (§12.2, §12.3).                                                                                                                                                                                                                                                                                                                                                                                                                                        | F3, F5 |

### 13.1 Tickets

Filled in when the slices are filed.

## 14. Verification

Per `AGENTS.md` ("Agent discipline"):

- **Guards are sabotage-proven:** for each refusal in §7.4, §9.1 and §10.3,
  remove the guard, show the specific test fails on a value (the write
  happening), restore.
- **Guard before fetch:** a test asserts no talk-specific read or write runs for
  a code of another tenant, and that the refusal is identical to an unknown
  code.
- **The cookie path end to end:** a test drives the real `/f/<code>` Server
  Action with a real cookie and shows a second tap updates the same document.
  A unit test that injects the token directly cannot catch a cookie that never
  arrives.
- **Executed GROQ, not mocks,** for the slot query (including a draft schedule
  and a `drafts.` talk that must not count), the code index, the totals and the
  fold.
- **Deterministic ids:** the same token and talk give the same id; a different
  token or talk gives a different one; a forged token is replaced.
- **Concurrency on a real client:** two first submits from one device converge
  on one document; a resubmit never clears `hiddenAt`/`flaggedAt`.
- **Fixed point:** the fold and the erasure branch, run twice, commit nothing
  the second time, including after a crash between fold and delete.
- **Studio Duplicate:** asserted on the real exported Studio config.
- **Visual:** every new or changed component has a story; captures at phone
  width, light and dark, with the dark-mode mechanism of the story file checked.

## 15. Known gaps and risks

- **Getting round Hide:** deleting an answer and submitting again, or answering
  from a private window, produces a fresh, unhidden comment. Accepted
  (_Decided in review_, R2); organizers hide it again.
- **Plan overage:** whether the Growth Non-Profit plan bills overage or
  hard-caps was not verified; the estimate is 10k–30k live requests per edition
  against ~130k monthly headroom. Every submit is one billable write, and there
  is no IP limit, so a sustained scripted flood costs quota for every tenant
  until organizers notice; random codes cost nothing (§5.1).
- **Document count:** 200–3,000 responses per edition against a 25k or 50k
  limit (Sanity's pages disagree; 7,161 used on 2026-10-17). The 24-month fold
  bounds it.
- **A domain change mid-edition** breaks printed codes; a reprint fixes it.
- **A cleared cookie** produces a second response from the same person.
- **No IP limit:** a scripted flood is only remedied after the fact (Remove,
  bulk by time range). Revisit with proof of attendance if abuse appears.

## 16. Decided in review

- **R1. Delete my answer after the window closes.** The decided copy said that
  after the window answers "can't be linked to you", which is false while the
  30-day cookie lives. The user chose to keep **Delete my answer** working for
  as long as the cookie is valid, and to word the copy accordingly (§7.4, §8).
- **R2. Getting round Hide.** Deleting and resubmitting (or a private window)
  brings a hidden comment back as a new one. The user accepted this as a known
  gap rather than adding a tombstone document; the page is never told a comment
  was hidden (§7.4, §15).
