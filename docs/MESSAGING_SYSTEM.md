# Messaging System Architecture

## Overview

The messaging system is a **private, per-conference speaker↔organizer conversation**
layer. It replaces the ad-hoc "CC the CFP inbox" email workflow with durable
threads that both sides can read, reply to, mute, archive and (organizer-side)
triage as lightweight tickets. Every notification channel the platform already
owns — the in-app hub, web push, transactional email and the organizer Slack
channel — is wired to it through a single, never-fail fan-out.

Two thread shapes exist:

- **`proposal` threads** hang off one proposal (talk). There is **at most one per
  proposal**, guaranteed by a deterministic document id
  (`conversation.proposal.<proposalId>`) written with `createIfNotExists`, so two
  people opening the thread at once converge on the same document.
- **`general` threads** are free-standing (`creator ↔ organizers`) with a random
  id. An organizer can start one _about/with_ a specific speaker (the
  `subjectSpeaker`); a speaker starting one is implicitly its own subject.

The system was built in milestones (`M1`–`M6`) plus a ticketing layer (`T1`/`T2`)
and a retention pass. The code lives under `src/lib/messaging/*` (server data
layer, fan-out, links, nudge, retention), `src/server/routers/message.ts`
(tRPC), `src/server/schemas/message.ts` (Zod), `sanity/schemaTypes/{conversation,
conversationPreference,notification}.ts` (schema) and
`src/components/messaging/*` (UI). It reuses the notification hub
(`src/lib/notification/*`) rather than reinventing a delivery store.

> **In flight:** a parallel batch on branch `fix/messaging-ux-server` changes the
> **email routing** contract (organizer emails default OFF plus one copy to the
> org contact address, decision-comment mirrors stop notifying, reply-to-resolved
> reopens, assignee notifications, and stale nudges move to the `messages` push
> category). This document describes the **post-batch target state** as the
> contract and marks each such rule **_(landing in `fix/messaging-ux-server`)_**.

```text
┌───────────────────────────────────────────────────────────────────────┐
│                        Messaging System                               │
├───────────────────────────────────────────────────────────────────────┤
│  UI (src/components/messaging/*, src/components/admin/SendMessageModal) │
│  ├── ProposalMessagesSection  → #messages embed on both proposal pages │
│  ├── MessagesInbox / ConversationList → /cfp/messages, /admin/messages │
│  ├── ConversationThread(View) → composer + prefs + organizer ticketing │
│  └── SendMessageModal (⌘M)    → organizer posts into a proposal thread │
├───────────────────────────────────────────────────────────────────────┤
│  tRPC  (src/server/routers/message.ts, schemas/message.ts)             │
│  listConversations · getConversation · listMessages · send ·          │
│  setPreference · setStatus · setAssignee · setArchived                 │
├───────────────────────────────────────────────────────────────────────┤
│  Data layer (src/lib/messaging/sanity.ts + links.ts)                   │
│  deterministic ids · view predicates · recipient/authz resolution      │
├───────────────────────────────────────────────────────────────────────┤
│  Fan-out (src/lib/messaging/notify.ts, email.ts) — runAfterResponse    │
│  HUB+push (upsertMessageNotifications) · EMAIL (Resend) · SLACK        │
├───────────────────────────────────────────────────────────────────────┤
│  Jobs: nudge.ts (stale) · retention.ts (24mo) · notification 90d purge │
├───────────────────────────────────────────────────────────────────────┤
│  Sanity: conversation · message · conversationPreference · notification│
└───────────────────────────────────────────────────────────────────────┘
```

## Data model

Four document types participate. Only `message` and `conversation` are
messaging-owned; `conversationPreference` is messaging-owned but keyed to a
speaker, and `notification` is the shared hub document.

### `conversation` (`sanity/schemaTypes/conversation.ts`)

