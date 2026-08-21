# Messaging UX Flows & Decision Log

## Overview

This is the **UX-facing companion** to `MESSAGING_SYSTEM.md` (architecture). It
maps the surfaces a speaker or organizer actually touches, walks the key flows,
and records every maintainer-locked design decision with its rationale. The
centerpiece is the **archive/mute precedence table** — the single source of truth
for "do I hear about this?", derived from the fan-out in
`src/lib/messaging/notify.ts`.

Audiences: **speakers** (CFP surface, `/cfp/**`) and **organizers** (admin surface,
`/admin/**`, `isOrganizer === true`). The same `ConversationThread` renders for
both; audience only changes wording, which controls appear, and the deep-link
surface.

## Surface map

| Surface                    | Where                                                                                                                                        | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Notification bell**      | `NotificationBell` in `DashboardLayout` (mobile bar + desktop header, backing both CFP & admin) and the public `Header` (`PublicHeaderBell`) | Polls `unreadCount` (30s + focus), shows a red `9+`-capped badge, bridges a rising count into a toast (suppressed while impersonating). **Counts unread notifications (threads), not messages.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Notification panel**     | `NotificationPanel` / `NotificationList` (opens from the bell)                                                                               | Paginated hub list; each item is a `<Link>` to its deep link that marks itself read on click. Header has "Mark all read" + a settings gear → `/cfp/profile#notification-settings`; an audience-aware "Messages" quick-link (`/admin/messages` or `/cfp/messages`).                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Speaker inbox**          | `/cfp/messages` → `MessagesInbox audience="speaker" allowNew`                                                                                | Segmented pill tabs: **`active`**, **`archived`**. "New conversation" opens `NewConversationForm` (no recipient picker — the speaker is the subject).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Organizer workspace**    | `/admin/messages` **and** `/admin/messages/[id]` → `MessagesWorkspace` (list rail `MessagesInbox variant="rail"` \| thread \| proposal pane) | Scrollable tablist, triage first: **`needs-reply`** ("Needs reply", the leading tab AND the default landing view), **`active`**, **`my-teams`** ("My teams"), **`unassigned`**, **`mine`**, **`resolved`**, **`archived`**. The landing view is the canonical no-param URL state, so `/admin/messages` and `/admin/messages?view=needs-reply` are the same view. `all` is a server capability, deliberately **not** surfaced as a tab. The **My teams** tab (TEAMS-3) appears only when a team lens is configured and shows threads routed to a team the viewer belongs to. Rows show counterpart, unread pill, "Needs reply" dot, `Resolved` chip, an assignee badge, and (TEAMS-3) an indigo routing-team chip. |
| **Inbox rows**             | `ConversationList`                                                                                                                           | One `<Link>` per row to `conversationLinkPath(item, isOrganizer)` — except inside `MessagesWorkspace`, which passes `hrefFor` so **every** row (proposal threads included) stays on `/admin/messages/<conversationId>`, and `selectedId` to mark the open row `aria-current="page"`; in the Archived view rows gain an inline **Unarchive** (organizer lifts both global + per-user; speaker lifts per-user). Organizer rows carry a **team chip** (TEAMS-3, `deriveThreadTeamChip`): the sponsor thread's chip shows the `sponsors`-team title (falling back to "Sponsor"), and a `cfp`-routed thread shows the named `cfp`-team chip — orthogonal to the gray type chip.                                        |
| **Thread page**            | `/cfp/messages/[id]` → `ConversationThread … fillHeight`; `/admin/messages/[id]` → `MessagesWorkspace conversationId`                        | The speaker route is a standalone thread. The organizer route renders the SAME three-pane workspace as `/admin/messages` with that conversation selected — the URL is unchanged because it is the link string persisted on `notification` documents. Each page redirects a wrong-audience session to the correct surface (see "C9" in the architecture doc).                                                                                                                                                                                                                                                                                                                                                      |
| **Proposal thread embed**  | `ProposalMessagesSection` under `#messages` on `/cfp/proposal/[id]` — the SPEAKER side only                                                  | The "Messages" card; the deterministic proposal thread is auto-created on first send. The organizer proposal page has no embed: organizers read in the workspace (next row).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Proposal Message (⌘M)**  | The "Message" action in `AdminActionBar` on `/admin/proposals/[id]`                                                                          | The organizer proposal page's ONLY messaging entry point (also `⌘M`, alongside `⌘E` edit / `⌘P` preview). Navigates to `/admin/messages/<conversationId>` — the workspace, which shows the proposal context beside the thread. It does not open a modal or an overlay: the page is the proposal, so a reader that re-renders the proposal on top of it is duplication. `ProposalMessagesRedirect` forwards the legacy `#messages` fragment to the same place.                                                                                                                                                                                                                                                     |
| **Per-conversation prefs** | Thread header — `PreferencesBar` (speaker) / `OrganizerThreadControls` overflow (organizer)                                                  | Mute, email override (Default/Always/Never), "Archive for me"; organizers additionally get Resolve/Reopen, Assign, and "Archive for everyone". All disabled while impersonating.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Global email setting**   | `CFPProfilePage` `#notification-settings` ("Message emails" switch) + `PushNotificationSettings`                                             | Sets `messagingEmailDefault` (absent-means-on). The anchor is the target of every "manage preferences" link.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **UserMenu**               | `UserMenu` (in `DashboardLayout` header)                                                                                                     | Speakers get a "Messages" (`/cfp/messages`) entry inline; organizers get it in the "Admin" section (`/admin/messages`) — **`isOrganizer` wins, Messages never appears twice**. No separate notifications entry (that's the bell).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### The organizer three-pane surface

`/admin/messages` is a mail client, not a list that navigates away.

| Pane          | Component                                    | Notes                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Conversations | `MessagesInbox variant="rail"`               | The tabs and rows of the organizer inbox in a `lg:w-72 xl:w-80` rail that scrolls on its own; the "New conversation" button becomes icon-only from `lg` up.                                                                                                                |
| Thread        | `ConversationThread … fillHeight fillParent` | `fillParent` makes the list take the remaining height so the composer pins to the bottom of the pane (the speaker page keeps the content-sized `fillHeight`).                                                                                                              |
| Proposal      | `ProposalContextPane`                        | READ-ONLY, and only for a proposal-attached conversation: title, status, speakers, format, schedule slot, travel-funding flag, and a link OUT to the editor. No edits and no status actions live here — `/admin/proposals/<id>` stays the single place a proposal changes. |

**Panes come from the URL, never from state** (`src/lib/messaging/panes.ts`):
`/admin/messages` = list · `/admin/messages/<id>` = thread ·
`/admin/messages/<id>?pane=proposal` = proposal. From `lg` up all three sit side
by side; below `lg` exactly one is on screen and the others are hidden with
plain CSS keyed on that step, so a notification link opens the right step
directly with no media-query hook and no first-paint flash. `?pane=` is
additive — a stored link that omits it lands on the thread, as it always did.

**Not the slide-over.** `MessageSlideOver` (`?messageId=`, mounted layout-wide by
`AdminLayout`) is a different surface for reading a thread from some OTHER admin
page. It is suppressed on `/admin/messages*` (`isMessagesSurface`) so the two
never stack the same thread twice, and **nothing opens it today**: the proposal
page — the only surface that ever did — now navigates to the workspace instead,
because the slide-over's proposal rail re-rendered the proposal the organizer was
already looking at. It is kept for an admin page with no messaging surface of its
own (a list row, a sponsor table).

## Key flows

### First contact (organizer → speaker)

An organizer opens a proposal, hits **⌘M** (or the "Message" action in the action
bar's overflow menu), lands in the messages workspace on that proposal's thread
with the proposal context pane beside it, types a note,
and sends. The proposal thread is created (deterministic id), the message commits,
and the fan-out reaches the speaker on the hub + push + email (speaker email is
on by default). The speaker's email carries a **"Reply in app"** button to their
standalone thread page (`/cfp/messages/<id>`) — a fragment-free destination that
survives a logged-out open. Opening the thread auto-marks the bell
notification read.

### Speaker question (speaker → organizers)

A speaker opens `#messages` on their proposal (or starts a general thread from
`/cfp/messages`) and sends. Because the **author is a speaker**, the fan-out also
posts **once** to the organizer Slack channel — the single "a human is waiting"
signal that survives even if every organizer has muted their own hub/email. All
organizers receive the hub item; the thread lands in their **`needs-reply`** view.

### Organizer triage

Organizers work the inbox by view: **`needs-reply`** (ball in our court) →
**`mine`** (assigned to me) → **`resolved`** (done) → **`archived`**. On a thread
they **Assign** an owner (weak ref, validated as an organizer), reply, then
**Resolve** — which drops it from `active`/`needs-reply` and stops stale nudges.
Replying to an **unassigned** thread assigns it to you automatically and says so
in a toast ("You now own this thread") — answering a thread IS taking it, and
ownership should not depend on remembering to open the Assign menu.

A thread left unanswered for 3 days generates a **stale nudge** to the assignee
(else the team, else all organizers); if an assigned thread is STILL unanswered 3
days after that, the nudge **escalates** to the team as well, so an owner who is
away cannot silently absorb the whole signal. In the other direction, a thread
where the last word was OURS and the speaker has not replied for 7 days is
**auto-resolved** — the queue should not fill with work that is already done.
A speaker reply to a resolved thread re-surfaces it **and reopens** it (atomically
with the message write), which is also what makes an automated close safe: if we
closed too early, their reply undoes it. An organizer reply does not reopen.

### Decision with comment

A proposal accept/reject with an organizer comment rides the **status rail only** —
the decision comment is delivered through the existing proposal-decision
notification, **not** mirrored as a messaging thread post. The decision-comment
mirror does **not** notify through the messaging channel, so a speaker isn't
double-pinged. There is one status rail per thread; messaging never grows a
second.

### Archive & mute — "do I hear about this?" (centerpiece)

Six independent controls decide whether a new message reaches you, and on which
channel. They are **not** a single toggle — they compose, with a strict
precedence. This table is the truth derived from `notifyNewMessage`:

| #   | Control                                                                              | Scope                           | Suppresses                                                                      | Auto-resurface?                                                                          |
| --- | ------------------------------------------------------------------------------------ | ------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Actor exclusion**                                                                  | this message                    | **all channels** for the author (you're never pinged about your own message)    | n/a                                                                                      |
| 2   | **Conversation mute** (`preference.muted`)                                           | per (conversation, participant) | **hub + push + email** (every per-recipient channel)                            | no — mute persists until unmuted                                                         |
| 3   | **Email override** (`emailOverride`: `off`/`on`/`default`)                           | per (conversation, participant) | **email only** (`off` suppresses; `on` forces; `default` defers to #4)          | n/a                                                                                      |
| 4   | **Global email default** (`messagingEmailDefault`, absent = on)                      | per speaker                     | **email only**, when override is `default`                                      | n/a                                                                                      |
| 5   | **Push category toggle** (`messages`)                                                | per speaker (push prefs)        | **push only** (hub item still appears)                                          | n/a                                                                                      |
| 6   | **Archive** — per-user (`convpref.archivedAt`) or global (`conversation.archivedAt`) | participant / organizer-team    | **nothing** — a visibility hide of the inbox row, not a notification suppressor | **yes** — a new message bumps `lastMessageAt`, un-hiding the row (and it still notifies) |

**Precedence, read top-down:** actor exclusion (1) beats everything; **mute (2)
dominates all per-recipient channels** and short-circuits 3–5; otherwise the hub +
push fire (push additionally gated by 5) and email is decided by 3 then 4. Archive
(6) never gates a notification — archived-but-not-muted still notifies **and**
resurfaces. **Slack sits outside this table entirely:** it fires only for
**speaker-authored** messages, once, to the organizer channel, and is
**mute-independent** (no per-recipient control silences it).

## Decision log

Maintainer-locked decisions. Dated **2026-07-19** unless a decision predates it.

| Decision                                                                            | Rationale                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Two thread shapes: proposal + general.**                                          | A proposal thread is the natural home for talk-specific back-and-forth (deterministic id, one per proposal); general threads cover everything else without inventing a taxonomy.                                                                  |
| **All organizers participate in every thread.**                                     | Organizers act as one team; scoping a thread to a single organizer would drop balls when someone is away. Assignment (not membership) tracks ownership.                                                                                           |
| **Speaker email: absent-means-ON; organizer email: opt-in + org-contact copy.**     | Speakers must not miss an organizer's message, so their email defaults on. Organizers live in the hub/Slack all day, so per-organizer email is noise — one copy to the conference contact address preserves an email trail without N inbox pings. |
| **Mute dominates all channels.**                                                    | A single "leave me alone about this thread" must be unambiguous; a mute that still emailed would betray the user. Mute kills hub + push + email (Slack is not per-recipient).                                                                     |
| **One hub item per thread (collapse); bell counts threads, inbox counts messages.** | The bell should read "3 conversations need you", not "37 messages"; the thread inbox's unread pill sums `coalesce(count, 1)` so a row reads "5 new". Two-level semantics keep both honest.                                                        |
| **No self-notifications.**                                                          | The actor already knows they sent it; notifying them is pure noise and would inflate the bell. Actor is excluded from the recipient set.                                                                                                          |
| **Audience rule: `isOrganizer` wins.**                                              | A user who is both a speaker and an organizer sees the organizer surface/link/views (never a duplicated "Messages" entry, never a `/cfp` link when `/admin` is richer).                                                                           |
| **Settings live at `/cfp/profile#notification-settings`.**                          | One notification-settings home for both audiences; every "manage preferences" link (panel gear, email footer, self-check) points there.                                                                                                           |
| **Lightweight ticketing, not full tickets.**                                        | Status + assignee + derived views on the `conversation` document cover organizer triage without a separate ticket entity, its own lifecycle, or a migration.                                                                                      |
| **Both archive models, timestamp semantics.**                                       | Organizers need a team-wide "handled" hide (global archive); every participant needs a personal "not my problem right now" hide (per-user archive). Both use `archivedAt >= lastMessageAt` so a new message auto-resurfaces with zero writes.     |
| **24-month messaging retention.**                                                   | Messages/conversations are otherwise immortal; a fixed post-conference horizon is the only purge, aligned with the published privacy window.                                                                                                      |
| **Decision comments ride the status rail only.**                                    | A proposal decision + comment is a status event, not a conversation; mirroring it into messaging would double-notify and split the reply surface.                                                                                                 |
| **Toast carries the item title.** _(UI batch)_                                      | A bridged toast that just says "New notification" is useless; surfacing the item title makes it actionable at a glance.                                                                                                                           |
| **Slack fires only for speaker-authored messages, mute-independent.**               | Slack is the organizers' "a human is waiting" signal. Organizer-authored messages don't need it (organizers see the hub); and it must survive any individual's mute, so it ignores per-recipient prefs.                                           |
| **`cfpEmail` reply-fallback is deliberate.**                                        | New-message emails are sent `from: <organizer> <cfpEmail>`, so a speaker who replies **by email** (instead of the in-app button) still reaches the CFP inbox the organizers already watch — a graceful degradation, not a bug.                    |

## Audience extensions

The two-audience (speaker/organizer) model was generalized into a **party model**
(`conversationParticipant`) so additional participant classes join without
special-casing. One extension has SHIPPED; one remains future.

### Sponsor company-threads (portal token) — SHIPPED (G2b)

A sponsor contact joins threads about their sponsorship the way a speaker joins
proposal threads. As built:

- **`conversationType 'sponsor'`** — deterministic `conversation.sponsor.<sfcId>`,
  participants `[{sponsor}, {group:'organizers'}]`; the branch is handled in
  `deriveParties` / `canAccessConversation` / `conversationLinkPath`.
- **Identity** — sponsors authenticate via the **portal token** (public
  `sponsorMessages.{list,send}`, rate-limited, strict contact-name authorship),
  never a `speaker` doc; `message.authorParty` + `authorName` snapshot carry the
  sponsor author (no `author` ref).
- **Links** — organizers reach sponsor threads in `/admin/messages` (a Sponsor
  chip); sponsors reply from the portal Messages section (both portal states).
- **Fan-out** — sponsor-authored → all organizers hub/push (mute-respecting) +
  sales-channel Slack + a `sponsorActivity` log entry; organizer-authored →
  all contact persons emailed from `sponsorEmail` with a portal deep link.

Team routing (TEAMS-2) additionally routes sponsor-thread notifications to the
`sponsors` team when configured (else all organizers).

### Workshop broadcast rail (WorkOS identity boundary) — future

A one-to-many organizer→attendee broadcast for workshops. The hard boundary is
**identity**: workshop attendees live behind **WorkOS** (a different identity
domain from the Sanity `speaker` model messaging is built on), so a broadcast rail
cannot reuse `speaker._id`-keyed recipients, preferences, or the organizer cache.
It would be a **fan-out-only** channel (no per-recipient thread, no reply surface)
layered on the notification hub rather than an extension of `conversation`.

## Related documents

- **`MESSAGING_SYSTEM.md`** — data model, deterministic ids, channel contract,
  link contracts, lifecycle, security.
- **`ADMIN_NOTIFICATION_SYSTEM.md`** — the ephemeral toast system (not the hub).
- **`AGENTS.md` → "In-app notifications"** — the hub rules messaging inherits.
- **`ORGANIZER_TEAMS.md`** — the organizer-teams soft lens (routing / defaults /
  filters, never access control) that the messaging fan-out will route through.
