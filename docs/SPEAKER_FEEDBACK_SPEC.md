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
  procedure names, tags and file locations in this spec are implementation
  details unless marked otherwise; an implementer may pick better ones.

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
`feedbackResponse` is excluded from the blocking check and deleted in its own
chunked step (chunks of `PROPOSAL_DELETE_CHUNK_SIZE`) **before** the proposal's
final transaction, since the reference is strong. It does not go in
`NON_BLOCKING_TYPES` (types that are neither blocking nor deleted) or
`CASCADE_DELETE_TYPES` (deleted in the final, unchunked transaction). The code
index is expired (§5.1).

### 4.2 Additive `talk` fields

`talk` is not one of the append-only `conference`/`organization` types, but
every change here is additive anyway.

| Field                   | Type                                                   | Notes                                            |
| ----------------------- | ------------------------------------------------------ | ------------------------------------------------ |
| `feedbackCode`          | string                                                 | §5. Read-only in Studio.                         |
| `feedbackFolded`        | object `{greenCount, yellowCount, redCount, foldedAt}` | Scanned totals kept after a fold (§12.2, §12.3). |
| `feedbackSummarySentAt` | datetime                                               | Claimed before the summary goes out (§11.1).     |

`audienceFeedback` (Card Counts) is unchanged.

**Server writes to these three fields also patch every other version of the
talk** (`drafts.<talkId>` and any `versions.<release>.<talkId>`, found with
`sanity::versionOf`), each guarded by its own `ifRevisionId`, in the same
transaction as the published talk. _Refinement (spec):_ a draft or a release
version is a full copy, so publishing one that predates a mint, rotation or
fold would write the old value back: a rotated-out code would come back to
life, or folded totals would be lost after their documents were deleted.

- The version lookup, **the write transaction** and the sweep all run through
  one client pinned with `withConfig({ apiVersion: '2025-02-19' })`, with
  `perspective: 'raw'` on each fetch (as `src/lib/sanity/orphaned-asset.ts`
  does per fetch). The default clients' API version doesn't handle
  `versions.**`.
- **After the commit, a sweep** re-reads `drafts.<id>` with `getDocument`, lists
  the releases, and fetches each `versions.<release>.<id>` by id through the doc
  endpoint (never GROQ, which can lag the commit by about a second, exactly the
  case the sweep exists for). It re-patches any that still carry a stale value,
  at most **3** times, and logs when the cap is hit. A revision guard can't
  catch a version created between the read and the commit, because it isn't in
  the transaction.
- **A failed version guard is retried, not surfaced.** When someone edits a draft
  during a write, the write re-reads and retries up to 3 times. For a mint, it
  first re-reads the published talk and, if another request's code already
  won, returns that code, so concurrent first views still converge.
- **A mint guards the published talk too:** its patch on the published talk
  carries `ifRevisionId` from the request's first read (not a bare
  `setIfMissing`), and the version patches use `setIfMissing`. A request that
  lost the race therefore fails its guard and takes the re-read-and-return
  path, instead of writing its own code onto a draft whose published talk holds
  another. "Stale" in the sweep means "differs from the published talk after
  the commit".