| Field                         | Notes                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`                  | Required ref. The edition this thread belongs to (tenant scope).                                                                                                                                  |
| `conversationType`            | `'proposal'` \| `'general'`.                                                                                                                                                                      |
| `proposal`                    | **Weak** ref to the talk. Required for proposal threads; absent for general.                                                                                                                      |
| `createdBy`                   | **Weak** ref to the starter. Required.                                                                                                                                                            |
| `subjectSpeaker`              | **Weak** ref. Set only when an **organizer** starts a general thread targeting a speaker; unset on speaker-created threads (creator IS the subject).                                              |
| `subject`                     | Stored **explicitly** (proposal threads default it to the talk title at creation) so a thread renders without dereferencing the proposal, and a later title edit never rewrites history. Max 200. |
| `createdAt` / `lastMessageAt` | `lastMessageAt` is bumped in the **same transaction** that adds a message and drives inbox ordering.                                                                                              |
| `status`                      | `'open'` \| `'resolved'`. **Absent means open** — every read `coalesce(status, 'open')`, so pre-ticketing threads need no migration.                                                              |
| `assignedTo`                  | **Weak** ref to the responsible organizer. `null`/absent = unassigned.                                                                                                                            |
| `archivedAt`                  | Global organizer archive (timestamp semantics — see below).                                                                                                                                       |
| `lastStaleNudgeAt`            | Cron bookkeeping (hidden, read-only).                                                                                                                                                             |

### `message` (created in `src/lib/messaging/sanity.ts`)

`_id` `message.<nanoid>`, with `conversation` (strong ref), `author` (ref), `body`
(≤5000, trimmed), `createdAt`. `addMessage` creates the message **and** patches
the parent `lastMessageAt` in one transaction so the two can never drift. Messages
carry **no per-document retention** — they are immortal until the whole conference
ages out (see Lifecycle).

### `conversationPreference` (`sanity/schemaTypes/conversationPreference.ts`)

Exactly **one document per `(conversation, speaker)` pair**, addressed by the
deterministic id `convpref.<conversationId>.<speakerId>` and written with
`createIfNotExists` + a follow-up patch. This doc-per-pair model exists precisely
to **avoid a read-modify-write race** on a shared preferences array: two
participants (or two devices) editing their own preference can never clobber each
other. Fields: `muted` (bool), `emailOverride` (`default`\|`on`\|`off`),
`archivedAt` (per-user archive).

### `notification` (`sanity/schemaTypes/notification.ts`)

The shared hub document, fanned out **one per recipient** so `readAt` is naturally
per-user. Messaging uses two of its types:

- **`message_received`** — the **collapse model** (M5): one **persistent** document
  per `(recipient, conversation)` with deterministic id
  `notification.message.<conversationId>.<recipientId>`. Every new message
  re-surfaces that one document instead of stacking a new one — `createdAt` bumps
  to now, `readAt` is unset, and `count` tracks how many unread messages it
  represents (unread accumulates; a read document resets to 1; **absent count = 1**,
  which also covers pre-collapse per-message docs).
- **`message_stale`** — one-shot, emitted by the stale-nudge cron.

### Deterministic-id schemes

| Id                                                    | Purpose                         | Race safety                                        |
| ----------------------------------------------------- | ------------------------------- | -------------------------------------------------- |
| `conversation.proposal.<proposalId>`                  | The single proposal thread      | `createIfNotExists` — concurrent starters converge |
| `conversation.sponsor.<sfcId>`                        | The single sponsor thread (G2b) | `createIfNotExists` — portal + organizer converge  |
| `convpref.<conversationId>.<speakerId>`               | One preference per participant  | doc-per-pair, no array RMW                         |
| `notification.message.<conversationId>.<recipientId>` | The one collapsed hub item      | `createIfNotExists` + patch                        |

`conversation.<nanoid>` (general threads) and `message.<nanoid>` are random —
there is nothing to converge on.

### Weak references and GDPR

Every human-pointing reference is **weak** (`_weak: true`):
`conversation.createdBy`, `subjectSpeaker`, `assignedTo`, `proposal`, and the
hub's `recipient`, `actor`, `relatedProposal`. Weak refs let a speaker be **erased
for GDPR** (or a proposal deleted) without an orphan-block on the delete — a
dangling ref is tolerated. Reads that dereference a dangling ref simply yield
`null` (the GROQ projections coalesce to `'Speaker'` / `'Organizers'` labels).
`conversationPreference.conversation` and `message.conversation` are the only
**strong** refs, which is why the retention/cascade paths delete those documents
**before** the conversation they point at (a strong referrer would 409 the parent
delete).

### "Absent means X" conventions

The model leans on absence so pre-existing documents never need backfilling:

- **`status` absent → `'open'`** (coalesced on every read).
- **`count` absent → `1`** (the inbox sums `coalesce(count, 1)`).
- **`messagingEmailDefault` absent → email ON** for that speaker (only an explicit
  `false` disables the default-path email).
- **Preference absent → `{ muted: false, emailOverride: 'default' }`**
  (`DEFAULT_CONVERSATION_PREFERENCE`).
- **`archivedAt` absent → not archived**.
- **`readAt` absent → unread**.

### The TIMESTAMP-ARCHIVE trick

Both archive models — the **global** organizer archive (`conversation.archivedAt`)
and the **per-user** archive (`conversationPreference.archivedAt`) — use the same
rule:

> A thread is archived **iff `archivedAt >= lastMessageAt`.**

Archiving stamps `archivedAt = now` (which is ≥ the current `lastMessageAt`).
When a **new message** bumps `lastMessageAt` past `archivedAt`, the thread
**auto-resurfaces** with **zero fan-out writes** — no archived flag to flip, no
sweep. Un-archiving simply unsets the field. The inbox filter expresses this
directly as GROQ (`src/lib/messaging/sanity.ts`):

```groq
// global:   archived iff defined(archivedAt) && archivedAt >= lastMessageAt
// per-user: a correlated probe on convpref.<^._id>.<caller>
count(*[_id == 'convpref.' + ^._id + '.' + $speakerId
        && defined(archivedAt) && archivedAt >= ^.lastMessageAt]) > 0
