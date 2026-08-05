# Migration 047: Backfill the code-hardcoded tenant defaults

## ✅ RUN IN PRODUCTION — 2026-08-04

Verified in production on 2026-08-06 by querying the dataset for this
migration's own effects, not just the workflow history — see the commit message
for the evidence. Do not re-run: both migrations are idempotent by design, but
re-running is still an unnecessary production write.

Companion to [046](../046-conference-identity-backfill/README.md). 046 pins the
three Cloud Native Days editions' **visual** identity (theme, background
pattern, logos, prospectus copy). This one pins the remaining values that were
hardcoded in **application code** and are neutralised by the same PR.

Both are prerequisites of the same deploy. Neither depends on the other — they
write disjoint fields — so they can run in either order.

## Documents it targets

Identical to 046, and the targeting code is **imported from it** rather than
restated, so the two migrations can never disagree about which document is which
edition. A conference is a target iff one of its `domains[]` entries would serve
the target host under `domainServesHost`. Zero matches, two matches, or one
document matching two targets aborts the whole run before a single patch is
yielded.

| Edition                       | Host matched                 |
| ----------------------------- | ---------------------------- |
| Cloud Native Days Norway 2026 | `2026.cloudnativedays.no`    |
| Cloud Native Day Bergen 2025  | `2025.cloudnativebergen.dev` |
| Cloud Native Day Bergen 2024  | `2024.cloudnativebergen.dev` |

## What it writes, and where each value came from

Every write is conditional on the field being **absent**. Nothing is ever
overwritten.

| Field                  | Editions             | Value                                                        | Source                                                                                                                               |
| ---------------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `analyticsPirschCode`  | all three            | `Jc72d7tD73Ai9raeYVPeXJ0OhEJrrvaK`                           | The `data-code` literal on the `pa.js` `<Script>` in `src/app/layout.tsx`, which was injected on **every host** the platform served. |
| `venueTravelInfo`      | all three            | The Byparken/Bybanen/Flesland answer, `{{city}}` substituted | `src/app/(main)/info/page.tsx`, the "How do I get to the venue?" answer, quoted verbatim.                                            |
| `speakerDinnerInfo`    | all three            | The Ulriken speaker-dinner answer                            | Same file, "Will there be a speaker dinner?". Contains no `{{city}}` — it named Bergen as a literal.                                 |
| `localRecommendations` | all three            | The Bryggen/visitbergen.com answer, `{{city}}` substituted   | Same file, "What do you reccomend me to do during my stay in …?".                                                                    |
| `socialHashtag`        | **Bergen 2025 only** | `#cndb2025`                                                  | `src/components/stream/BlueskyAuthorFeedLooping.tsx`, which searched that tag unconditionally on every tenant's venue screen.        |

### Why the city is substituted rather than hardcoded

Two of the three /info answers interpolated `${conference.city}` at render time.
The captured templates keep a `{{city}}` placeholder which the migration
replaces with **the target document's own stored `city`**, so each edition gets
back exactly the sentence it renders today rather than a sentence that assumes
which city is stored. If a target has no `city`, those two fields are **skipped**
and the dry run prints a manual follow-up — writing "the city center of
undefined" as permanent data would be worse than leaving the question off.

### Why `socialHashtag` goes to one edition only

`#cndb2025` is Cloud Native Day **Bergen 2025**'s tag. Writing it to the other
two would make their venue screens display another event's posts — precisely the
bug the neutralisation exists to fix.

## Why it is a no-op

Every value written is exactly what the code produced before the neutralisation,
so applying it changes nothing on screen. Its observable effect is that the three
sites are still correct **after** the code defaults move:

- the `pa.js` snippet keeps being served with the same code (the default is now
  "no analytics script at all");
- the three /info questions keep rendering (they are now omitted when unset);
- the Bergen 2025 social wall keeps pulling its hashtag (there is now no
  hardcoded tag to fall back to).

## Idempotency

Safe to run repeatedly. Each field is written only when absent, so a re-run
yields an empty changeset; `plan.test.ts` asserts `planSets` returns `[]` when
applied to its own output. Whitespace-only strings count as absent; anything an
operator actually stored is left alone. Drafts are skipped.

## Running the migration

Via the **`Run Sanity Migration`** GitHub Actions workflow (`workflow_dispatch`):

- **migration**: `047-tenant-defaults-backfill`
- **dataset**: `production`

Equivalent local invocation:

```bash
pnpm sanity migration run 047-tenant-defaults-backfill \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production   # dry run
pnpm sanity migration run 047-tenant-defaults-backfill \
  --project "$SANITY_STUDIO_PROJECT_ID" --dataset production --no-dry-run --no-confirm
```

## Verification

```bash
npx sanity documents query '*[_type == "conference" && !(_id in path("drafts.**"))]{
  _id, title, domains, city, analyticsPirschCode, socialHashtag,
  "hasTravel": defined(venueTravelInfo),
  "hasDinner": defined(speakerDinnerInfo),
  "hasLocal": defined(localRecommendations)
}'
```

All three must report the analytics code and the three prose fields; only Bergen
2025 should report a `socialHashtag`.

Then, on each site (use a **Safari Private tab** — a stale service worker will
otherwise serve the old bundle):

- `curl -s https://<host>/ | grep -c 'api.pirsch.io/pa.js'` → `1`.
- `curl -s https://<host>/info | grep -c 'Flesland'` → `1`.
- `curl -s https://2025.cloudnativebergen.dev/stream/<room>` still renders the
  social wall.

## What would break if this were skipped

- **Analytics stops, silently.** The literal is gone from the layout, so all
  three sites serve no `pa.js` at all and every pageview after the deploy is
  lost. Nothing errors; the data just stops.
- **Three /info questions disappear** from all three sites — travel directions,
  the speaker dinner and the local recommendations.
- **The Bergen 2025 social wall loses its hashtag source.** It still shows the
  account's own posts and mentions, so the failure is quiet rather than empty.

None of it is recoverable from the sites themselves once the code has shipped,
which is why the values are hardcoded in `plan.ts` rather than imported from the
constants they mirror.

## Rollback

Every write is additive and reproduces the current rendered output, so there is
normally nothing to roll back. To undo, unset the fields listed above on the
three documents, or restore from the backup artifact the workflow produced.

---

# MANUAL SETUP — things this migration deliberately does not do

## POST-MERGE

### M1 · Review the /info FAQ prose (all three editions)

- **What:** the three backfilled answers are the _old_ copy, typos and all
  ("organziers", "reccomend"). They are now editable in Admin → Settings →
  Local Information; fix them there whenever convenient.
- **If left as-is:** the sites read exactly as they do today.

### M2 · The remaining hardcoded /info answers (code, not data)

- **What:** the afterparty answer ("we will host an afterparty at the same
  venue … 6 PM") and the ticket-type answers are still hardcoded prose in
  `src/app/(main)/info/page.tsx`. They assert facts about the event that are not
  place-specific but are still assumptions.
- **If left as-is:** a tenant that does not hold an afterparty advertises one.