- Production had 0 talk drafts and 0 release versions on 2026-10-17, but
  organizers can create one at any time. The remaining risk, a version created
  and published inside one write's sweep, is in §15.

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
archived`) with drafts coexisting with official ones. Every **read** in this
feature (the slot query, the code index, the totals) filters out `drafts.**`
and `versions.**` ids, and the slot query uses `OFFICIAL_SCHEDULE_FILTER`
(`src/lib/speaker/sanity.ts`, exported for this). Otherwise an organizer's draft
schedule would open windows, and `drafts.<talkId>` would match a code twice.

The **minter's seed** is the exception: it includes drafts, so a new code is
never one a draft already holds (the `/go` minter's rule).

## 5. Feedback Code

Decided on [#1418](https://github.com/CloudNativeBergen/website/issues/1418).

- **Shape:** 6 opaque characters, unique **within the conference**.
  _Implementation detail:_ `SHORT_CODE_ALPHABET`, `drawShortCode` and
  `normalizeShortCode` from `src/lib/marketing/short-code.ts`, with the minter
  seeded with the conference's existing codes (`createShortCodeMinter`). The
  space is 31⁶ against about 100 codes per conference.
- **The talk's own conference, always.** _Refinement (spec):_ a speaker can
  open any of their proposals from any tenant's host (the owner arm of
  `getProposal`, `src/lib/proposal/data/sanity.ts`). Minting, the uniqueness
  seed, the window and the domain in the URL all use **`talk.conference`**,
  never the host's conference. A code is minted only when the talk's conference
  is the one serving the request, so a speaker sees the section for another
  tenant's talk only on that tenant's host.
- **Minted when first needed:** the first time a speaker of a **confirmed** talk
  opens the speaker section (§9) and the talk has none. _Refinement (spec):_
  this happens in an **ensure-code mutation** the section calls on mount, not
  during render, because a Server Component render can't expire a cache tag.
  The mutation reads the talk first and writes only if there is no code
  (`setIfMissing`), then reads the talk by id and returns whichever code won,
  so two concurrent first views converge on one code. It expires the index tag
  only when it actually minted, so a repeat call costs no write and no cache
  flush.
- **Not once the talk's window has closed.** _Refinement (spec):_ no code is
  minted for a talk whose Feedback Window has closed, or, for a talk with no
  slot, once its conference is over. This implements the decided "no code for
  an edition that ended before launch"
  ([#1421](https://github.com/CloudNativeBergen/website/issues/1421)) without
  refusing a code during the last hours of a window that is still open.
- **URL:** `<conferenceBaseUrl(talk.conference)>/f/<code>`
  (`src/lib/conference/baseUrl.ts`). The proposal projection adds the
  conference's `domains` for this.
- **Rotation:** organizers only, from the talk's admin panel (§10.4). The old
  code stops resolving at once; responses are kept.
- **Studio Duplicate:** `talk` joins `SHORT_CODE_TYPES` in
  `sanity/actions/shortCodeSafeActions.ts`, which **removes Duplicate on talks
  entirely**; update the helper's `/go`-specific docstring. Assert it against
  the real exported Studio config, not the helper alone.

### 5.1 Code index and caching

_Refinement (spec):_ the lookup follows the `/go` short-link index
(`conferenceShortCodeIndex`, `src/lib/marketing/short-link.ts`), not a per-code
cache entry, and **not the CDN client**: Sanity's CDN keeps its own cache that
`revalidateTag` can't reach, so a refill right after an expiry could read the
old index back from it. This refines #1417's "read through the CDN": the cost is
the same (one read per cache refresh), and expiries take effect.

- The code's shape is checked with `normalizeShortCode` first; a malformed code
  is Unknown with no read.
- A code resolves against a **per-conference index**: code → talk id, for
  **confirmed, published talks only**. It is read with `clientReadUncached`
  inside `'use cache: remote'` (plain `'use cache'` is per-instance memory) and
  tagged `feedbackCodeIndexTag(conferenceId)` (`src/lib/cache/tags.ts`; not
  `conferenceTag`, which would flush the whole site on every mint). A flood of
  random codes costs no Sanity reads. The index is server-only and never passed
  to a Client Component.
- The talk's title, speakers and slots for the page come from a second cached
  read under the same tag. "Public" (§7.2) is computed **per request** from the
  cached conference and slots, never stored in the cache, since it depends on
  the time and on `programDate`.
- The tag is expired with `revalidateTag(tag, { expire: 0 })` (immediate, not
  the default stale-while-revalidate) on: **mint**, **rotation**, a **talk
  status change** (so a withdrawn talk stops resolving), **proposal delete**,
  **speaker erasure** and **fold** (§12), and **schedule changes** through both
  `schedule.save` and `schedule.action` (promote). Studio edits outside these
  paths are picked up by the index's `cacheLife` of **5 minutes** (revalidate
  and expire).
- **Speaker erasure runs from a script** (`scripts/erase-speaker.ts`, no Next
  request), which prints cache tags for the operator instead of expiring them.
  `feedbackCodeIndexTag` is added to `revalidateErasureTags`, and to
  `revalidationsForTargets` behind `api/provisioning/cache/invalidate`, which must expire
  it with `{ expire: 0 }`.
- **A stale index can't cause a wrong write.** A refill right after an expiry
  goes through GROQ, which can lag a write by about a second, so it can cache an
  old mapping for one `cacheLife`. Submit therefore re-checks the talk through
  the doc endpoint before writing (§7.4). At worst a stale index shows a page
  for a code that then refuses the tap, or shows Unknown for a just-minted code
  for up to 5 minutes.

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
  talk removed from the schedule stops accepting answers and shows Not yet open
  (it is `unscheduled` again); a talk moved later shows Not yet open until its
  new slot.
- **Freshness:** the window is recomputed on every request from the cached slot
  read (§5.1), which schedule changes expire.
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
- _Refinement (spec):_ the root layout renders analytics on every route, and it
  can't see the path. On `/f/**`:
  - no PostHog and no consent bar: add `/f` to `EXCLUDED_PATH_PREFIXES`
    (`src/lib/posthog/config.ts`), which both already follow;
  - no Pirsch script and no `InstallPrompt`: put them behind a `usePathname`
    client gate, like `AnalyticsRouteGate`;
  - Vercel `<Analytics />` redacts the code from `/f/` paths in `beforeSend`
    (supported by the installed `@vercel/analytics` 2.0.1). Both it and
    `<SpeedInsights />` are client components and the root layout is a Server
    Component, so they are rendered from a small `'use client'` wrapper.
  - _Refinement (F1b):_ `<SpeedInsights />` sends **no metric at all** from
    `/f/`: its served script copies back only the `url` that `beforeSend`
    returns and keeps its own `route`, built from the raw path, so a
    percent-encoded code (`/f/%6b7m2qx`, which resolves) would be sent as the
    route. `beforeSend` returns `null` instead.
  - _Refinement (F1b):_ `Referrer-Policy: no-referrer` is sent as a response
    header on `/f/**` (the page's metadata is streamed after its first
    sub-resource requests), and `/F/<code>` and `/f/<code>/<more>` are
    rewritten to `/f/<code>` so they never reach the not-found page and its
    links.

  Otherwise §8's "no consent prompt" would be false and codes would reach
  analytics.

- _Refinement (spec):_ `noindex`.

### 7.2 States

| State            | Shown when                                                                                          | Content                                                                                                                                                                                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Open**         | window open, no response from this device                                                           | Talk title and speakers (if public), "How was this session?", three full-width buttons: **Loved it** (green, smiling face), **It was OK** (yellow, minus circle), **Not for me** (red, frowning face). Footer: "Anonymous. You can change your answer until <closesAt>." |
| **Answered**     | window open, this device has a response                                                             | "Thanks! You answered <label>", **Change answer**, the comment box ("Comment for the speaker (optional)", 1,000-character counter, **Send comment** / **Update comment**), **Delete my answer**, a link back to the programme.                                           |
| **Not yet open** | `before` or `unscheduled`                                                                           | "Feedback opens when the session starts". The start time is added only when the talk is public. If the talk is in this device's cookie list (it was answered before a move or removal): **Delete my answer** (§7.4).                                                     |
| **Closed**       | `closed`                                                                                            | "Feedback for this session has closed", explaining that feedback closes 24 hours after a session ends. If the talk is in this device's cookie list: **Delete my answer** (§7.4).                                                                                         |
| **Unknown**      | the code is malformed, doesn't resolve in this conference, was rotated, or the talk isn't confirmed | One generic page ("This feedback code isn't valid…") that reveals nothing.                                                                                                                                                                                               |

- **"Public"** means `isProgramPublished(conference)`
  (`src/lib/conference/state.ts`) and the talk has a slot in an official
  schedule (§4.4). The title, speakers and start time never appear otherwise,
  so an early-shared code can't reveal an unannounced acceptance.
  _Refinement (F1b):_ nor does the closing time in the Open footer, which
  gives the slot's end away as surely as the start.
- Whether this device has a response is decided **on the server** when the page
  renders (the cookie is sent to `/f/<code>`), so a reload shows Answered.
- Colour is never the only signal: every button has an icon and words.

### 7.3 Device cookie and deterministic id

- **Cookie:** a random 128-bit token, an issue time, the list of talks this
  device has answered, and an HMAC over all three, signed with a server secret.
  httpOnly, `Secure` outside development, `SameSite=Lax`, **`Path=/f`**, no
  `Domain` (host-only). **30 days, refreshed on every submit.**
  - _Refinement (spec):_ the 30 days are enforced **on the server** from the
    signed time, not only by the browser's `Max-Age`; a copied or preserved
    cookie more than 30 days past that time is treated as absent. The signed
    time is the **last submit**, re-stamped on every Submit (the token stays the
    same), matching §8's "30 days after your last answer".
  - _Refinement (spec):_ each list entry is a truncated HMAC of the talk id
    (8 bytes), not the id, and the list keeps at most the **100** most recent
    entries, so the cookie stays well under the 4 KB browser limit. Past that
    limit a browser silently drops the `Set-Cookie`, and the answer could then
    never be shown or deleted.
  - _Refinement (spec):_ the `hostCookie()` helper's `__Host-` prefix requires
    `Path=/`, which contradicts the decided `/f` scope, so this cookie does not
    use the prefix; it is still host-only because no `Domain` is set.
  - _Refinement (spec):_ the answered-talk list means the page reads a response
    only for a talk this device has actually answered. Without it, one real
    submit would give a script a valid cookie for unlimited billable reads on
    every code for 30 days. The list holds talk ids only, nothing about the
    person.
- **Issued on the first submit**, not on the first scan. _Refinement (spec):_
  a page render can't set a cookie (`cookies().set` works only in Server
  Actions and Route Handlers), and a token is only needed once there is
  something to tie it to.
- A cookie that fails verification is replaced, never trusted.
- **Response id:** a hash of the token and the talk id, so the same device and
  talk always map to the same document. _Implementation detail:_
  `feedbackResponse.` + the first 32 hex characters of SHA-256 over
  `<token>:<talk _id>`; signing follows the module-private `sign()` pattern of
  `src/lib/volunteer/token.ts`, with a secret documented in
  `docs/TENANT_SECRETS.md` if it is new.
- A device that clears its cookies produces a new response. That noise is
  accepted ([#1417](https://github.com/CloudNativeBergen/website/issues/1417)).

### 7.4 Submit, change, comment, delete

_Refinement (spec):_ these are **Server Actions colocated with `/f/[code]`**,
not tRPC procedures. The decided `Path=/f` cookie is never sent to
`/api/trpc`, so with tRPC every tap would arrive without its token, mint a new
one and create a new response. Server Actions post to the page's own URL, so the
cookie arrives. Next's default Server Action origin check
(Origin must match Host) plus the `SameSite=Lax`, host-only cookie covers CSRF;
`serverActions.allowedOrigins` must never be widened. Each action takes **only
the code** (and the colour and comment for Submit); the conference comes from
the host and the talk id from the index, never from the client.

- **Submit** (colour, optional comment): sets colour and comment. "Change
  answer" and "Send comment" are the same action with the current or new
  colour.
- **Delete my answer:** deletes this device's response and drops the talk from
  the cookie's list. **Allowed for as long as the cookie is valid**, including
  after the window closes (_Decided in review_, R1).

**The write** (_Refinement (spec):_ `createOrReplace` would overwrite the
moderation fields): a field-scoped `patch(id).set({ colour, comment,
submittedAt })` (or `unset` of an emptied comment), which by construction never
touches `hiddenAt` or `flaggedAt`, so an attendee can't un-hide a comment by
resubmitting or rewording it. If the document doesn't exist, a `create` on the
deterministic id; on a 409 (a concurrent first submit from the same device) it
falls back to the patch. Concurrent resubmissions from one device are
last-write-wins.

**Before writing, Submit re-reads the talk by id through the doc endpoint**
(`getDocument`) and refuses unless its `feedbackCode` still equals the code,
it is still confirmed, and it belongs to the current conference. _Refinement
(spec):_ the cached index can be up to one `cacheLife` stale (§5.1); this one
read per write makes a rotated, withdrawn, folded or erased talk refuse taps at
once.

**Reading this device's own response** (for the Answered state) happens only
for a talk in the cookie's list, by id, through
`clientReadUncached.getDocument(id)` (never GROQ or the CDN, which can lag the
write and cache the old state) inside a `'use cache: remote'` read with a
`cacheLife` of 5 minutes, tagged per response (`feedbackResponseTag(id)`). That
tag is expired on Submit and Delete my answer with `updateTag` (Server Actions
only), and on Remove (§10.3) with `revalidateTag(tag, { expire: 0 })`, since
Remove runs in the `/api/trpc` Route Handler where `updateTag` throws. A folded
talk needs no expiry: its code is unset, so the page shows Unknown and never
reads the response. _Refinement
(spec):_ without the cache, a script holding a valid cookie could reload the
page for unlimited billable reads. The Closed state needs no read: it offers
**Delete my answer** whenever the talk is in the cookie's list, and deleting an
already-deleted id is harmless.

**Refused before any write or talk-specific read** (guard before fetch), in
this order:

1. The code must resolve, through the index (§5.1), to a confirmed, published
   talk of the current conference. Folding and erasure unset the code (§12),
   so a folded or erased talk doesn't resolve.
2. Submit: the window must be open. Delete: the cookie must be valid and list
   this talk.
3. Submit: exactly one valid colour; comment ≤ 1,000 characters after trimming.
4. The cookie must be one the server signed. A missing or invalid cookie means
   "no response from this device" on every path, never an error that differs
   by talk.

Refusals 1 and 2 return the same responses the page states use; a code from
another tenant is indistinguishable from an unknown code.

**What the page learns about its own response:** colour and comment only. It is
never told that a comment was hidden or flagged.

**No IP rate limit** of any kind
([#1417](https://github.com/CloudNativeBergen/website/issues/1417)): a shared
venue IP behind one bucket would refuse most legitimate keynote feedback. Abuse
is held back by the per-device id, the window, and organizers removing
responses.

**Cost:** the index, slots and a device's own response come from cached reads.
A Submit or Delete costs one write, the by-id talk read (Submit only), and one
refill read of the response on the next page load. Repeated page loads cost no
live reads.

## 8. Privacy copy

A new **Session Feedback** section on `/privacy`
([#1424](https://github.com/CloudNativeBergen/website/issues/1424), amended by
R1), shipped with the first slice that collects anything. The cookie is also
added to the page's existing cookie inventory.

- **What:** a colour and an optional comment about a session, given anonymously
  by scanning its QR code. No name, email or IP address is collected.
- **Cookie:** a strictly necessary cookie, used only on `/f` pages and kept for
  30 days after your last answer, so you can change your own answer (and, from
  the slice that ships it, delete it) and so answers aren't counted twice. No
  consent prompt.
- **Who sees it:** the session's speakers see totals and comments; organizers
  see everything and can hide or remove comments.
- **Purpose and legal basis:** helping speakers and organizers improve
  sessions; legitimate interest.
- **Retention:** 24 months after the conference ends; then comments and
  individual answers are deleted and only per-session totals remain.
- **Your rights** (added in the slice that ships Delete my answer): delete your
  answer yourself from the same browser, through the session's QR link, for 30
  days after your last answer, unless the organizers have replaced that code or
  the session was withdrawn.
  After that we can't tell which answer is yours; contact the organizers quoting
  the comment and they will remove it.
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

_Refinement (spec):_ the results and flag procedures start with **one scoped
query** that returns the talk only if it belongs to the
conference serving the request, the caller is in its `speakers[]`, and it is
confirmed. A null result is one uniform refusal, so the procedure reveals
nothing about talks the caller can't see. (All 29 past talks with Card Counts
are confirmed in production, so "results only" needs no separate rule: it is a
confirmed talk with no code for which §5 refuses to mint one.)

**Ensure-code and rotation read the published talk with `getDocument`**
through the pinned client (§4.2), not GROQ, and check conference,
`speakers[]` (ensure-code) and status on that document, with the same uniform
refusal for a missing or foreign talk. Their `ifRevisionId` comes from that
read, and the re-read after a failed guard also goes through the doc endpoint.
_Refinement (spec):_ a speaker confirms the talk on this same page, and a GROQ
read lagging that write by about a second would refuse the QR or hand the mint a
stale revision that fails every retry. Then:

- **results:** refused unless feedback is visible (§6), computed on the server;
  hidden comments are filtered out on the server, never in the client;
- **flag:** the response must belong to that talk, have a comment and not be
  hidden.

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
  log. Bulk remove deletes in chunks of at most 100 per transaction, and expires
  each removed response's `feedbackResponseTag` (§7.4).
- A speaker's **flag** sets `flaggedAt` (one-way for speakers; it can't be
  withdrawn). Every speaker of the talk sees "Flagged for organizers" until an
  organizer acts.

All admin actions are `adminProcedure`s that check, before any write, that every
response id belongs to a talk of the current conference.

### 10.4 Rotating the code

Confirmation: "/f/<code> stops working now. Printed sheets and slides showing it
will reach a dead page. Existing responses are kept." Rotation mints a new code
(§5), writes it to the draft too (§4.2), and expires the index tag immediately
(§5.1).

Rotation is **refused, and not offered**, when the talk has no `feedbackCode`
(never minted, folded, or its only speaker erased) or when §5 would refuse to
mint one (its window has closed). _Refinement (spec):_ otherwise an organizer
could restart collection on a talk erasure or the fold had closed.

## 11. Notifications

Decided on [#1423](https://github.com/CloudNativeBergen/website/issues/1423).

### 11.1 Summary when the window closes

- A **daily cron** finds confirmed talks whose window has closed, with no
  `feedbackSummarySentAt` and at least one `feedbackResponse`. _Refinement
  (spec):_ no "since its last run" lookback; the cron keeps no state, and a
  fixed lookback would silently skip a day's talks after one failed run. The
  claim marker already makes it one send per talk, and past editions drop out
  because they have no response documents.
  _Implementation detail:_ a step in the existing daily `cleanup-notifications`
  cron (04:00) or a new route in `vercel.json`.
- **Claim, then send** (_Refinement (spec)_): the cron first sets
  `feedbackSummarySentAt` with a revision guard, then sends. A failed send is
  logged, never retried for the whole talk, so one bad address can't make the
  other speakers get the summary twice.
- Each speaker of the talk **who isn't erased** (`erasedAt` unset) gets **one
  bell notification and one email**: totals per colour (Card Counts so far plus
  scanned), response and comment counts, and a link to
  `<conferenceBaseUrl(talk.conference)>/cfp/proposal/<id>` opening the Session
  Feedback tab (the cron has no request host). Counts only, never comment text.
- _Implementation detail:_ a new `NotificationType` `session_feedback_summary`
  through `createNotificationsOnce`; the email is separate from the hub, a
  template in `src/components/email/` sent through Resend (`src/lib/email/`),
  like other speaker mail.
- Not sent: zero responses; a second summary after Card Counts change; past
  editions; anything real-time.

### 11.2 A flag notifies organizers

The speaker flag action emits a bell notification inline to the conference's
organizers, excluding the flagging speaker, linking to `/admin/feedback`, but
only when `flaggedAt` goes from unset to set (a revision-guarded write), so a
Keep followed by a re-flag notifies once per flag, not per click. It carries the
talk title and **never the comment text** (_Refinement (spec):_ notifications
live for 90 days, so a copied comment would outlive Remove, the fold and
erasure). Never-fail: a notification failure doesn't fail the flag. Speakers
aren't told how a flag was resolved. _Implementation detail:_ `NotificationType`
`session_feedback_flagged`.

## 12. Retention and erasure

Decided on [#1424](https://github.com/CloudNativeBergen/website/issues/1424).

### 12.1 Attendee erasure

**Delete my answer** for as long as the cookie lasts (§7.4, R1). After that,
organizers remove a quoted comment with **Remove** (§10.3).

### 12.2 The 24-month fold

- A daily cron step finds talks whose conference ended more than 24 months ago
  and that still have `feedbackResponse` documents.
- **Fold in chunks, each atomic** (_Refinement (spec)_). For each chunk of at
  most 100 responses, read the talk, its other versions (§4.2) and the
  responses, then commit one transaction that:
  1. on the talk and on each version: **`set` the absolute totals**
     (the published talk's `feedbackFolded` counts, 0 where absent, plus this
     chunk's colours) and `foldedAt`, and unset `feedbackCode`, each patch
     guarded by its document's `ifRevisionId`. Not `inc`: `inc` on a missing
     field does nothing in Sanity (verified on the real `@sanity/mutator`
     6.12.0), and making it work needs `setIfMissing` to run before `set`
     within one patch, an order the server isn't documented to guarantee.
     Since every patch is guarded against the read, absolute values are safe,
     and every version ends with the published totals.
  2. for each response: a no-op `patch` guarded by its `ifRevisionId`, then its
     `delete`. A response removed, deleted or re-coloured since the read fails
     the guard, so it is never counted with a colour it no longer has.

  Any failed guard aborts the whole chunk, which is re-planned. A crash leaves
  only unfolded responses, which the next run folds; nothing is counted twice
  or lost, and a run over a talk with no responses plans nothing.

- The code is unset by the first chunk, and the index tag is expired after a
  fold (§5.1).
- After the fold, every surface reads `feedbackFolded` through the totals
  function (§4.3).

### 12.3 Speaker erasure

`eraseSpeakerInPlace` (`src/lib/speaker/erasure.ts`) gains a branch following
the module's existing pattern (an input gather, a field on `ErasureInputs`, a
pure plan step in `buildErasurePlan`):

- Talks where the erased speaker is the **only non-erased speaker**
  (_Refinement (spec):_ "only entry" would never fold a talk whose co-speakers
  were all erased) have their `feedbackCode` **unset** (talk and every version)
  in the erasure transaction. Submit's re-check of the talk (§7.4) refuses taps
  from that moment, whatever the index still caches; the index tag is expired
  through the erasure's cache step (§5.1). Then their responses are folded
  exactly as §12.2, in chunks **after** the erasure transaction, like the
  image-asset delete, so a large talk can't fail the erasure itself.
- **Co-spoken** talks with another non-erased speaker keep their feedback (the
  module's rule: never destroy data belonging to someone who requested
  nothing). An organizer removes any comment naming the erased person by hand.
- Fixed point: once the code is unset nothing new arrives, and the chunked fold
  converges, so a second run plans nothing.

## 13. Slices

Every slice is filed as an issue labelled `speaker-feedback`, under a parent
implementation issue, with the dependencies below as native blocking edges.
Every UI slice ships its Storybook stories and is visually checked with
`pnpm shoot` at phone width (and desktop for admin), light and dark, per
`AGENTS.md`. Every new tRPC endpoint is mocked in the affected UI tests and the
mutation-surface snapshots are updated.

| #   | Slice                                                                                                                                                                                                                                                                                                                                                                                                                      | After  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| F1a | **The code.** `talk.feedbackCode` and the draft-patching rule (§4.2); published-only reads and the exported schedule filter (§4.4); the ensure-code mutation and minting rules, Duplicate guard (§5); `feedbackWindow` and the slot query (§6); the speaker section with its access guard (§9.1) and a minimal **Feedback Code** tab (QR, state, Copy link). Demo: a speaker of a confirmed, scheduled talk sees their QR. | —      |
| F1b | **The attendee page, read side.** The code index, its tag and every expiry path so far (mint, status change, proposal delete, schedule changes) (§5.1); `/f/<code>` with Open (buttons not yet wired), Not yet open, Closed and Unknown, chrome and analytics exclusions (§7.1, §7.2). Demo: scanning the QR shows the right state; nothing is collected.                                                                  | F1a    |
| F1c | **Scan and tap.** The `feedbackResponse` type and the proposal-delete cascade (§4.1); the cookie and deterministic id (§7.3); the Submit action with every guard and the patch/create write (§7.4) and a plain thank-you screen; the `/privacy` section without "Your rights", and the cookie inventory (§8). Demo: scanning the QR records a colour, and a second tap from the same phone changes it.                     | F1b    |
| F2  | **Comment, change, delete:** the Answered state (§7.2) with the comment box, Change answer, Delete my answer (including after the window, R1) on the Answered, Closed and Not yet open states whenever the talk is in the cookie's list, and the "Your rights" copy (§8).                                                                                                                                                  | F1c    |
| F3  | **Speaker results:** the totals function (§4.3); the **Session Feedback** tab with live polling and comments, visibility and hidden filtering on the server (§9.1, §9.3, without the flag button); the dashboard chip (§9.4); replacing the old panel and card display, past editions results-only (§9.5).                                                                                                                 | F2     |
| F4  | **Code downloads and Present:** PNG, SVG, Print sheet, Present (§9.2).                                                                                                                                                                                                                                                                                                                                                     | F1a    |
| F5  | **Admin page:** `/admin/feedback` with stats, the ranked table, expanding rows, Hide/Unhide/Remove (§10.1, §10.3), and the nav entry (without the badge).                                                                                                                                                                                                                                                                  | F3     |
| F6  | **Talk admin panel:** totals with inline Card Counts replacing `AudienceFeedbackPanel`, the responses-over-time chart with bulk Remove, Rotate Feedback Code with its draft patch and expiry (§10.2, §10.4).                                                                                                                                                                                                               | F5     |
| F7  | **Flags:** the speaker flag button and marker (§9.3, §10.3), the flagged box with Keep (§10.1), the nav badge (§10.1), the organizer notification (§11.2).                                                                                                                                                                                                                                                                 | F5     |
| F8  | **Summary notification:** the cron step, claim-then-send, bell and email (§11.1).                                                                                                                                                                                                                                                                                                                                          | F3     |
| F9  | **Retention fold and speaker erasure** (§12.2, §12.3), including their expiries.                                                                                                                                                                                                                                                                                                                                           | F3, F5 |

### 13.1 Tickets

Every slice is filed under [Session Feedback: implementation](https://github.com/CloudNativeBergen/website/issues/1427), with the dependencies above as native blocking edges.

| Slice | Issue |
| ----- | ----- |
| F1a   | #1428 |
| F1b   | #1429 |
| F1c   | #1430 |
| F2    | #1431 |
| F3    | #1432 |
| F4    | #1433 |
| F5    | #1434 |
| F6    | #1435 |
| F7    | #1436 |
| F8    | #1437 |
| F9    | #1438 |

## 14. Verification

Per `AGENTS.md` ("Agent discipline"):

- **Guards are sabotage-proven:** for each refusal in §7.4, §9.1, §10.3 and §10.4 (rotation),
  remove the guard, show the specific test fails on a value (the write
  happening), restore.
- **Guard before fetch:** a test asserts no talk-specific read or write runs for
  a code of another tenant, and that the refusal is identical to an unknown
  code.
- **The cookie path, in two parts** (_Refinement (spec):_ there is no CI
  end-to-end harness for this; Playwright in `e2e/` runs auth specs only and
  isn't in CI, and there is no writable scratch dataset):
  1. a vitest test of the Server Action module that asserts the `Set-Cookie`
     attributes (`Path=/f`, httpOnly, `SameSite=Lax`, max-age) and replays the
     set cookie into a second call, showing it updates the same document;
  2. a recorded browser run (scan, tap, reload shows Answered, tap again changes
     it, delete), filed in the **F2** PR. A Vercel preview resolves to the live
     production conference, and no real window is open before the event, so the
     run needs a **test conference with a slot open now**, set up by the user
     (production writes are the user's call); the test responses are deleted
     afterwards. If none is available, the PR says so and the box stays
     unticked.
- **Executed GROQ, not mocks,** for the slot query (including a draft schedule
  and a `drafts.` talk that must not count), the code index, the totals and the
  fold.
- **Deterministic ids:** the same token and talk give the same id; a different
  token or talk gives a different one; a forged cookie is replaced.
- **Concurrency on a real client:** two first submits from one device converge
  on one document; a resubmit never clears `hiddenAt`/`flaggedAt`.
- **Fold:** on the real `@sanity/mutator` (`serialize()` of the built
  transaction), a first fold of a talk with no `feedbackFolded` counts every
  response; a response removed between plan and commit aborts the chunk; a
  crash between chunks neither double-counts nor loses a response; a second run
  commits nothing. Same for the erasure branch.
- **Stale draft:** publishing a draft that predates a rotation keeps the new
  code, including a draft created between the write's read and its commit
  (caught by the sweep, §4.2), and a release version found with the pinned API
  version.
- **Studio Duplicate:** asserted on the real exported Studio config.
- **Visual:** every new or changed component has a story; captures at phone
  width, light and dark, with the dark-mode mechanism of the story file checked.

## 15. Known gaps and risks

- **Getting round Hide:** deleting an answer and submitting again, or answering
  from a private window, produces a fresh, unhidden comment. Accepted
  (_Decided in review_, R2); organizers hide it again.
- **Plan overage:** whether the Growth Non-Profit plan bills overage or
  hard-caps was not verified; the estimate is 10k–30k live requests per edition
  against ~130k monthly headroom. Every submit is one billable write and there
  is no IP limit, so a sustained scripted flood of submits costs quota for every
  tenant until organizers notice. Each submit also costs one by-id talk read
  and one response refill read (§7.4). Random codes and repeated page loads
  cost no live reads (§5.1, §7.4).
- **Late summaries:** the summary cron has no lookback, so an edition that ends
  after F1c ships but before F8 ships gets its summaries when F8 ships. Ship F8
  before the next edition, or accept the delay.
- **A version published inside a write's sweep:** a draft or release version
  created and published between a mint, rotation or fold and its sweep (§4.2)
  can still write an old value back. The window is a few hundred milliseconds.
- **Document count:** 200–3,000 responses per edition against a 25k or 50k
  limit (Sanity's pages disagree; 7,161 used on 2026-10-17). The 24-month fold
  bounds it.
- **A domain change mid-edition** breaks printed codes; a reprint fixes it.
- **A cleared cookie** produces a second response from the same person.
- **No IP limit:** a scripted flood is only remedied after the fact (Remove,
  bulk by time range). Revisit with proof of attendance if abuse appears.
- **Exact comment times** in a small room, with live polling, can hint at who
  wrote a comment. Times are shown as decided
  ([#1421](https://github.com/CloudNativeBergen/website/issues/1421)).

## 16. Decided in review

- **R1. Delete my answer after the window closes.** The decided copy said that
  after the window answers "can't be linked to you", which is false while the
  30-day cookie lives. The user chose to keep **Delete my answer** working for
  as long as the cookie is valid, and to word the copy accordingly (§7.4, §8).
- **R2. Getting round Hide.** Deleting and resubmitting (or a private window)
  brings a hidden comment back as a new one. The user accepted this as a known
  gap rather than adding a tombstone document; the page is never told a comment
  was hidden (§7.4, §15).
- **R3. The speaker's QR waits for F1c.** F1b's note on #1429 asked to show
  speakers their Feedback Code once `/f/<code>` existed. Because the F1b page
  cannot take an answer (its buttons are disabled until Submit, F1c), the user
  chose to keep `ATTENDEE_PAGE_LIVE` off until F1c, so no printed QR leads to
  a form that cannot be answered (§9.1).