```

The same comparison is recomputed in JS on each returned row to set the display
`archived` boolean, so filtering and rendering can never disagree.

## Ticketing layer

Ticketing is deliberately **lightweight** — a status flag, an assignee, and a set
of inbox views derived on the fly — not a full ticket entity. All state lives on
the `conversation` document; there is no separate ticket document.

### Status / assignee / needs-reply derivation

- **`status`** is `open`/`resolved`, organizer-set via `message.setStatus`.
  Resolving drops a thread out of the organizer `active`/`needs-reply` views and
  stops stale nudges.
- **`assignedTo`** is a weak ref to an organizer, validated against the organizer
  id set in the router. `null` unassigns.
- **`needsReply`** is **derived, never stored**: a thread needs an organizer reply
  when it is not resolved **and** its last message's author is not an organizer.
  The last-author projection (`LAST_AUTHOR_REF`) is **exported from one place** and
  imported by both the inbox filter and the stale-nudge job, so the two can never
  drift on "whose court is the ball in".

**The empty-organizer guard.** Both the GROQ filter (`count($organizerIds) > 0`)
and the JS derivation (`organizerSet.size > 0`) refuse to compute needs-reply when
the organizer set is empty. This is load-bearing: with an empty set, `author in
[]` is false, so `!(author in organizers)` is **vacuously true for every thread** —
a misconfigured conference (or a transient organizer-fetch failure) would flood the
needs-reply view and misroute nudges. No organizers means nobody can reply, so
needs-reply is empty. The organizer cache only stores **successful** reads for
exactly this reason (a failed fetch is never poisoned in as an empty set).

### The six views

Requested via `ListConversationsSchema.view`; semantics in
`src/lib/messaging/types.ts` and enforced in `buildViewPredicate`. Organizers may
use all six; a **speaker is restricted** to `active`/`archived`/`all`
(`SPEAKER_ALLOWED_VIEWS`) and the router rejects the organizer-only views with
`BAD_REQUEST` rather than silently coercing.

| View          | Organizer semantics                                              | Speaker semantics      |
| ------------- | ---------------------------------------------------------------- | ---------------------- |
| `active`      | open **and** not globally archived **and** not per-user archived | not per-user archived  |
| `needs-reply` | active **and** last author is not an organizer                   | _(rejected)_           |
| `mine`        | active **and** `assignedTo == caller`                            | _(rejected)_           |
| `resolved`    | resolved **and** not archived (global or per-user)               | _(rejected)_           |
| `archived`    | globally **or** per-user archived                                | per-user archived only |
| `all`         | everything, no filter                                            | everything, no filter  |

Global archive is an **organizer-side hide**, so a speaker keeps seeing a
globally-archived thread; only their **own** per-user archive hides it from them.
Every view filter is ANDed into the base predicate **before** the `order | slice`,
because per-user archive lives in a separate document — filtering after the slice
would silently shrink pages.

### Stale-nudge policy (`src/lib/messaging/nudge.ts`)

A daily cron nudges threads where the ball has sat in the organizers' court. A
conversation is nudged when it is **open**, **not globally archived**, its **last
message is from a non-organizer**, and it has had **no activity for
`STALE_AFTER_DAYS` (3) days**. The nudge is one `message_stale` hub notification
routed **to the assignee when set, else to every organizer**, deep-linked to the
admin thread. `lastStaleNudgeAt` is then stamped so the thread is not nudged again
**until a newer message arrives** (`lastStaleNudgeAt < lastMessageAt` re-arms it).
A thread with no resolvable conference, or no assignee **and** no organizers, is
skipped **without** stamping (so it retries once organizers exist). The run is
capped at `MAX_CONVERSATIONS_PER_RUN` (200), never throws, and isolates each
thread. _(Post-batch, `message_stale` push moves to the `messages` category —
landing in `fix/messaging-ux-server`.)_

## Channel matrix (the delivery contract)

A committed message fans out through `notifyNewMessage`
(`src/lib/messaging/notify.ts`), **detached from the response path** via
`runAfterResponse` (A8): the message is already committed and returned before the
fan-out runs, so a large recipient set can never hang the Send button. The whole
fan-out is wrapped in the **never-fail envelope** — any failure is caught and
logged and can never fail the (already committed) write.

**Recipients** = every participant **except the actor** (actor exclusion mirrors
the hub rule — you are never notified about your own message). Participants are:
proposal threads → proposal speakers ∪ organizers; general threads → creator ∪
subjectSpeaker ∪ organizers.

### Contract table (per new message)

Columns are the recipient's per-conversation state. "hub", "push", "email",
"slack" are the channels.

| Recipient state                                                    | Hub | Push | Email                                                               | Slack                         |
| ------------------------------------------------------------------ | --- | ---- | ------------------------------------------------------------------- | ----------------------------- |
| **Actor** (message author)                                         | —   | —    | —                                                                   | see note                      |
| **Muted** (`preference.muted`)                                     | —   | —    | —                                                                   | n/a                           |
| Speaker, `emailOverride: default`, `messagingEmailDefault ≠ false` | ✔   | ✔    | ✔                                                                   | n/a                           |
| Speaker, `emailOverride: off`                                      | ✔   | ✔    | —                                                                   | n/a                           |
| Speaker, `emailOverride: on`                                       | ✔   | ✔    | ✔                                                                   | n/a                           |
| **Organizer**, `emailOverride: default`                            | ✔   | ✔    | **—** _(post-batch: off by default; one copy to org-contact email)_ | n/a                           |
| Organizer, `emailOverride: on`                                     | ✔   | ✔    | ✔                                                                   | n/a                           |
| **Author is a speaker** (any recipient)                            | —   | —    | —                                                                   | **✔ one post to CFP channel** |
| **Author is an organizer**                                         | —   | —    | —                                                                   | **—**                         |

Notes on each channel:

- **HUB + push collapse.** Hub delivery is `upsertMessageNotifications`: **one
  collapsed document per (recipient, conversation)**, re-surfaced on every message,
  with a **per-recipient audience link** (organizers → `/admin`, speakers →
  `/cfp`). Web push rides inside the same upsert (category `messages`) with a
  **stable tag `msg:<convId>`** so successive pushes for a thread **replace** each
  other on the device instead of stacking N lock-screen notifications while the hub
  shows one collapsed item. Per-recipient upserts are chunked (10) and committed via
  `Promise.allSettled`, so one malformed recipient ref cannot fail the whole
  fan-out, and push fires only for chunks that actually committed. **Push carries an
  extra gate:** `deliverPushToRecipient` maps `message_received → 'messages'`
  (`pushCategoryForNotificationType`) and drops the push if the recipient turned
  that category off (`state.preferences['messages']`) — independent of the hub item,
  which still appears. Push is also a no-op when VAPID is unconfigured, and prunes
  `404`/`410` (gone) subscriptions.
- **EMAIL.** Sent to non-muted recipients whose **effective** email pref is ON.
  For a speaker: `emailOverride === 'on'`, or `'default'` **and**
  `messagingEmailDefault !== false` (absent-means-on). Delivery is bounded to
  `EMAIL_CONCURRENCY` (3) in-flight sends via a worker pool (`sendMessageEmails`),
  each `sendOne` is never-fail and wrapped in `retryWithBackoff` (absorbs Resend
  429s). The per-recipient `replyUrl` matches that recipient's audience surface,
  and the body copy is audience-correct (`isOrganizer`). _Post-batch:_ organizer
  email **defaults OFF**, and a single copy of the notification goes to the
  conference contact address instead of each organizer — landing in
  `fix/messaging-ux-server`.
- **SLACK.** Fires **only for speaker-authored** messages (`!authorIsOrganizer`),
  one post to `conference.cfpNotificationChannel`, and is **independent of every
  per-recipient preference** — muting your own hub/email does not silence the
  organizer channel. All interpolated fields are `escapeMrkdwn`-escaped. Slack is
  the one channel that is **mute-independent**.
- **Rate limits.** `message.send` is throttled per speaker
  (`SEND_MAX_IN_WINDOW = 10` per `SEND_WINDOW_MS = 60s`), claimed **only after**
  authz/validation (only a committed send triggers the Slack + N-email
  amplification). The map is size-capped (`MAX_RATE_ENTRIES = 10_000`). This is
  per warm serverless instance, with the email/Slack providers rate-limiting
  further downstream.

### Auto-mark-read

Opening a thread clears its `message_received` notifications for the bell:
`ConversationThread` calls `notification.markReadByLink` with **both** audience
link variants (a recipient only ever received one) once messages load, again on
regained focus, and again when the newest message id advances while the tab is
visible. It never fires while impersonating (that would corrupt the real
speaker's unread state).

## Link contracts

The deep-link contract is a **pure** helper (`conversationLinkPath` in
`src/lib/messaging/links.ts`) deliberately kept **outside** the `server-only`
data layer so client components can derive links without pulling the server bundle
into the browser. It resolves an app-relative path from `(type, proposalId,
isOrganizer)`:

| Thread   | Organizer                          | Speaker                          |
| -------- | ---------------------------------- | -------------------------------- |
| proposal | `/admin/proposals/<id>#messages`   | `/cfp/proposal/<id>#messages`    |
| general  | `/admin/messages/<conversationId>` | `/cfp/messages/<conversationId>` |

