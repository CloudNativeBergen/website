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

Either order is safe; **migrate first** is better.

- _Migrate, then deploy_: the old code ignores `recipes[]`, and extra
  `generatedKeys[]` entries only name Tasks that already exist. No gap.
- _Deploy, then migrate_: between the two, Triggers and the cron create nothing
  for pre-existing plans. Nothing is lost — the daily cron re-reads every
  subject list, and the sponsor sweep looks back 7 days — but migrate within
  that window.

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
overlaps the 04:00-ish expansion cron or a Trigger fails that one patch instead
of dropping a key. It is idempotent: **re-run after any conflict**; a clean
re-run prints no patches.

## Has this run yet?

Sanity keeps no ledger of applied migrations, so ask the data. `pending` must
be `0` (wrapped in an object: a bare zero `count()` prints an error):

```sh
mise run sanity -- documents query '{
  "campaigns": count(*[_type == "marketingCampaign"]),
  "pending": count(*[_type == "marketingCampaign" && !string::startsWith(key, "custom-") && !defined(recipes[0])]),
  "countdownTasks": count(*[_type == "marketingTask" && key match "countdown*"]),
  "unmarkedCountdown": count(*[_type == "marketingTask" && key match "countdown*" && !(key in campaign->generatedKeys)])
}'
```

`unmarkedCountdown` must be `0` too. (`match` tokenises on `:`, so
`"countdown*"` matches `countdown:d-30:bluesky`.)

## Status

**Not yet run anywhere.** On 2026-09-20 `production` and `development` held
**no** `marketingPlan`, `marketingCampaign` or `marketingTask` documents at all
(only 50 `marketingSnapshot`s whose Campaign no longer exists), so against that
data this migration is a no-op. Re-check with the query above before deploying:
a plan seeded by the old code between now and the deploy needs it.
