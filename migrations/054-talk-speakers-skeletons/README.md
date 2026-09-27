# 054: talk Recipes name every speaker

Issue #1153 (tagging spec §4.2). Template `2026.3` changed the built-in talk skeletons:

- `talkTeaser` and `videoDrip` now write `{speakers}` instead of `{name} ({company})`.
- The `talkTeaser` Bluesky line no longer reads "{name} has the answer".

A talk subject now names ALL of its speakers. A plan seeded earlier keeps its stored Recipes, so for a two-speaker talk its `{name} ({company})` reads "Alice and Bob (Alice's title)", which is worse than before.

## What it writes

It touches `marketingCampaign` documents: live ones, and drafts and Content Release copies too. Publishing a draft or a Release later replaces the live Campaign, so a copy left on the old text would bring it back. Each patch is compare-and-set on that document's own revision.

For each stored Recipe, it rewrites `recipes[_key].skeleton` to the `2026.3` text only when all three hold:

- the Recipe is a talk Recipe (`subjectSource == "talk"`);
- its `key` is one of `talkTeaser:linkedin`, `talkTeaser:bluesky`, `videoDrip:linkedin` or `videoDrip:bluesky`;
- its skeleton is **exactly** a built-in `2026.2` or `2026.1` text.

An edited skeleton is the organizer's and is never touched. Both the old and new texts are frozen in `src/lib/marketing/template/legacy-skeletons.ts`. Seeding and copying read the same table (see below).

The two Bluesky `2026.2` texts are identical to `2026.1`, so a plan backfilled by 053 gets those two lines as well. The `2026.1` LinkedIn lines, which still carry the link in the body (`Schedule → {url}`, `Watch → {url}`), are matched too: only their speaker phrase changes, and the link wording stays.

It does not touch:

- `marketingPlan.templateVersion`, which records what the plan was seeded from.
- Organization Templates (`planTemplate`). Each saved version is immutable history. Seeding a plan from one, and copying an earlier edition's plan, bring each unedited legacy skeleton current from the same table, so the stored text never reaches a new plan.

## Order

**Run it now; it is safe to run any time.** #1153 is deployed, so the new code resolves `{speakers}`. When #1153 was deployed, production had no talk Recipe on any Campaign, and no draft, Release copy or `planTemplate`, so nothing was generated from a legacy skeleton in the meantime. New plans cannot pick one up either: seeding from a saved Template and copying an earlier plan bring each unedited legacy skeleton current.

A post already generated is not rewritten. Only Tasks generated after the run use the new skeletons.

## Run

```sh
# 1. Dry run (the default): prints the patches, writes nothing.
mise run migrate -- 054-talk-speakers-skeletons

# 2. Back up, then apply.
mise run sanity -- dataset export production backup-pre-054.tar.gz
mise run migrate -- 054-talk-speakers-skeletons --no-dry-run
```

Every patch is compare-and-set on the document's revision. A conflict fails the run's transaction and stops it. The migration is idempotent, because a rewritten skeleton no longer matches, so re-run it until a clean run prints no patches.

## Has this run yet?

`pending` must be `0`:

```sh
mise run sanity -- documents query '{"pending": count(*[_type == "marketingCampaign" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && count(recipes[subjectSource == "talk" && key in ["talkTeaser:linkedin", "videoDrip:linkedin", "videoDrip:bluesky"] && skeleton match "*({company})*"]) > 0])}'
```

The query is a rough proxy. It counts only live Campaigns, it also counts edited skeletons that still say `({company})`, and it cannot see the `talkTeaser:bluesky` line. The dry run is exact, and it includes drafts and Release copies.

## Status

Not run anywhere. Production is read-only for this work.