- **Audience derivation.** The recipient's audience is the **server-derived**
  organizer id set (`organizerSet.has(id)`) — never client input.
- **Per-recipient fan-out links.** Each hub item / email carries the link for
  **that** recipient's surface, so an organizer and a speaker on the same thread
  get different links to the same conversation.
- **`markReadByLink`.** The auto-clear matches on `link in $links` (bounded to 8),
  filtered by `recipient._ref == caller` — the recipient filter **is** the
  ownership guard, so a foreign link clears nothing but the caller's own matching
  notifications. Matching by link (both variants) is robust to whichever audience
  the recipient actually received.
- **Proposal `#messages` anchor.** `ProposalMessagesSection` mounts under
  `id="messages"` with `scroll-mt-20`, so a notification/email link ending
  `…/#messages` scrolls to the thread card.
- **Audience-correct redirect ("C9").** A recipient can be handed the "wrong"
  audience's general-thread link (an organizer follows a `/cfp/messages/<id>` link,
  or a speaker a `/admin/…` one). The two standalone thread pages guard against
  this with a **Server-Component `redirect()`**: `/cfp/messages/[id]/page.tsx`
  redirects an organizer (**not** while impersonating) to `/admin/messages/<id>`,
  and `/admin/messages/[id]/page.tsx` redirects a non-organizer speaker to
  `/cfp/messages/<id>`. Impersonation is excluded so an organizer acting as a
  speaker still sees the speaker surface. (Read-marking is **not** done here — it
  happens client-side once `ConversationThread` mounts.) _("C9" is this document's
  label; the code carries no such marker.)_
