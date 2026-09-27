# 054: talk Recipes name every speaker

Issue #1153 (tagging spec §4.2). Template `2026.3` changed the built-in talk skeletons:

- `talkTeaser` and `videoDrip` now write `{speakers}` instead of `{name} ({company})`.
- The `talkTeaser` Bluesky line no longer reads "{name} has the answer".

A talk subject now names ALL of its speakers. A plan seeded earlier keeps its stored Recipes, so for a two-speaker talk its `{name} ({company})` reads "Alice and Bob (Alice's title)", which is worse than before.

## What it writes

It only touches live `marketingCampaign` documents. Drafts and Content Release copies are skipped.

For each stored Recipe, it rewrites `recipes[_key].skeleton` to the `2026.3` text only when all three hold:

- the Recipe is a talk Recipe (`subjectSource == "talk"`);
- its `key` is one of `talkTeaser:linkedin`, `talkTeaser:bluesky`, `videoDrip:linkedin` or `videoDrip:bluesky`;
- its skeleton is **exactly** the built-in `2026.2` text.

An edited skeleton is the organizer's and is never touched. Both the old and new texts are frozen in `rewrites.ts`.

The two Bluesky `2026.2` texts are identical to `2026.1`, so a plan backfilled by 053 gets those two lines as well. The `2026.1` LinkedIn lines (which still carried `{url}`) are not matched.

It does not touch:

- `marketingPlan.templateVersion`, which records what the plan was seeded from.
- Organization Templates (`planTemplate`). Each saved version is immutable history. A version saved from an unedited `2026.2` plan still seeds the old text, and the organizer edits it there.

## Order

**Run it before or with the deploy of #1153.** Once the new code is deployed, an unmigrated two-speaker talk post reads "Alice and Bob (Alice's title)". The old code resolves `{speakers}` nowhere, so migrating first is not safe either. Run it in the same window as the deploy, straight after it.

A post already generated is not rewritten. Only Tasks generated after the run use the new skeletons.

## Run

```sh
# 1. Dry run (the default): prints the patches, writes nothing.
mise run migrate -- 054-talk-speakers-skeletons

# 2. Back up, then apply.
mise run sanity -- dataset export production backup-pre-054.tar.gz
mise run migrate -- 054-talk-speakers-skeletons --no-dry-run
```

Every patch is compare-and-set on the Campaign revision. A conflict fails the run's transaction and stops it. The migration is idempotent, because a rewritten skeleton no longer matches, so re-run it until a clean run prints no patches.

## Has this run yet?

`pending` must be `0`:

```sh
mise run sanity -- documents query '{"pending": count(*[_type == "marketingCampaign" && !(_id in path("drafts.**")) && !(_id in path("versions.**")) && count(recipes[subjectSource == "talk" && key in ["talkTeaser:linkedin", "videoDrip:linkedin", "videoDrip:bluesky"] && skeleton match "*({company})*"]) > 0])}'
```

The query is a rough proxy: it also counts edited skeletons that still say `({company})`, and it cannot see the `talkTeaser:bluesky` line. The dry run is exact.

## Status

Not run anywhere. Production is read-only for this work.
