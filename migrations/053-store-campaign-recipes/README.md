# 053 — store Task Recipes on marketing Campaigns

Templates spec §2.1, issue #1120. From the release that carries this migration,
Trigger handlers, the expansion cron and `plan.copy` read **only**
`marketingCampaign.recipes[]`; the built-in Template is no longer looked up by
Campaign key. A Campaign seeded before that release has no `recipes[]`, so
**until this runs it generates nothing** — no speaker cards, no sponsor
thank-yous, no teasers.

## What it writes

For every live `marketingCampaign` (drafts and Content Release copies are
skipped — the app never reads them) whose `key` is a built-in Campaign's:

- `recipes[]` — that Campaign's `2026.1` Recipes, **only if it has none**. A
  plan is frozen at its Recipes, so an existing `recipes[]` is never replaced.
- `generatedKeys[]` — gains the keys of the Campaign's **existing** countdown
  Tasks (`countdown:d-30:bluesky`, …). Seed and copy used to expand the
  countdown without recording it; unmarked, the next time the Recipe is put on
  the Campaign every one of those Tasks would be created a second time. Keys
  already on the marker are kept, in order.

Custom Campaigns (`custom-<uuid>`) have no Recipes to recover and are left
alone. It refuses to run if the built-in Template is no longer `2026.1`.

## Order

**Migrate first, then deploy.** The old code ignores `recipes[]`, and extra
`generatedKeys[]` entries only name Tasks that already exist, so there is no gap.

Deploying first is survivable but not free. Until 053 runs:

- Triggers and the cron create nothing for pre-existing plans. That recovers —
  the daily cron re-reads every subject list and the sponsor sweep looks back
  7 days.
- `plan.copy` **refuses** a source whose built-in Campaigns have no Recipes
  (`PRECONDITION_FAILED`). A copy made without them would have no skeletons and
  no countdown, and nothing would ever add the countdown afterwards.

## Run

```sh
# 1. Dry run (the default): prints the patches, writes nothing.
mise run migrate -- 053-store-campaign-recipes

# 2. Back up, then apply.
mise run sanity -- dataset export production backup-pre-053.tar.gz
mise run migrate -- 053-store-campaign-recipes --no-dry-run
```

Every patch is compare-and-set on the revision read at stream start. The
generator appends to `generatedKeys[]` under the same guard, so a run that
overlaps the expansion cron or a Trigger cannot drop a key: one of the two loses.

**A conflict fails the run, not one patch.** The migration runner packs patches
into transactions of up to 256 KB — several whole plans each — and a single
revision mismatch rejects that entire transaction and stops the run. Nothing in
the rejected transaction is written; earlier transactions stay applied. The
migration is idempotent, so **re-run it**; a clean re-run prints no patches.

## Has this run yet?

Sanity keeps no ledger of applied migrations, so ask the data. `pending` must
be `0` (wrapped in an object: a bare zero `count()` prints an error):

```sh
mise run sanity -- documents query '{
  "campaigns": count(*[_type == "marketingCampaign"]),
  "pending": count(*[_type == "marketingCampaign" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && !string::startsWith(key, "custom-") && !defined(recipes[0])]),
  "countdownTasks": count(*[_type == "marketingTask" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && string::startsWith(key, "countdown:d")]),
  "unmarkedCountdown": count(*[_type == "marketingTask" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && string::startsWith(key, "countdown:d") && defined(campaign->_id) && !(key in coalesce(campaign->generatedKeys, []))])
}'
```

`unmarkedCountdown` must be `0` too. It is wrapped in `coalesce` because a
Campaign seeded before this release has no `generatedKeys` field at all, and
`key in null` is `null` — without it the check reads 0 exactly when nothing is
marked. The prefix is `countdown:d` on purpose: the
static Final-push Tasks `countdown3w:linkedin`, `countdown1w:…` and
`countdown1d:…` are not cadence Tasks and are never on the marker.

## Status

**Not yet run anywhere.** On 2026-09-20 `production` and `development` held
**no** `marketingPlan`, `marketingCampaign` or `marketingTask` documents at all
(only 50 `marketingSnapshot`s whose Campaign no longer exists), so against that
data this migration is a no-op. Re-check with the query above before deploying:
a plan seeded by the old code between now and the deploy needs it.