- **Service-worker tap-through.** `public/sw.js` stores the deep link in
  `notification.data.url` (sanitised to a same-origin app-relative path by
  `sanitizeNotificationUrl`) and, on `notificationclick`, **focuses a tab already
  on that URL, else navigates an open window to it, else opens a new one**. Routing
  uses `data.url` — **the `tag` (`msg:<convId>`) drives only OS-level
  collapse/replacement**, not the tap target. The push `tag`/`url` mirror the pure
  helper `src/lib/pwa/push-payload.ts` (kept in sync by a test).
- **Email → thread page.** `MessageNotificationTemplate` renders a "Reply in app"
  CTA at the per-recipient absolute `replyUrl` (`absoluteLink` →
  `conversationLinkPath`, audience-correct) plus a "Manage notification
  preferences" link at `/cfp/profile#notification-settings` (the same target for
  both audiences, since settings live on the CFP profile). _Post-batch the email
  body links to the standalone thread page — landing in
  `fix/messaging-ux-server`._

## Lifecycle

Two retention horizons and several cascades keep the data honest. All three jobs
run from **one daily cron route** — `src/app/api/cron/cleanup-notifications`
(`vercel.json`: `0 4 * * *`, Bearer `CRON_SECRET`) — in a deliberate order:
**90-day notification purge → 24-month messaging purge → stale nudge**. The
messaging purge runs after the 90-day pass (so aged-out message notifications are
already gone), and the nudge runs last and never throws.

