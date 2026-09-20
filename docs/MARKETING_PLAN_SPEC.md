# Marketing Plan — slice 1 specification

Status: **implementation-ready**, written 2026-09-13 as the destination of
[Wayfinder map: Marketing Plan admin feature (PostHog)](https://github.com/CloudNativeBergen/website/issues/987).
Every section names the ticket that decided it; the ticket holds the reasoning, this document holds
the result. Vocabulary is the marketing section of [`CONTEXT.md`](../CONTEXT.md).

## 1. Scope

Slice 1 delivers, for one conference edition:

- a **Marketing Plan** of **Campaigns** and **Tasks**, seeded from the built-in **Plan Template** or copied
  from a previous edition, shown on a Milestone timeline with a per-Campaign ledger;
- publishing Tasks on two **Channels**: **Bluesky** (integrated, approve-then-publish) and **LinkedIn**
  (manual: copy, post by hand, paste the URL back);
- five non-publishing **Task Kinds** (studio render, speaker outreach, sponsor outreach, event-page
  update, checklist) with Prerequisites between Tasks;
- **Outcomes** per Campaign measured through **PostHog** (replacing Pirsch site-wide) plus Bluesky
  engagement, stored as daily **Snapshots**;
- a per-edition **Marketing Report** with PDF and CSV export;
- an admin-dashboard widget of due and overdue Tasks.

Not in slice 1 (see the map's _Not yet specified_ and _Out of scope_): auto-publish without approval,
AI-drafted copy, further Channels, LinkedIn API integration, attributed Tito purchases, discount-code
attribution, organization-owned Templates, sponsor-facing report sharing, listening/inbox/benchmarking,
paid ads, press CRM.

### 1.1 Dependency on the posting core

The plan **layers on** the [Social media posting dashboard](https://github.com/CloudNativeBergen/website/issues/783)
decisions, none of which are built yet. Slice 1 therefore begins by building the subset it needs
(§9, steps 1–2): the `socialPost`/`socialPostVariant` documents and state machine, the
`SocialPublishAdapter` contract with the Bluesky adapter and the assisted-manual path, the rendition
function, the per-minute due-scan cron. Everything the dashboard map decided is an input here and is
not re-decided.

## 2. Domain model

Decided in [#992](https://github.com/CloudNativeBergen/website/issues/992),
[#993](https://github.com/CloudNativeBergen/website/issues/993),
[#990](https://github.com/CloudNativeBergen/website/issues/990),
[#991](https://github.com/CloudNativeBergen/website/issues/991),
[#1001](https://github.com/CloudNativeBergen/website/issues/1001).

All documents carry `conference` (ref) and are read through the tenant-scoped helpers of
`docs/TENANT_SCOPING.md`, with one exception: `planTemplate` (§2.5) is organization-owned so a
Template can seed several editions, so it carries `organization` (ref) instead and is read with
`ORG_FILTER`.

### 2.1 `marketingPlan`

| Field                    | Type                | Notes                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `conference`             | ref                 | one plan per edition (unique)                                                                                                                                                                                                                                                      |
| `owner`                  | ref → organizer     | delegable; default assignee for Tasks                                                                                                                                                                                                                                              |
| `templateVersion`        | string              | version of the built-in Template that seeded it, or `copy:<sourcePlanId>`                                                                                                                                                                                                          |
| `copiedFrom`             | ref → marketingPlan | optional                                                                                                                                                                                                                                                                           |
| `createdAt`, `updatedAt` | datetime            |                                                                                                                                                                                                                                                                                    |
| `structurallyEdited`     | boolean             | set by a Campaign create/update/delete or a manual Task create (#1083): once the plan diverges from its Template, `templateVersion` describes the seed and not the plan. NOT set by assigning, rescheduling, approving or completing — those are the plan being used, not changed. |
| `lastRedatedAt`          | datetime            | the re-dating sweep's rotation stamp, and the compare-and-set that serializes concurrent re-daters (#1078)                                                                                                                                                                         |

### 2.2 `marketingCampaign`

| Field                               | Type                     | Notes                                                                                                                                       |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `plan`, `conference`                | ref                      | `conference` denormalized for flat scans                                                                                                    |
| `key`                               | string                   | stable Template key (`cfp`, `earlyBird`, …) or `custom-<uuid>`; becomes `utm_campaign`                                                      |
| `title`                             | string                   |                                                                                                                                             |
| `startMilestone`, `startOffsetDays` | enum, number             | window start expressed against a Milestone (§2.6)                                                                                           |
| `endMilestone`, `endOffsetDays`     | enum, number             | window end                                                                                                                                  |
| `startDate`, `endDate`              | date                     | **materialized** from the above at seeding and on Milestone change; `provisional: boolean` flags a fallback date                            |
| `primaryOutcome`                    | enum                     | one of `checkoutClickThrough`, `ticketsSoldInWindow`, `cfpSubmissions`, `sponsorContactClicks`, `attributedSessions`, `blueskyInteractions` |
| `outcomeTargetPage`                 | string                   | required for `attributedSessions`/`sponsorContactClicks`: site path the Outcome counts                                                      |
| `target`                            | number                   | optional; Template default from playbook benchmarks                                                                                         |
| `triggers[]`                        | `{event, taskRecipeKey}` | see §5.3; only Template Campaigns carry them in slice 1                                                                                     |
| `generatedKeys[]`                   | string                   | keys of the Tasks Triggers and expansion created; kept after a Task is deleted so it is never created again (§5.3)                          |
| `optional`                          | boolean                  | Template metadata: seeding asks before creating                                                                                             |

### 2.3 `marketingTask`

| Field                            | Type                             | Notes                                                                                                                                           |
| -------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `campaign`, `plan`, `conference` | ref                              |                                                                                                                                                 |
| `key`                            | string                           | Template recipe key + subject (`speakerCard:<speakerId>:bluesky`) or `custom-<uuid>`; becomes `utm_content`                                     |
| `title`                          | string                           |                                                                                                                                                 |
| `kind`                           | enum                             | `publishing`, `studioRender`, `speakerOutreach`, `sponsorOutreach`, `eventPageUpdate`, `checklist`                                              |
| `channel`                        | enum                             | `linkedin`, `bluesky`; required for `publishing`, optional label for others                                                                     |
| `milestone`, `offsetDays`        | enum, number                     | anchor; absent for Trigger-created Tasks                                                                                                        |
| `dueAt`                          | datetime                         | **only for non-publishing kinds**; publishing Tasks read `variant.scheduledAt`                                                                  |
| `provisional`                    | boolean                          | date came from a Milestone fallback (§2.6)                                                                                                      |
| `status`                         | enum                             | **only for non-publishing kinds**: `open`, `done`, `skipped`; publishing Tasks read `variant.status`                                            |
| `approvedBy`, `approvedAt`       | ref, datetime                    | approval gate; for publishing Tasks approval is the `draft → scheduled` transition on the variant                                               |
| `assignee`                       | ref → organizer                  | defaults to plan owner                                                                                                                          |
| `prerequisites[]`                | ref → marketingTask              | same Campaign only; informational (does not block approval)                                                                                     |
| `variant`                        | ref → socialPostVariant          | publishing kind: created with the Task                                                                                                          |
| `targetPage`                     | string                           | publishing / outreach kinds: site path from the page picker, or custom path on our own domain; the UTM-tagged link is **derived, never stored** |
| `subject`                        | ref → speaker \| sponsor \| talk | what the Task is about; drives placeholders and the studio preselection                                                                         |
| `asset`                          | ref → image asset                | studioRender output; publishing Tasks with a studioRender Prerequisite pull it                                                                  |
| `instructions`                   | text                             | checklist / eventPageUpdate body                                                                                                                |
| `externalUrl`                    | url                              | eventPageUpdate optional pasted URL                                                                                                             |
| `remindedAt`, `overdueNudgedAt`  | datetime                         | reminder idempotency                                                                                                                            |
| `origin`                         | enum                             | `template`, `trigger`, `expansion`, `copy`, `manual`                                                                                            |
| `copyEdited`                     | boolean                          | set when a save changes the post's body: the copy is the organizer's words, and the next edition's copy keeps them (§3.1)                       |

**Publishing Task ↔ variant** (from #993): creating a publishing Task creates a `socialPost`
(body, attachments, `defaultScheduledAt`) with exactly one `socialPostVariant` for the Task's
Channel in `draft`. The Task editor edits that variant through the dashboard editor and validator.
The variant is the source of truth for scheduled time and status; deleting a variant that a Task
references is refused (with a link to the Task); deleting the Task deletes post and variant, unless the
variant is `publishing` (a cron tick holds it) or `published` (the record of a post that went out is
kept, as the posting core rules for every post) — then the Task deletion is refused too.
Whether the variant publishes by API or by hand is derived by the dashboard from the organization's
connections and is never stored on the Task.

Completion rules per Kind (from #992):

| Kind                              | Complete when                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| publishing                        | variant `published` **and** `publishResult.url` present (manual path: URL required, validated against the Channel's domain) |
| studioRender                      | `asset` set                                                                                                                 |
| speakerOutreach / sponsorOutreach | message sent through the messaging system (Task stores the message id)                                                      |
| eventPageUpdate                   | ticked done; `externalUrl` optional                                                                                         |
| checklist                         | ticked done                                                                                                                 |

### 2.4 `marketingSnapshot`

One document per Campaign per day, written by the cron (§6.4):

`campaign`, `conference`, `date`, `primaryOutcomeValue`, `secondary: { attributedSessions,
checkoutClickThrough, blueskyInteractions }`, `perTask[]: { task, sessions, clicks, blueskyLikes,
blueskyReposts, blueskyReplies, blueskyQuotes }`, `source: { posthog: 'ok' | 'unavailable',
bluesky: 'ok' | 'unavailable' }`, `takenAt`. Missing counts are stored as `null`, never `0`.

**Denormalized at write time (#1084):** `campaignKey`, `campaignTitle`, `campaignPrimaryOutcome`,
`campaignTarget`, `campaignStartDate`, `campaignEndDate`, and `taskKey` on each `perTask` row. The
`campaign` reference is **weak** — a strong one would make Sanity refuse to delete the Campaign at
all. Snapshots are therefore matched to Campaigns **by key, not document id**: attribution is already
keyed that way (`utm_campaign=<campaign.key>`, §3.4) and Template keys are stable, so a reseeded
Campaign of the same key inherits its history and one that no longer exists renders as **retired** in
the Report — present per Campaign, excluded from headline totals.

The metadata is not decoration. A value may only carry forward to a later reading that shares its
outcome **and its window**: `strictWindow` counts `cfpSubmissions` and `ticketsSoldInWindow` strictly
inside the Campaign's dates, so a window edit changes what the number counts even though the metric's
name did not. `target` is the exception — a goal the organizer sets, not a property of a past
reading, so the Report takes it from the live Campaign and the denormalized copy serves only retired
ones.

### 2.5 `planTemplate` (schema only in slice 1)

Ships so organization-owned Templates need no migration later; the built-in Template lives in code
(§5). Shape mirrors the code type: `organization`, `name`, `version`, `campaigns[]` with recipes.
No save action, no editor in slice 1.

### 2.6 Milestones (conference schema)

From #1001. Five new optional `date` fields on `conference`, edited in conference settings next to
the CFP and programme dates:

`earlyBirdEndDate`, `registrationCloseDate`, `speakersAnnouncedDate`, `sponsorDeadlineDate`,
`recordingsLiveDate`.

The ticket sales start is **not** a new field. `TICKETS_OPEN` reads the existing
`ticketTargets.salesStartDate`, which the ticket target tracking feature owns and edits
(`TargetConfigEditor`). Marketing reads it and never writes it; no migration, no fallback chain,
and the field is unchanged for the target curve, the status summary, and the sales chart. When it
is unset, or target tracking is disabled, the Milestone resolver applies the fallback below and
flags the date provisional, like any other unset Milestone.

Milestone enum used by Template, Campaign, and Task:

| Milestone            | Field                                     | Fallback when unset        |
| -------------------- | ----------------------------------------- | -------------------------- |
| `CFP_OPEN`           | `cfpStartDate`                            | required field             |
| `CFP_CLOSE`          | `cfpEndDate`                              | required                   |
| `CFP_NOTIFY`         | `cfpNotifyDate`                           | required                   |
| `PROGRAM_PUBLISHED`  | `programDate`                             | required                   |
| `CONFERENCE_START`   | `startDate`                               | required                   |
| `CONFERENCE_END`     | `endDate`                                 | required                   |
| `TICKETS_OPEN`       | `ticketTargets.salesStartDate` (existing) | `CONFERENCE_START − 12 wk` |
| `EARLY_BIRD_END`     | `earlyBirdEndDate`                        | `PROGRAM_PUBLISHED`        |
| `REGISTRATION_CLOSE` | `registrationCloseDate`                   | `CONFERENCE_START − 1 wk`  |
| `SPEAKERS_ANNOUNCED` | `speakersAnnouncedDate`                   | `CFP_NOTIFY + 1 wk`        |
| `SPONSOR_DEADLINE`   | `sponsorDeadlineDate`                     | `CONFERENCE_START − 6 wk`  |
| `RECORDINGS_LIVE`    | `recordingsLiveDate`                      | `CONFERENCE_END + 2 wk`    |

**Unset Milestone rule**: seeded dates are computed from the fallback and flagged `provisional`.
When the field is later set, Tasks that are not yet approved (non-publishing: `open` and unapproved;
publishing: variant in `draft`) move to the real date and lose the flag; approved, scheduled, or
published Tasks stay put. The timeline shows provisional chips with the amber flag from the
prototype and a link to the settings field.

## 3. Behaviour

### 3.1 Plan lifecycle

- **Create**: from the built-in Template (asks which optional Campaigns to include) or by copying a
  previous edition's plan. One plan per edition.
- **Copy** (from #1001): each Task keeps its `milestone`+`offsetDays` (or is re-anchored to the
  nearest Milestone if it was hand-moved) and is re-dated against the new edition with the fallback
  rule. Trigger- and expansion-origin Tasks and recipient-specific outreach Tasks are not copied; the Campaign's `triggers[]` are.
  As built (#1017): re-anchoring only considers Milestones the source edition actually set (a
  fallback date anchors nothing); a Task with no date falls back to its Campaign start. The source is
  a plan of another edition of the same organization. Copy that still reads exactly as the Template
  rendered it is rendered again for the new edition; edited copy is kept with the tagged link
  swapped. Everything restarts as draft/open, assigned to the organizer copying; the countdown is
  expanded afresh. "Unedited" is what the Task recorded (`copyEdited`, set when a save changed the
  body); a Task from before that was recorded falls back to matching the skeleton's shape. The copy
  carries the flag on, so the edition after next still knows whose words they are.
- **Owner** can delegate the plan; owner is the default assignee.

### 3.2 Task lifecycle

- **Publishing**: created → variant `draft` → _approve_ (`draft → scheduled`) → dashboard cron
  publishes (Bluesky) or moves to `awaiting-manual` (LinkedIn) → `published` with URL.
  Failures surface on the Task and notify the assignee (§3.3). Rescheduling in either the Task editor
  or the dashboard edits `variant.scheduledAt`.
- **Manual publishing path (LinkedIn in slice 1)**: at due time the assignee gets a notification
  deep-linking to the copy-ready view (text, downloadable rendition, alt text, tagged link). "Mark as
  posted" **requires** the post URL, validated as `https://www.linkedin.com/...`; it lands in
  `publishResult.url` and an `attempts[]` entry `{outcome: 'manual', by}`.
- **Non-publishing kinds**: `open → done | skipped`, with the completion rule of the Kind.
- **Prerequisites**: shown as "waiting" on the dependent chip/row; a publishing Task with a
  `studioRender` Prerequisite copies the rendered asset into its post attachments when the
  Prerequisite completes (if the post has no attachment yet). Prerequisites never block approval.

### 3.3 Reminders (from #992)

Cron (daily, and the per-minute tick may piggyback) sends through the in-app notification hub with
web push, **to the assignee only**:

- **Due**: when a Task becomes due (publishing: variant enters `awaiting-manual`; other kinds:
  `dueAt` passed and `open`), once (`remindedAt`).
- **Overdue nudge**: 24 h after due if still not complete, once (`overdueNudgedAt`).
- **Failure**: variant enters `failed` → immediate notification with the failure kind.

No email, no Slack in slice 1.

The reminders cron is bounded like `src/app/api/cron/reminders/route.ts`: it selects at most
`MAX_CONFERENCES_PER_RUN` (50) conferences with a plan per run. Up to 25 slots are reserved
for a UTC-day rotating page ordered by plan ID; remaining slots use the oldest
`marketingPlan.lastRemindedAt` first (never-run plans first, then `startDate` as a tie-breaker).
It stamps each plan before processing so a failed run still rotates behind waiting plans.
If the stamp itself fails, reminders still run and their counts are retained, but the conference
result reports the rotation error. The reserved page is independent of those writes: with a stable
plan inventory and daily execution, every plan is served within `ceil(planCount / 25)` days.
Same-day retries or missed daily runs do not guarantee that bound. It processes
conferences sequentially with a per-conference try/catch, caps due and overdue candidates per conference
with a GROQ slice, and sends through `createNotifications`, whose push fan-out is already chunked.
A Task the cap defers is picked up by the next run because its `remindedAt`/`overdueNudgedAt` marker
is still unset.

Implementation decisions (#1015): the overdue clock starts at the Task's due time
(`variant.scheduledAt` for publishing), not at a later manual handoff. The manual-handoff
hook shares the daily cron's revision-guarded `remindedAt` claim; Task-backed variants notify
their assignee, while standalone posts keep their existing creator notification. Task ownership is
also read with the due variant before handoff. If the later routing lookup fails, a confirmed
standalone snapshot still permits creator delivery; Task-backed variants defer to the next healthy
reminder run with their marker unset. Failure of the initial read leaves the scheduled variant
retryable, so a permanently failing later lookup cannot silently discard standalone delivery.
This uses ownership at the initial read during a routing outage; concurrent out-of-band changes to
Task linkage are not atomic with notification delivery. No assignee
means no notification. Completion follows each Kind's asset/message/status rule.

Claims are persisted **before** sending, so concurrent runs cannot send the same reminder.
This is at-most-once delivery: a crash or notification-store failure after claiming can lose
that reminder; the marker is not cleared for an unsafe retry. Failure notifications run directly
after the winning variant transition, with the persisted attempt `_key` identifying the event;
they are not recovered by a daily failure sweep. The three marketing types use the `otherUpdates`
push preference and the hub's existing generic title/message/link renderer.

### 3.4 The tagged link (from #993, #932)

`taggedUrl(task) = conferenceBaseUrl + task.targetPage + '?' + utm_source=<channel>&utm_medium=social&utm_campaign=<campaign.key>&utm_content=<task.key>`

Derived on read; written into the variant's `link` field on every save of the Task editor so the
Bluesky adapter builds its external-embed card from it and the copy-ready view shows it. The page
picker offers: tickets, CFP, programme, speaker (by subject), talk (by subject), sponsor page,
custom path. Links always point at our own domain; the vendor hand-off happens on our page where
the outbound click event fires.

Outreach Tasks use `utm_source=outreach` with the same campaign/content keys and
`utm_medium=social`. `outreach` is a link source, not a publishing Channel.

### 3.5 Outreach Tasks (#1014)

Organizers create a speaker or sponsor outreach Task from its Campaign ledger,
choosing a recipient and destination. `task.get` resolves the code skeleton from
the subject, conference title, and tagged link. The organizer edits the default;
`task.sendOutreach` sends the submitted body through the existing conversation
and notification fan-out. Completion is `messageId`, never a `status` write.

The message, conversation timestamp, and revision-guarded Task reference commit
in one transaction. A failed transaction can be retried; a delivered Task refuses
a second send. Speaker outreach reuses a deterministic per-Task, per-recipient general thread;
sponsor outreach reuses the company's conference relationship thread. Fan-out
runs after the response under the messaging system's never-fail contract.

There are no built-in outreach recipes: recipient choice is explicit. Outreach
Tasks are excluded from copying a plan to another edition, because a recipient's
standing and sponsorship relationship must be selected for that edition.

## 4. Channels

### 4.1 Bluesky (integrated) — from #931

- Credential: an **app password per conference** in a new `bluesky` `SecretFamily`
  (`TENANT_<SLUG>_BLUESKY_IDENTIFIER`, `…_APP_PASSWORD`); OAuth is out of slice 1.
- Adapter: `BlueskyPublishAdapter implements SocialPublishAdapter`, `@atproto/api` pinned
  (0.20.x), `Agent` + `CredentialSession`, **one login per publish**, never retry a login into a 401
  (`createSession` limit 300/day/account).
- Record: `RichText.detectFacets()`, `graphemeLength <= 300` in `constraints`/`validate`, external
  embed `app.bsky.embed.external` with `uri = taggedUrl`, title/description/thumb generated from our
  page metadata (Bluesky does not unfurl). Images ≤ 4, alt text mandatory, ≤ 2,000,000 bytes.
- Result: persist `{uri, cid}` as `publishResult.externalId` and the `bsky.app` URL as
  `publishResult.url`.
- Engagement: unauthenticated `app.bsky.feed.getPosts` on `public.api.bsky.app`, 25 URIs per call,
  from the snapshot cron; `likeCount`, `repostCount`, `replyCount`, `quoteCount`; missing → `null`.

### 4.2 LinkedIn (manual) — from #930, #992

- No API in slice 1. The organization page is a manual Channel: the dashboard's assisted-manual
  mode with the Task layer's required URL.
- A `ManualChannelProvider` is the first `SocialPublishAdapter` implementation for `linkedin`
  (constraints: 3,000 chars, link-in-body allowed; `publish` is never called because the variant is
  manual by derivation). A `LinkedInApiProvider` slots in later behind the same interface.
- The Community Management API application runs as a separate track
  ([#998](https://github.com/CloudNativeBergen/website/issues/998)); its approval starts a 12-month
  build window for slice 2.

## 5. The built-in Plan Template (from #991)

Typed data in code (`src/lib/marketing/template/builtin.ts`), versioned (`version: '2026.1'`),
type-checked placeholders and ceilings, unit-tested against a fixture conference.

### 5.1 Campaigns

Ten, in edition order; the Task table is transcribed from
`docs/research/conference-marketing-playbook.md` §5 (branch `research/conference-marketing-playbook`),
which remains the source of record for offsets, copy skeletons, and benchmarks:

| #   | Campaign                  | Window (Milestone offsets)                         | Primary Outcome                   | Default Target                                                                   | Optional |
| --- | ------------------------- | -------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------- | -------- |
| 1   | Save the date             | `CONFERENCE_START −26 wk` → `−20 wk`               | attributedSessions (home)         | —                                                                                | no       |
| 2   | Sponsor acquisition       | `SPONSOR_DEADLINE −24 wk` → `SPONSOR_DEADLINE`     | sponsorContactClicks              | —                                                                                | **yes**  |
| 3   | CFP                       | `CFP_OPEN` → `CFP_CLOSE +1 d`                      | cfpSubmissions                    | —                                                                                | no       |
| 4   | Tickets open / early bird | `TICKETS_OPEN` → `EARLY_BIRD_END`                  | ticketsSoldInWindow               | 15 % of expected sales                                                           | no       |
| 5   | Keynotes                  | `SPEAKERS_ANNOUNCED −4 wk` → `SPEAKERS_ANNOUNCED`  | attributedSessions (programme)    | —                                                                                | **yes**  |
| 6   | Speakers                  | `CFP_NOTIFY` → `CONFERENCE_START −1 wk`            | attributedSessions (programme)    | —                                                                                | no       |
| 7   | Programme launch          | `PROGRAM_PUBLISHED` → `+2 wk`                      | attributedSessions (programme)    | —                                                                                | no       |
| 8   | Final push                | `CONFERENCE_START −4 wk` → `CONFERENCE_START −1 d` | checkoutClickThrough              | 40–50 % of expected sales sold by −4 wk (shown as ticketsSoldInWindow secondary) | no       |
| 9   | Event week                | `CONFERENCE_START −1 d` → `CONFERENCE_END`         | blueskyInteractions               | —                                                                                | no       |
| 10  | Post-event                | `CONFERENCE_END` → `+6 wk`                         | attributedSessions (recap/videos) | —                                                                                | no       |

### 5.2 Task recipes

Each recipe: `key`, `kind`, `channel`, `milestone`, `offsetDays`, `prerequisites` (recipe keys),
`targetPage`, `subjectSource` (`speaker | sponsor | talk | none`), `skeleton: { linkedin, bluesky }`
with placeholders `{event} {date} {venue} {city} {name} {company} {title} {hook} {tier} {url}
{eventTag}` and an `alt` skeleton. LinkedIn and Bluesky are **sibling recipes** of one beat, never
one cross-posted Task. Every publishing recipe that needs an image is preceded by a `studioRender`
recipe it lists as Prerequisite.

### 5.3 Triggers (event-driven Tasks)

Two in slice 1, listening on the existing domain events:

| Trigger            | Event                                                                                                                                                                                       | Creates                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `sponsorSigned`    | sponsor CRM: `contractStatus` becomes `contract-signed` (or `status` becomes `closed-won`, whichever first) — a new `sponsor.status.changed` domain event published from the CRM transition | `sponsorCardRender` (studioRender, subject = sponsor) + `sponsorCard:linkedin` + `sponsorCard:bluesky`, due +3 d, Prerequisite on the render |
| `speakerConfirmed` | existing `proposal.status.changed` event with the new status = confirmed                                                                                                                    | `speakerCardRender` + `speakerCard:linkedin` + `speakerCard:bluesky` for that speaker, dated by the recurring rule below                     |

Created Tasks are `draft`/`open`, `origin: 'trigger'`, assignee = plan owner. Idempotent per
`(campaign, recipe, subject)`: each created key is appended to the Campaign's `generatedKeys` in the
same transaction, compare-and-set on the Campaign revision, and a key on that list is never generated
again — not by a replayed event, not by the cron, and not after the organizer deleted the Task.
`sponsor.status.changed` is published by every write path that can move a sponsor into
`contract-signed` or `closed-won`; the daily expansion cron also sweeps sponsors that became signed in
the last 7 days, so a failed handler does not lose the cards. A BULK move marks its events `deferred`
and leaves the Tasks to that sweep: building dozens of beats inside one request would take the
mutation past its timeout. Subject placeholders the platform has no value
for (`{hook}`) stay in the draft, and scheduling refuses a body or alt text that still carries one.

### 5.4 Recurring recipes (expansion)

Recipes with `cadence` (`{ from: Milestone+offset, to: Milestone+offset, perWeek: { linkedin, bluesky } }`)
expand into dated Tasks **when the anchor Milestone is known and the subject list exists**:

- speaker cards: expand at `CFP_NOTIFY` over confirmed speakers, LinkedIn 2/wk, Bluesky 3/wk, until
  `CONFERENCE_START −1 wk`, round-robin;
- talk teasers: expand at `PROGRAM_PUBLISHED`, LinkedIn 1/wk, Bluesky 2/wk;
- countdown: expand at plan creation (start date is known), Bluesky daily from `−30 d`, LinkedIn at
  `−3 wk`, `−1 wk`, `−1 d`;
- video drip: expand at `RECORDINGS_LIVE` over recorded talks, Bluesky 1/day, LinkedIn 2/wk, 3 wk.

As built (#1016): a daily cron (`/api/cron/marketing-expansion`) expands each subject cadence over
the subjects that exist by then — confirmed speakers, confirmed talks in the official schedule,
confirmed talks with a recording attachment — so "expand at the Milestone" means "once the list
exists". The cron serves the plans it has left waiting longest first (`marketingPlan.lastExpandedAt`),
so its per-run cap never starves an edition. Subjects are dealt onto the earliest least-used slot at least 24 h ahead (the render's lead
time), compared as instants; a subject with no slot left in the window gets no Task. Expansion Tasks
keep their Milestone anchor; Trigger Tasks do not. The keynote card declares a cadence but no subject
list (there is no keynote format to find keynote speakers by), so it is not expanded.

**Ceilings** (warnings at expansion and at manual scheduling, never hard blocks): LinkedIn ≤ 1/day
outside event week, ≤ 3 countdowns total; Bluesky ≤ 3/day outside event week. Event week is the Event
week Campaign's window; days are Oslo days. Every scheduled post on the Channel counts, whether a Task
owns it or it was written in the posts table, and the expansion deals subjects onto the least busy day
so it does not manufacture its own warnings. They are shown on the timeline and returned by every
scheduling mutation (Task date, approval, variant save and schedule, post default time).

## 6. Measurement

### 6.1 PostHog migration (from #994, #988)

- **Account**: PostHog **EU Cloud**, pay-as-you-go plan. **One project per organization.**
- **Client**: `instrumentation-client.ts` calling `posthog.init` with `api_host` = a Next.js rewrite
  on a non-obvious path (`next.config.ts` `rewrites()` → `https://eu.i.posthog.com` and
  `eu-assets.i.posthog.com`), `ui_host: 'https://eu.posthog.com'`, `defaults: '2026-05-30'`,
  `cookieless_mode: 'on_reject'` with `opt_out_capturing_by_default: true` (hybrid: pending and
  declining visitors are counted cookielessly, `opt_in_capturing()` on Accept sets the cookie).
  **After Accept the init must re-register `conference` and `register_for_session` the landing
  URL's `utm_*`**: opt-in drops pre-consent super properties and starts a client session with no
  entry UTMs (verified, see §6.2),
  `person_profiles: 'identified_only'`, no replay/surveys,
  `autocapture` allowlisted to `[data-ph-capture-attribute-cta]` clicks, `loaded: ph =>
ph.register({ conference })`. The init is **gated** on a server-rendered value (the organization's
  token and the conference id emitted by the layout's `TenantAnalytics` component); absent → no
  init. `conference` is the conference document `_id` (conferences have no slug; the id is what
  the platform keys an edition by, and it is already public in the page payload). Project setting _Web analytics → cookieless_ must be on (it serves the rejecting cohort).
  The banner is decided in [Decide the consent banner for PostHog hybrid mode](https://github.com/CloudNativeBergen/website/issues/1034):
  slim bottom bar, symmetric Accept/Decline, fixed copy, one-year choice per domain, change control on
  the privacy page plus a footer link, privacy-page and subprocessor wording. PostHog is **not loaded**
  under the admin and speaker routes.
- **Token placement**: `organization.analyticsPosthogToken` (public `phc_`), edited in organization
  settings, replaces `conference.analyticsPirschCode`. Read keys: new `analytics` `SecretFamily`
  `{ projectId, apiKey }` (`TENANT_<SLUG>_ANALYTICS_PROJECT_ID`, `…_API_KEY`; personal `phx_` key,
  project-scoped, `query:read`).
- **Event mapping**: `data-pirsch-event="x"` → `data-ph-capture-attribute-cta="x"`,
  `data-pirsch-meta-<k>` → `data-ph-capture-attribute-<k>`; `PIRSCH_EVENTS` → `ANALYTICS_EVENTS` in
  `src/lib/analytics.ts` (same 21 names); per-CTA PostHog **Actions** created in the project for
  named insights; `usePreviewDomGuard` strips the new prefix. Outbound checkout clicks arrive as
  `$autocapture` with `$external_click_url`.
- **Declaration**: `src/app/(main)/privacy/page.tsx` and `src/lib/legal/subprocessors.resolve.ts`
  replace Pirsch with PostHog EU (Frankfurt) and list what is collected: pageviews, CTA clicks, UTM
  parameters, outbound click URLs, host and conference, a daily-salted hash instead of an
  identifier; no cookies or local storage; no IP retention.
- **Cutover**: hard switch per organization — token present ⇒ PostHog loads and Pirsch does not.
  Pirsch code and the `analyticsPirschCode` field are removed once every organization has switched.
  No history migration.
- **Server side**: `posthog-node` client available for future server events (Tito webhook, fog);
  not used by slice 1 beyond wiring.

### 6.2 Attribution query (from #988, conditional on #1000)

Adapter `MarketingAnalyticsProvider` (`src/lib/marketing/analytics/`, house pattern, credentials
injected) with one method `campaignBreakdown({ conference, from, to })` doing a `fetch` to
`https://eu.posthog.com/api/projects/:id/query/` with the HogQL below and typed results.

Primary form (session-entry attribution):

```sql
SELECT coalesce(session.$entry_utm_campaign, '(none)') AS campaign,
       coalesce(session.$entry_utm_content,  '(none)') AS task,
       uniq(events.$session_id)                          AS sessions,
       countIf(event = '$pageview')                      AS pageviews,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-cfp-%')     AS cfp_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'cta-sponsor-%') AS sponsor_clicks,
       countIf(event = '$autocapture' AND properties.cta LIKE 'outbound-%')    AS checkout_clicks
FROM events
WHERE properties.conference = {conference}
  AND timestamp >= toDateTime({date_from}) AND timestamp < toDateTime({date_to})
GROUP BY campaign, task ORDER BY sessions DESC LIMIT 1000
```

**Verified form** ([Task: verify PostHog UTM join on CTA events for the cookieless (rejecting) cohort](https://github.com/CloudNativeBergen/website/issues/1000),
findings in `docs/research/posthog-consent-verification.md` on branch `research/posthog-consent-verification`):
replace the two `session.$entry_*` columns with
`coalesce(properties.utm_campaign, session.$entry_utm_campaign)` and
`coalesce(properties.utm_content, session.$entry_utm_content)`. Cookieless events (pending and
declined) carry no `utm_*` on the click but sit in a server session whose entry UTMs are set, and
a full reload keeps that join; accepted visitors carry the bridged `utm_*` as event properties and
have no entry UTMs. One form, no flag. Server-side cookieless sessions are first-touch per
IP + user agent + host, so same-network visitors share attribution.

Never query up to `now()`: the cron uses `to = startOfToday`.

### 6.3 Outcome computation (from #990)

| Outcome              | Source                                                                                                 | Window                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| checkoutClickThrough | `checkout_clicks` for `campaign = key`                                                                 | first published Task → Campaign end + 7 d |
| attributedSessions   | `sessions` for `campaign = key` (optionally filtered to `outcomeTargetPage` pageviews)                 | same                                      |
| sponsorContactClicks | `sponsor_clicks` for `campaign = key`                                                                  | same                                      |
| cfpSubmissions       | proposals with `createdAt` in window; `attributed` subset where `proposal.utm.campaign = key`          | Campaign start → end (strict)             |
| ticketsSoldInWindow  | existing sales series (`src/lib/tickets/`) between start and end; labelled "in window, not attributed" | strict                                    |
| blueskyInteractions  | Σ over the Campaign's published Bluesky Tasks of likes+reposts+replies+quotes                          | all time for those posts                  |

Secondary panel for every Campaign: attributedSessions, checkoutClickThrough, blueskyInteractions.
Per-Task numbers: same query keyed by `task = task.key`, plus the Task's own Bluesky counts.
LinkedIn Tasks: attribution only. **CFP attribution** requires persisting the landing UTM on the
proposal: a `utm { source, medium, campaign, content }` object on the Zod create input, the `talk`
schema, and a hidden input on the submit form populated from the landing URL.

### 6.4 Snapshot cron

`/api/cron/marketing-snapshots` (daily, 04:00 UTC, `CRON_SECRET`): for each conference with a plan,
one `campaignBreakdown` call for the plan's range, one batched `getPosts` sweep for published
Bluesky variants, then upsert one `marketingSnapshot` per Campaign for yesterday. A tRPC mutation
`marketing.refreshSnapshots` runs the same engine on demand (rate-limited per conference with the
Sanity rate-limit pattern). Views read Snapshots only.

Bounds: the same `MAX_CONFERENCES_PER_RUN` selection and sequential per-conference try/catch as the
reminders cron; per conference, one `campaignBreakdown` call and `getPosts` in batches of 25 URIs
(the Bluesky API ceiling); Snapshot upserts written in Sanity transactions of at most 50 mutations.
The run logs a per-conference summary and never fails the whole run for one conference.

## 7. GUI (from #996, #995)

Route home: `/admin/marketing` becomes the Marketing Plan; the promo studio moves to
`/admin/marketing/studio` and is opened by `studioRender` Tasks with the subject preselected.
Reference layout: variants **A + C** of `prototype/marketing-plan-gui`
(`src/app/(admin)/admin/marketing/_prototype/MarketingPlanPrototype.tsx`), not merged.

- **Timeline (home)**: Milestones on the axis, Campaigns as swimlanes, Tasks as chips shaped by Kind,
  today line, amber flags on provisional dates linking to the missing settings field, "waiting" state
  on chips with open Prerequisites. Header actions: seed/copy plan, open Report, open Studio.
  Quick popover on a chip: assignee, date, approve.
- **Campaign ledger** (`/admin/marketing/campaigns/[id]`): funnel (engagement → link clicks →
  primary Outcome vs Target, vs previous edition), then the Task table with Kind, Channel, due,
  assignee, status, per-Task clicks/interactions.
- **Task editor** (`/admin/marketing/tasks/[id]`): full page. Publishing kind hosts the dashboard's
  variant editor (split-pane composer, single variant) with the derived tagged link, the page
  picker, attachment slot (studio asset / gallery / upload), Channel constraints live; approve
  button. Manual Channel: copy-ready view with "mark as posted" + URL field. Other kinds: their
  completion control (studio launcher, message composer prefilled, checklist).
- **Marketing Report** (`/admin/marketing/report`): six sections — Outcome vs Target summary;
  edition funnel by Channel; timeline curve with Milestones and Campaign windows; top ten Tasks;
  previous-edition comparison; plan health (top while running, bottom afterwards). Grain toggle
  daily/weekly (from daily Snapshots); range picker defaulting to plan start → end + 7 d.
  **Export**: PDF rendered with `@react-pdf/renderer` in the pattern of `src/lib/sponsor-crm/contract-pdf.tsx` (the `src/lib/pdf` module is post-processing only); CSV of Snapshot rows per Campaign/Task.
- **Dashboard widget**: "Marketing due" on the admin home — Tasks due today and overdue, one click
  to the editor.

Access: conference organizers (existing organizer procedures); plan owner can be changed by any
organizer.

## 8. tRPC surface

Router `marketing` (`src/server/routers/marketing.ts`), organizer procedures, Zod schemas in
`src/server/schemas/marketing.ts`:

`plan.get`, `plan.create({ source })` (blank, or built-in `templateVersion` + `includeOptional[]`; was `plan.seed`), `plan.copy({ fromPlanId })`,
`plan.setOwner`, `plan.deletionPreview`, `plan.delete({ confirmTitle? })`;
`campaign.list/get`, `campaign.create`, `campaign.update({ title, target, primaryOutcome, window })`,
`campaign.deletionPreview`, `campaign.delete`; `task.list/get`,
`task.create({ kind, channel?, campaign, subject?, targetPage?, dueAt?, alsoCreateSibling? })`,
`task.update`,
`task.approve`, `task.markPosted({ url })`, `task.complete`, `task.skip`, `task.setAssignee`,
`task.setPrerequisites`, `task.attachAsset`, `task.sendOutreach`; `report.get({ from, to, grain })`,
`report.exportCsv`, `report.exportPdf`; `refreshSnapshots`.

**Campaign editing (#1083).** `campaign.update` never exposes `key`: it is `utm_campaign` in every
published link (§3.4) and the join that re-attaches preserved Snapshots after a delete, so editing it
would silently orphan measurement. Editing a Campaign's window re-materializes `startDate`/`endDate`
but moves **no Tasks** — a Task carries its own anchor (§2.3), and one left outside its band is the
timeline telling the truth. Because `strictWindow` counts `cfpSubmissions` and `ticketsSoldInWindow`
strictly inside those dates, a window change on such a Campaign warns before saving; it never blocks.

**Deletion (#1084).** `plan.delete` and `campaign.delete` are hard deletes of the plan/Campaign, its
Campaigns and its Tasks. `*.deletionPreview` is the single server read that itemises the counts,
decides whether typed confirmation is required (only when published Tasks exist, enforced
server-side) and performs the in-flight check — the delete re-runs it immediately before writing.
The whole delete is refused while any variant is `publishing`; `awaiting-manual` and `published` do
not block, and a published post and its variant survive the Task that referenced them.

Variant editing goes through the posting dashboard's own `social.*` procedures (built in step 2).

## 9. Implementation order

1. **Posting core, data**: `socialPost`, `socialPostVariant`, `socialConnection` schemas; variant
   state machine with CAS claims; per-minute due-scan cron. (dashboard #786, #785)
2. **Posting core, adapters + editor**: `SocialPublishAdapter` types, `BlueskyPublishAdapter`,
   `ManualChannelProvider`, rendition function, assisted-manual state and notification, the
   single-variant editor component. `bluesky` secret family. (dashboard #788, #789; this #931)
3. **PostHog migration**: org token field + settings, `analytics` secret family, rewrites, client
   init, attribute rename, preview guard, Actions, privacy + subprocessor text; switch the platform
   organization. (#994)
4. **Milestones**: five conference fields, settings form, Milestone resolver with fallbacks that
   reads the existing `ticketTargets.salesStartDate` for `TICKETS_OPEN`. (#1001)
5. **Plan model + Template**: `marketingPlan/Campaign/Task/Snapshot/planTemplate` schemas; built-in
   Template data + seeding (Campaign selection, recipes, skeletons, sibling Tasks, Prerequisites,
   provisional dates); copy; Triggers; expansion; ceilings. (#991, #992, #993)
6. **Measurement**: run [#1000](https://github.com/CloudNativeBergen/website/issues/1000) →
   choose the query form; `MarketingAnalyticsProvider`; CFP UTM persistence; snapshot cron +
   refresh. (#990, #988)
7. **GUI**: timeline, ledger, task editor, manual copy-ready view, studio move, reminders cron,
   dashboard widget. (#996, #992)
8. **Report**: sections, grain, exports. (#995)

Steps 3 and 4 are independent of 1–2 and can run in parallel. Step 6 needs PostHog provisioned
([#999](https://github.com/CloudNativeBergen/website/issues/999)).

## 10. Open items carried into implementation

- [#1000](https://github.com/CloudNativeBergen/website/issues/1000) (done): query form in §6.2 is
  the verified `coalesce` form; the Accept bridge in §6 is mandatory.
- [#1034](https://github.com/CloudNativeBergen/website/issues/1034) (decided): consent banner for
  hybrid mode; build it in the same change as the cutover.
- [#999](https://github.com/CloudNativeBergen/website/issues/999): PostHog provisioning.
- [#998](https://github.com/CloudNativeBergen/website/issues/998): LinkedIn API application
  (non-blocking; slice 2 input).
- Tito `save-metadata-parameters` behaviour on hosted checkout (research flag; fog item).

## 11. Repo touchpoints

Where each piece lands, following the conventions found in the repository on 2026-09-13.

| Area                       | Touchpoint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sanity schemas             | one `defineType` per file in `sanity/schemaTypes/`, registered in `sanity/schema.ts`; every marketing type carries a required `conference` ref (model on `workshopAnnouncement.ts`); `planTemplate` carries `organization` (model on `sponsorEmailTemplate.ts`); update `sanity/schema-shape.baseline.json`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Tenant scoping             | all GROQ through `scopedFetch`/`scopedQuery` from `src/lib/sanity/scoped.ts` with `CONFERENCE_FILTER`; the `tenancy/no-unscoped-groq` ESLint rule enforces it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| tRPC                       | `marketingRouter` in `src/server/routers/marketing.ts`, added to `src/server/_app.ts`; `adminProcedure` (org-scoped, fails closed) for everything; Zod in `src/server/schemas/marketing.ts` (`…Schema` consts, nullable+optional = "null clears")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Crons                      | `src/app/api/cron/marketing-snapshots/route.ts` and `src/app/api/cron/marketing-reminders/route.ts`, shaped like `src/app/api/cron/reminders/route.ts` (`CRON_SECRET` bearer check, per-conference try/catch); schedules in `vercel.json`; engines in `src/lib/marketing/{snapshots,reminders}/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Domain events              | `src/lib/events/bus.ts` `eventBus.publish/subscribe`; add `sponsor.status.changed` to `EventTypeMap` in `src/lib/events/types.ts` and publish it from the sponsor CRM transition path (`src/lib/sponsor-crm/state-machine.ts` callers); Trigger handlers in `src/lib/events/handlers/marketingTriggers.ts`, registered in `src/lib/events/registry.ts`; `speakerConfirmed` subscribes to the existing `proposal.status.changed`                                                                                                                                                                                                                                                                                                                                                                                  |
| Notifications              | `createNotifications` in `src/lib/notification/sanity.ts` (push fan-out included); add `marketing_task_due`, `marketing_task_overdue`, `marketing_task_failed` to `NotificationType` in `src/lib/notification/types.ts` and map them in `pushCategoryForNotificationType` (`src/lib/push/send.ts`) (the hub renderer is generic)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Messaging (outreach Kinds) | `createGeneralConversation` / `ensureSponsorConversation` + `addMessage` in `src/lib/messaging/sanity.ts`, then `notifyNewMessage` / `notifySponsorMessage` from `src/lib/messaging/notify.ts`; outreach skeletons use marketing `{token}` placeholders via `resolvePlaceholders` in `src/lib/marketing/placeholders.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Dashboard widget           | `defineWidget` in `src/lib/dashboard/widget-registry.ts` (`MARKETING_DUE_WIDGET`, category `operations`), a case in `src/components/admin/dashboard/widget-renderer.tsx`, component under `src/components/admin/dashboard/widgets/`. Data goes through the batched dashboard read, never a separate query: add `marketing-due` to `DASHBOARD_WIDGET_KEYS` and `DashboardWidgetDataMap` in `src/lib/dashboard/widget-data.ts`, a `marketingDueTasks` root in `DashboardGroqSource`/`DASHBOARD_ROOTS`/`SOURCE_ORDER` in `src/lib/dashboard/aggregate.ts`, the key→root entry in `WIDGET_GROQ_SOURCES`, `shapeMarketingDue` wired in `loadDashboardWidgetData` (`src/lib/dashboard/widget-data.ts`), and a `fetchMarketingDue = () => requestWidgetData('marketing-due')` helper in `src/lib/dashboard/fetchers.ts` |
| Adapters                   | `src/lib/social/provider/` (dashboard core: `types.ts`, `bluesky.ts`, `manual.ts`, `index.ts` factory) and `src/lib/marketing/analytics/` (`types.ts`, `posthog.ts`, `index.ts`); credentials injected at construction, no `process.env` inside providers (`docs/INTEGRATION_ADAPTERS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Secrets                    | add `bluesky` and `analytics` to `SecretFamily` + `FamilyCredentialsMap` in `src/lib/secrets/types.ts`, env mapping in `src/lib/secrets/store.ts`, family segment in `src/lib/secrets/env-per-org.ts`; resolve with `resolveTenantSecrets(orgId, family)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Admin routes               | `src/app/(admin)/admin/marketing/{page,campaigns/[id]/page,tasks/[id]/page,report/page,studio/page}.tsx`; nav entries and ⌘K destinations in `src/lib/admin/registry.ts` (`ADMIN_NAV_SECTIONS`, `ADMIN_DESTINATIONS`); remove the `?variant=` prototype hook from the current marketing page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Studio move                | current `src/app/(admin)/admin/marketing/page.tsx` content (`MarketingTabs`, `SpeakerShare`, `SponsorThankYou`, meme and gallery downloaders, `DownloadableImage`) moves to `/admin/marketing/studio`; `studioRender` Tasks open it with `?speaker=`/`?sponsor=` preselected and "attach to Task" saves the raster as a Sanity image asset onto `task.asset`                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| PostHog client             | `instrumentation-client.ts` at project root; `rewrites()` in `next.config.ts`; gating value emitted by the `TenantAnalytics` component in `src/app/layout.tsx`; attribute rename across `Hero`, `CallToAction`, `ProgramHighlights`, `Sponsors`, `TicketsStatusNotice`, `PhaseCtaRow`, `Header`, `/tickets`; `src/components/admin/preview/usePreviewDomGuard.ts`; `src/lib/analytics.ts`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Organization token         | field on `sanity/schemaTypes/organization.ts` + organization settings UI; Zod in `src/server/schemas/conference.ts` loses `analyticsPirschCode` validation once cutover completes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Conference dates           | `sanity/schemaTypes/conference.ts` fieldset `dates`; editor descriptors in `src/components/admin/EditConferenceCard.tsx`; mutation via `src/server/routers/conference.ts` + `src/server/schemas/conference.ts`; Milestone resolver in `src/lib/marketing/milestones.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| CFP attribution            | optional `utm` object on `talk.ts`, on `ProposalInputBaseSchema`/`ProposalDraftSchema` in `src/server/schemas/proposal.ts`, read from `searchParams` in `src/app/(cfp)/cfp/proposal/page.tsx` and passed as hidden input through `src/components/cfp/ProposalForm.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Legal                      | `src/app/(main)/privacy/page.tsx`, `src/lib/legal/subprocessors.resolve.ts` (+ its test)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Report PDF                 | `src/lib/marketing/report-pdf.tsx` with `@react-pdf/renderer` `renderToBuffer`, modelled on `src/lib/sponsor-crm/contract-pdf.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Ticket series              | `src/lib/tickets/` sales series for `ticketsSoldInWindow`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
