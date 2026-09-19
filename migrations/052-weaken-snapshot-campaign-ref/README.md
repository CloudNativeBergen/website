# Snapshot preservation before marketing deletion

Run this migration **before enabling Campaign or Plan deletion** against a dataset
with existing marketing snapshots:

```sh
mise run migrate -- 052-weaken-snapshot-campaign-ref
```

Review the Sanity migration dry run and take a dataset backup before applying it.
This migration has not been run from the implementation sandbox.

It backfills the Campaign's IDENTITY — key, title and outcome — plus every
per-Task key, before weakening the stored campaign references. The schema
declaration alone does not change existing references. Existing denormalized
metadata is kept on repeat runs.

The target is copied because it is a GOAL, not a measurement property: the
Report reads a target from the live Campaign and keeps this denormalized copy
only to serve a RETIRED one. Grouping it with the window meant a Campaign
migrated and then deleted lost its goal entirely, turning a retired `137 / 250`
into a targetless `137` even though the goal never changed.

It deliberately does **not** backfill `campaignStartDate` or `campaignEndDate`.
Those describe what a reading was measured _against_, and the
Campaign's current values are not evidence of what they were when it was taken:
#1078 re-dates Campaign windows whenever a Milestone is set, so the window is the
field most likely to have moved since. Stamping today's window onto a historical
row would make the Report treat that reading as measured over a span it never
covered — and `strictWindow` counts `cfpSubmissions` and `ticketsSoldInWindow`
strictly inside the window, so the number would be attributed to the wrong period
permanently, because the true one is not recoverable afterwards.

Absent is a supported state, not a gap: `sameMeasurementBasis` does not split when
neither side has a window, `measuredWindow` returns null rather than annotating,
and `summarize` falls back to the live Campaign's dates — or, for a retired
Campaign, to the readings' own date range.

The Outcome is copied despite having the same shape of risk, because the Report
drops a retired Campaign from its breakdown entirely without one. Nothing moves an
Outcome automatically; only an explicit edit does.

The migration runs two independent passes.

**Weakening the owner references** goes first and cannot fail. It rewrites every
reference the schema now declares weak — `campaign`, `plan`, `post`, `variant`,
`copiedFrom`, `prerequisites[]` and `perTask[].task` — so that nothing can refuse
a Campaign or plan delete. This is the pass deletion is gated on, and it is
deliberately not downstream of anything that can throw: while it was, a single
unattributable Snapshot could leave every plan permanently undeletable.

**Backfilling the Snapshot metadata** keeps an all-or-nothing contract: all
joins are resolved before any of it is written. A Snapshot whose Campaign no
longer resolves stops that pass — restore the Campaign from a backup rather than
weakening an unattributable reading. A Snapshot with no `campaign` at all (a
half-filled Studio draft) is skipped, and a `perTask` row whose Task is already
gone is kept without a key: `task.delete` predates this migration, so those rows
are expected and there is no key left to recover.

A partial run therefore leaves references weakened and Snapshots un-backfilled.
That is safe and the migration is re-runnable — every write is skipped when the
value is already there.

Drafts and content-release versions are included because their strong references
prevent a delete exactly as a published document's do.

## Has this run yet?

Sanity keeps no ledger of applied migrations — `sanity migration list` reads this
repo, not the dataset — so ask the data. The owner-weakening pass is the reliable
signal, because it touches every Snapshot that has a Campaign reference:

```sh
mise run sanity -- documents query '{
  "snapshots":         count(*[_type == "marketingSnapshot"]),
  "strongCampaignRef": count(*[_type == "marketingSnapshot" && defined(campaign._ref) && campaign._weak != true]),
  "needBackfill":      count(*[_type == "marketingSnapshot" && !defined(campaignKey)]),
  "danglingCampaign":  count(*[_type == "marketingSnapshot" && !defined(campaignKey) && !defined(campaign->_id)])
}'
```

`strongCampaignRef: 0` means the first pass has run. `needBackfill: 0` means the
second has. `danglingCampaign` must be `0` before running, or the backfill stops
and asks for the Campaign to be restored from a backup.

On **production, 2026-09-19** — before this migration had ever been run:

```
snapshots         40
strongCampaignRef 30    ← not run
needBackfill      30
danglingCampaign   0    ← safe to run
```

The ten already carrying a key and window are recent readings the snapshot cron
wrote natively; they are left untouched.

After applying, verify `strongCampaignRef` and `needBackfill` are both `0`, and
that `perTask[].taskKey` is populated, before exposing deletion.