- **90-day notification retention** (`deleteNotificationsOlderThan`,
  `src/lib/notification/sanity.ts`). A daily cron hard-deletes hub notifications
  older than 90 days — **including unread ones**, because the hub is not an
  archive. The **one exception** is an **unread `message_received`** notification:
  it is the only store of a conversation's per-recipient unread state (the messages
  themselves are immortal), so purging it would silently drop the unread signal.
  It is therefore **excluded** from the cutoff until read; once read it ages out
  normally.
- **24-month messaging purge** (`deleteExpiredMessagingData`,
  `src/lib/messaging/retention.ts`). Messages/conversations carry no per-document
  retention, so this horizon is the **only** thing that ever purges a wound-down
  edition. A daily cron deletes **all** messaging data — messages, conversations,
  preferences and the collapsed `message_received` notifications — for every
  conference whose `endDate` is more than `RETENTION_MONTHS` (24) months in the
  past. The privacy page documents this window.
- **Deletion order (strong refs first).** Per conference the delete runs
  `messages → conversationPreferences → conversations → message_received notifications`.
  Both messages **and** preferences strong-ref the conversation, so both must
  precede it or the conversation delete 409s. Notifications carry no stored ref
  and are matched by the conversation's deep link (**both** audience variants).
  Deletes are chunked (`DELETE_CHUNK_SIZE = 100`) under Sanity's per-transaction
  ceiling; each conference is isolated (`MAX_CONFERENCES_PER_RUN = 50`) so one
  edition's failure never blocks the rest.
- **Proposal-delete cascade** (`deleteProposal`, `src/lib/proposal/data/sanity.ts`).
  `conversation` and `notification` are **non-blocking types** (weak refs) so an
  active thread never blocks a proposal delete. The cascade removes, in the same
  strong-refs-first order, the proposal thread's messages → preferences →
  conversation → its `message_received` notifications (matched by deep link, both
  variants) → then invites/reviews/proposal atomically last. Hub notifications that
  merely carry a weak `relatedProposal` are **kept** (the dangling ref renders
  harmlessly).
