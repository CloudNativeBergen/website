# Speaker Reminders

## Overview

The reminders subsystem is a **scheduled, server-only** engine that nudges
speakers about the things they still have to do before a conference — confirm an
accepted talk, upload slides, finish a travel-support request, read a day-of
agenda — plus an **event-driven** alert when their talk is moved on the schedule.
It is a thin producer on top of the notification hub: every reminder is emitted
as a single `notification` document per speaker, so push, the in-app bell and
email all ride free through `createNotifications` (`src/lib/notification/*`) — the
reminder engine never talks to a channel directly.

The code lives under `src/lib/reminders/*` and is driven by one daily cron route
(`src/app/api/cron/reminders`). Phase 1 is **config-free**: the reminder
schedule is a hardcoded registry, tuned in code, with no Studio UI.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                       Speaker Reminders (Phase 1)                      │
├──────────────────────────────────────────────────────────────────────┤
│  Cron:  src/app/api/cron/reminders  (Bearer CRON_SECRET, 06:00 UTC)   │
│  ├── resolveActiveReminderConference()  → the single active edition    │
│  ├── runSpeakerReminders(conf)   → the fixed registry, deduped         │
│  └── runDayOfAgenda(conf)        → "you're presenting today"           │
├──────────────────────────────────────────────────────────────────────┤
│  Registry (registry.ts): confirm-talk · upload-slides ·               │
│                          travel-reminder · logistics                  │
├──────────────────────────────────────────────────────────────────────┤
│  Dedup markers (marker.ts): scheduledReminderLog docs, deterministic  │
│  id  reminder.<key>.<conf>.<speaker>  ·  day-of.<conf>.<speaker>.<date>│
├──────────────────────────────────────────────────────────────────────┤
│  Event-driven: notifyScheduleChanges (schedule-alerts.ts) on save     │
├──────────────────────────────────────────────────────────────────────┤
│  Sink: createNotifications → hub + push + email (never re-derived)     │
└──────────────────────────────────────────────────────────────────────┘
```

## The reminder registry

`src/lib/reminders/registry.ts` is the **single, hardcoded source of truth** for
the recurring speaker-prep reminders. Each entry is a `Reminder` (`types.ts`)
with a stable `key`, a `notificationType`, a `maxSends`/`spacingDays` cadence and
a **pure** `evaluate(speaker, conference, today)` predicate — no clock or network
access, everything it needs is passed in — that returns the copy when the
reminder is due for that speaker on that date, or `null`.

| Key               | When it fires                                                                                            | Cadence                        | Reused notification type  |
| ----------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------- |
| `confirm-talk`    | An `accepted` (not yet `confirmed`) talk needs the speaker to confirm participation.                     | up to 2×, ≥7 days apart        | `proposal_status_changed` |
| `upload-slides`   | A `confirmed` talk with no `slides` attachment, from T-7d.                                               | up to 2×, ≥3 days apart        | `proposal_status_changed` |
| `travel-reminder` | A travel-support request left in `draft` (submit it), or an approved/submitted one near the payout date. | up to 2×, ≥7 days apart        | `travel_support_update`   |
| `logistics`       | A warm venue/arrival/AV one-liner to every `confirmed` speaker at T-2d.                                  | single-shot (once per edition) | `proposal_status_changed` |

Two design notes are load-bearing:

- **The registry REUSES existing notification types** rather than minting a
  reminder-specific one, so reminders inherit the hub's push categories, email
  templates and retention with zero new plumbing. `confirm-talk` /
  `upload-slides` / `logistics` ride `proposal_status_changed`; `travel-reminder`
  rides `travel_support_update`; the day-of agenda rides `proposal_status_changed`;
  and the schedule-change alert activates the reserved `schedule_update` type.
- **Timing is DAY-OF granularity** (no minute-level windows), matching the
  cron's once-a-day cadence — every date comparison in `dates.ts` works on
  calendar dates at UTC midnight.

## Deduplication — the `scheduledReminderLog` marker

Because the cron re-runs daily, every reminder needs an idempotence key. The
`scheduledReminderLog` document (`sanity/schemaTypes/scheduledReminderLog.ts`) is
a tiny per-`(reminder, conference, speaker)` marker with a **deterministic id**
(`marker.ts`):

| Marker             | Id scheme                                           | Semantics                                                               |
| ------------------ | --------------------------------------------------- | ----------------------------------------------------------------------- |
| recurring reminder | `reminder.<key>.<conferenceId>.<speakerId>`         | `createIfNotExists` + a `count` increment; carries `lastSentAt`.        |
| day-of agenda      | `reminder.day-of.<conferenceId>.<speakerId>.<date>` | single-shot per presenting day (the date in the id is the whole dedup). |

The id is derived (never random) so a daily re-run resolves to the **same**
document and `createIfNotExists` collapses concurrent runs onto one marker. The
runner batch-reads all candidate markers in one GROQ query, then applies the
cap+spacing gate (`shouldSendReminder`): send only if `count < maxSends` **and**
enough days have elapsed since `lastSentAt`. A successful send stamps the marker
(`stampReminderLog`: create-if-missing then `.inc({ count: 1 })` + `lastSentAt`,
in one transaction).

## The cron route & the active conference

`src/app/api/cron/reminders` is the daily entry point. Auth mirrors the other
crons — a `Bearer ${CRON_SECRET}` header. It resolves **one** active conference
(`resolveActiveReminderConference`: among editions that have **not** ended
(`endDate >= today`), the one with the **earliest** `startDate` — a currently
ongoing edition, else the nearest upcoming one), then runs
`runSpeakerReminders` followed by `runDayOfAgenda`. Both jobs are wrapped in a
**never-throw** envelope and isolate every per-speaker emit, so one bad speaker,
read error or notification failure can never fail the cron. A run is capped at
`MAX_SENDS_PER_RUN` (500) so a backlog can never fan out unbounded.

**TZ ASSUMPTION.** The cron is scheduled at **06:00 UTC** (`vercel.json`). Our
events run in Central European time (CET/CEST), where 06:00 UTC is 07:00–08:00
local — the **same calendar date**. Reminders are day-of granularity, so this
early-morning delivery lands before the conference day for the day-of agenda and
tolerates the fixed offset. All date math (`dates.ts`) works on UTC-midnight
calendar dates precisely so the comparison is timezone-stable under this
assumption.

## The day-of agenda

`runDayOfAgenda` fires only when today matches a schedule day: it reads the
schedule docs whose `date` is today, keeps each speaker's **earliest** slot (so a
speaker with two talks today gets one notification about the first), and sends a
single "you're presenting today" hub notification deep-linked to `/program`,
deduped per `(speaker, date)` by the day-of marker.

## Schedule-change alerts (event-driven)

`src/lib/reminders/schedule-alerts.ts` is **not** on the cron — it is called by
the schedule SAVE path. The save captures a day's talk placements BEFORE the
write and calls `notifyScheduleChanges` AFTER it; `diffScheduleSlots` (a pure
diff) returns talks present in **both** the prior and next placement sets whose
`date`, `startTime` or `trackTitle` changed. Only a genuine **move** fires — a
newly-placed or removed talk does not — and each moved talk earns one
`schedule_update` notification to its speakers (deep-linked to `/program`), with
the acting organizer excluded from recipients and recorded as the notification
`actor`. Like the cron jobs it is **never-fail**: a notification failure can
never fail the schedule save that triggered it.

## Retention & GDPR

The `scheduledReminderLog` is **operational bookkeeping, not user content**: it
stores only a **weak** speaker reference, a weak conference reference, a `count`
and timestamps. The weak refs make speaker erasure (GDPR) non-blocking — a
dangling reference is tolerated exactly as it is for the messaging documents. The
marker's lifecycle is tied to the conference edition it belongs to (it ages out
with the edition); it holds no free-text personal data. The reminder deliveries
themselves are ordinary hub `notification` documents and inherit the hub's
**90-day** retention (`deleteNotificationsOlderThan`). The privacy page lists the
reminder delivery log in its retention table.

## Related documents

- **`ADMIN_NOTIFICATION_SYSTEM.md`** / **`AGENTS.md` → "In-app notifications"** —
  the hub the reminders emit into (never-fail, per-recipient, retention).
- **`EMAIL_SYSTEM.md`** — the email channel a reminder rides through.
- **`EVENT_ARCHITECTURE.md`** — the schedule save path that triggers
  schedule-change alerts.