- **Co-speaker cleanup.** When a co-speaker is removed from a proposal
  (`proposal.ts` removal mutation), `deleteMessageNotificationsFor` deletes their
  collapsed `message_received` notifications for those threads (both read and
  unread) — they would otherwise linger as **permanent phantom unread**: the bell
  keeps counting them, the deep link 403/404s once access is gone, and mark-read can
  never fire because they can no longer open the thread. It is never-fail (runs
  after the committed removal, must not fail it).

## Security model

Multi-tenant isolation and no-oracle authorization are the two pillars.

- **Server-derived identity, always.** No schema carries a `conferenceId` or a
  speaker id from the client — the conference is resolved from the domain, the
  actor is always `ctx.speaker._id`, and recipient/participant sets are derived
  from server-side refs (proposal speakers, organizer ids). A client can never
  target another user or another conference.
- **Authz matrix** (`canAccessConversation`): any organizer; **or** a proposal
  thread where the speaker is on the proposal; **or** a general thread the speaker
  created or is the `subjectSpeaker` of. The organizer-only management mutations
  (`setStatus`/`setAssignee`/`setArchived`) additionally require
  `isOrganizer === true` via `loadManageableConversation`.
- **No existence oracle (A3).** `getConversation`/`listMessages`/`setPreference`
  and the management mutations collapse **absent**, **inaccessible**, and (for
  organizers-only mutations) **non-organizer** into a single `NOT_FOUND`. With
  deterministic proposal-thread ids, this is what prevents a response from
  revealing whether a thread the caller can't see exists.
- **Cross-conference guard (A4/A5).** Posting to a `conversationId` verifies
  `conferenceId` match (a wrong-edition thread would stamp messages with
  wrong-domain links). An organizer-initiated general thread requires the
  recipient to have **standing in this conference** (a talk here, or the organizer
  flag) — matching the admin speaker picker's population, not merely "exists
  somewhere".
- **Send throttle (A2)** as above — claimed only for genuine, committed sends.
- **Slack escaping.** Every interpolated field in a Slack block is passed through
  `escapeMrkdwn`.
- **GDPR.** Weak refs make speaker erasure non-blocking: the admin erase is a bare
  `clientWrite.delete(speakerId)` (`src/server/routers/speaker.ts`) that relies
  entirely on those weak refs — no messaging re-pointing. Erased-speaker docs
  survive with dangling refs (rendered as `Speaker`/`Organizers` labels) until the
  24-month purge or a proposal cascade removes them. Schema `weak: true` only fixes
  **new** writes, so migration **041** (`migrations/041-weak-messaging-refs/`)
  backfills `_weak: true` onto **existing** `message.author`,
  `conversation.createdBy`/`subjectSpeaker`, and `notification.recipient`/`actor`
  refs (idempotent, skips drafts). It is **committed but NOT run by default** — it
  runs via the `Run Sanity Migration` workflow after maintainer review. Until then,
  a speaker who messaged before the schema change can still be an erasure trap on
  those pre-existing strong refs. The 24-month purge is the documented retention
  window.

## Sponsor threads (party model, G2b)

A **third thread shape**, `conversationType: 'sponsor'`, extends the two speaker
shapes with a **sponsor↔organizer** thread. It reuses the whole machinery
(deterministic id, `participants[]` party model, hub/push/email/Slack fan-out,
`ConversationThread`) with these sponsor-specific rules. **Maintainer-locked:**
there is **one thread per `sponsorForConference`** as a UI guarantee — the model
stays multi-thread-general, and the single thread is simply the only id a sponsor
ever gets (`conversation.sponsor.<sfcId>`). No special-casing beyond deriving that
id.

- **Id scheme.** `conversation.sponsor.<sfcId>` (`sponsorConversationId` in
  `links.ts`), created via `ensureSponsorConversation` with `createIfNotExists`, so
  the portal-send and organizer-send paths converge on one document.
- **Participants.** `[{ sponsor: <sfcId> }, { group: 'organizers' }]`, written
  directly at creation (the sponsor party id is not expressible from the legacy
  fields, so `participants[]` is authoritative — `deriveParties` returns only the
  organizers group for a hypothetical participants-less sponsor doc).
- **Author model.** ORGANIZER authors keep the legacy `author` speaker ref +
  speaker `authorParty`. SPONSOR authors have **no speaker doc**: the message
  carries `authorParty = { sponsor }` + an `authorName` **string snapshot** (the
  contact person the portal sender picked) with `author` UNSET. The thread render
  shows `authorName` + a "Sponsor" badge for these.
- **Schema requiredness relaxations.** `conversation.createdBy` and
  `message.author` were **required → optional** (documented in the schema files) —
  a portal-initiated sponsor thread has no speaker creator, and a sponsor-authored
  message has no speaker author. An **organizer-initiated** thread still records the
  acting organizer as `createdBy` (the audit trail names a human when one exists).
  `message.authorName` was **added**. `conversation.conversationType` gained
  `'sponsor'`; `sponsorActivity.activityType` gained `'message'`.
- **Authorization.** The sponsor side is authed **only** by the portal token
  (`validateSponsorMessagingToken`, per-request GROQ on `registrationToken`) — never
  a speaker/organizer session. A SPEAKER accesses a sponsor thread **iff** organizer
  (the existing `canAccessConversation` short-circuit). Speaker-audience inbox
  queries never return sponsor threads: `SPEAKER_SCOPE_PREDICATE` keys on
  `createdBy`/`subjectSpeaker`/`proposal->speakers` (a sponsor thread has none) and
  **also** carries an explicit `conversationType != "sponsor"` guard as
  defence-in-depth. The organizer inbox has no type restriction, so it **includes**
  sponsor threads (amber "Sponsor" chip, counterpart = sponsor company name).
- **Portal API (public, token-authed, rate-limited).** `sponsorMessages.list
{ token }` → validate → thread messages + contact-person names for the author
  picker. `sponsorMessages.send { token, body, authorName }` → validate + rate limit
  - body 1..5000 trimmed + `authorName` **STRICT-matched** to a contact person →
    `ensureSponsorConversation` → `addMessage` (sponsor author) → fan-out. **No
    conversation id is accepted from the client — the token IS the thread selector.**
    Rate limits (module-Map, per-token, per-instance): validate **30/min**, send
    **5/min**.

### Sponsor fan-out matrix (`notifySponsorMessage`)

A sibling of `notifyNewMessage` (integrated, not forked — reuses
`upsertMessageNotifications`, bounded-concurrency email, `createSponsorActivity`).

| Author        | Hub (+push)                                                                                   | Email                                                                                                                                 | Slack                                                                 | Activity                     |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| **Sponsor**   | ALL organizers, title `New message from <name> (Sponsor) — <subject>`, `/admin/messages/<id>` | — (no speaker/contact emails)                                                                                                         | **sales** channel (`sendSalesNotification`, "💬 New sponsor message") | `message` (system)           |
| **Organizer** | the OTHER organizers (author excluded, mute-respected)                                        | ALL `contactPersons` via `sponsorEmail` from-address, deep-linked to the portal (`buildPortalUrl` + `#messages`), bounded concurrency | — (no Slack)                                                          | `message` (acting organizer) |

**Preferences.** `conversationPreference` (mute/email) applies to the ORGANIZER
participants exactly as for speaker threads. **Sponsors have no preference
documents** (no speaker id to key one on) — they always receive the email.

**Hub routing note.** Sponsor hub notifications currently route to **ALL
organizers**. When the sponsors TEAM lands (**TEAMS-2**) this should route to that
team instead of the whole organizer set (noted inline in `notify.ts`).

## Related documents

- **`MESSAGING_UX.md`** — surface map, user flows, the archive/mute precedence
  table, and the full decision log.
- **`AGENTS.md` → "In-app notifications"** — the never-fail / actor-exclusion /
  per-recipient / retention rules this system inherits.
- **`EMAIL_SYSTEM.md`**, **`TRPC_SERVER_ARCHITECTURE.md`**,
  **`PRIVACY_OPERATIONS.md`** — the subsystems messaging reuses.
