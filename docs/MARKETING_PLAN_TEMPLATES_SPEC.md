# Marketing Plan — blank plans and organization-owned Templates

Status: **decided, not built**. Written 2026-09-20 from a design interview; it extends
[`MARKETING_PLAN_SPEC.md`](./MARKETING_PLAN_SPEC.md) (slice 1), whose section numbers are cited as
"slice 1 §n". Vocabulary is the marketing section of [`CONTEXT.md`](../CONTEXT.md).

## 1. Scope

An organizer can construct their own Marketing Plan instead of seeding it from the built-in Plan
Template, and can keep what they built as a reusable, organization-owned Template:

- a plan can be created **blank**;
- any Campaign, hand-built or not, can carry the same **Triggers and recurring Recipes** the built-in
  Template has, chosen from a Recipe Library and edited;
- a plan can be **saved as a Template**, versioned, and used to seed later editions.

Not in this work: a Template editor (saving a plan is the only way to author one); free-form Recipe
authoring (event, subject list and Kind wiring stay fixed by the Library); history or revert of a live
plan; a diff between Template Versions; rewriting already-created Tasks when a Recipe changes (§5.3).

## 2. What changes in the model

### 2.1 Recipes are stored on the Campaign

Today the generator resolves a Campaign's Recipes by looking its `key` up in `BUILTIN_TEMPLATE`
(`src/lib/marketing/generation.ts`), so a `custom-<uuid>` Campaign can never have a Trigger or a
recurring Recipe, and `plan.copy` recovers copy skeletons the same way.

`marketingCampaign` gains `recipes[]`, the stored form of `TaskRecipe` (slice 1 §5.2) including
`skeleton`, `alt`, `cadence` and `anchor`. `triggers[]` keeps its shape and points into `recipes[]`.
`recipes[]` holds **every** Recipe of the Campaign, static ones included. A static Recipe is
materialized once, when the Campaign is created, and afterwards is lookup-only: it is where
`plan.copy` and Save as Template (§6.2) find a Task's skeleton, alt skeleton and target page, since
`marketingTask` stores only the rendered text. It is never materialized a second time.

- **One path.** Seeding, copying and "add a built-in Campaign" (§4.2) all write `recipes[]`. The
  Trigger handlers, the expansion cron and `plan.copy` read **only** the stored Recipes. The built-in
  Template becomes a source of plans, never something a plan is resolved against afterwards.
- **A plan is frozen at the Recipes it was given.** A later built-in version reaches newly seeded
  plans only. Today an existing plan's not-yet-created Trigger Tasks silently pick up new code copy;
  that stops, deliberately.
- **Subjectless cadences get a marker.** The countdown is expanded by seed and copy with random ids
  and **no** `generatedKeys[]` entry, and no cron expands a subjectless Recipe today. From this change
  a subjectless Recipe expands at exactly one moment — when it is put on the Campaign (seed, copy,
  add built-in, attach from the Library) — and every key it creates is written to `generatedKeys[]`
  in the same transaction, like Trigger and subject-cadence keys.
- **Published keys are scoped by Campaign.** `publishedTaskKeys` collects bare `utm_content` values
  for the whole conference. Once a Recipe can sit on two Campaigns (§5.2) that silently drops the
  second Campaign's Tasks, renders included. It becomes a set of `(utm_campaign, utm_content)`
  pairs in all four consumers (generation, seeding, subjectless expansion, copy); reseed protection
  is unchanged because a reseeded Campaign keeps its key.
- **Built** in #1120, with migration `053-store-campaign-recipes` (runbook in its README).
- **Migration.** A new migration (053), run the way 052 was: dry-run, then apply, with a runbook. For
  each existing Campaign whose `key` matches a built-in Campaign it copies that Campaign's `2026.1`
  Recipes onto it, and it writes the keys of the Campaign's existing countdown Tasks into
  `generatedKeys[]`. Without the second step the first expansion after the backfill would duplicate
  every live plan's countdown. No Task may be created twice by a backfilled Recipe; that is the
  property the tests prove by sabotage, separately for Trigger, subject-cadence and countdown keys.

### 2.2 Manual Tasks are anchored

`task.create` accepts `milestone` + `offsetDays` as an alternative to `dueAt`. The form offers the
Milestone picker (extracted from `CampaignEditor` into a shared component) with the resolved date
shown live; typing a plain date suggests the nearest Milestone and the offset. An anchored Task takes
the standard slot time of its Channel or Kind (`slotAt`), not a typed time: re-dating recomputes the
slot, so any other time would move on the next sweep with no Milestone changed. `alsoCreateSibling`
gives the sibling the same anchor. An anchored manual Task is then re-dated with the edition like any
seeded Task (slice 1 §2.6; `isRedatableTask` has no origin filter). Tasks created before this, and Tasks
given a bare date, stay unanchored and are handled at save time (§6.2).

- **Built** in #1121. The Campaign ledger read carries the edition's resolved Milestones (null when a
  required date is missing, in which case the form takes a bare date only), so the form resolves the
  date without a request of its own.

### 2.3 Plan origin

`marketingPlan.templateVersion` cannot say "none" and renders as `Template ` for a blank plan. The
plan records its origin explicitly: `blank`, the built-in version, `copy:<sourcePlanId>`, or an
organization Template's **name and version stamped at seed time**. The stamp is text, not a
reference, so deleting a Template never leaves a plan with a dangling origin. The
`structurallyEdited` sentences in plan settings are reworded per origin.

### 2.4 `planTemplate`

The schema-only type of slice 1 §2.5 comes into use: **one document per Template Version**,
organization-owned, read with `ORG_FILTER`. The existing schema needs changing, which is free: nothing
reads it and only `conference` and `organization` are baseline-locked. `version` is retyped from
string to integer (the built-in's code-side `'2026.1'` string is unaffected); `templateId`, the
provenance fields and each Campaign's window anchors are added. Fields: `organization`, `templateId` (stable across
versions), `name` (unique per organization), `version` (integer, 1…n), `campaigns[]` with their
Recipes, and provenance `savedFrom` (conference), `savedBy`, `savedAt`,
`restoredFrom` (version, when §6.4 created it). A version is never patched after it is written, with
one exception: rename patches `name` on every version of the Template.

## 3. Creating a plan

One **Create plan** action replaces the two header buttons and opens a dialog with a source picker:

| Source                   | Result                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Blank                    | the plan document and nothing else                                                    |
| Built-in Template        | as today                                                                              |
| An organization Template | latest version preselected, older versions one click away, each with a preview (§6.3) |
| Copy a previous edition  | as today (`plan.copy`), now carrying stored Recipes                                   |

Any source with optional Campaigns shows the optional-Campaign checklist. Every source keeps the
Milestone precondition of slice 1, because the first Campaign added needs resolvable Milestones
anyway. The Template is resolved server-side against the conference's organization; the client sends
a Template id and version, never an organization. The empty-state copy stops describing the built-in
Template as the only option.

## 4. Building a plan by hand

### 4.1 Custom Campaigns

As today (`campaign.create`, `custom-<uuid>` key), plus an **optional** checkbox so a saved Template
can ask at seed time the way the built-in does.

### 4.2 Built-in Campaigns on demand

"Add Campaign" offers every built-in Campaign the plan does not already have. It arrives fully formed
— Tasks, Prerequisites, skeletons, stored Recipes — through the same expansion and commit path as
seeding, and is editable like any other. This also lets an organizer who unticked _Keynotes_ at seed
time change their mind.

A built-in Campaign can exist **at most once per plan**: its key is `utm_campaign` and its ledger
identity, and `src/lib/marketing/sanity.ts` relies on a key matching across two documents meaning a
reseed. Re-adding a deleted one honours the published-Task filter that already guards reseeding.

## 5. Triggers and recurring Recipes on any Campaign

### 5.1 The Recipe Library

The platform's Recipes, offered on any Campaign: speaker card per confirmed speaker, sponsor card per
signed sponsor, talk teaser per scheduled talk, video drip per recorded talk, countdown. Countdown
Recipes keep the `countdown` beat prefix, which is how the ceilings recognise them. The Library
entry fixes the event or subject list, the Task Kinds and the render-before-post Prerequisite; none of
that is editable, so every attached Recipe is coherent by construction.

### 5.2 What the organizer edits

Title, Channels, posts per week, the window (Milestone + offset at each end), copy skeleton, alt
skeleton, instructions. Skeletons accept the placeholders valid for that Recipe's subject (slice 1
§5.2); an unknown `{token}` is rejected with the strict rule outreach already uses. The same Library
entry can be attached to several Campaigns with different copy, and the built-in Campaigns' own
Recipes are editable through the same form once §2.1 lands.

### 5.3 Edits are forward-only

Editing a Recipe affects Tasks created from then on. Existing Tasks are never rewritten, re-dated or
deleted. Removing a Recipe stops creation and leaves its Tasks as ordinary Tasks. `generatedKeys[]` is
untouched, so re-attaching the Recipe does not recreate Tasks for subjects that already had one.
Ceilings (slice 1 §5.4) warn when the form is saved as well as at expansion.

- **Built** in #1122. A Library entry is the built-in Template's beat, so its keys and Trigger are the
  built-in's. Two limits follow from how Tasks are keyed: the **countdown window stays on
  `CONFERENCE_START`** (only its offsets are editable), because `{days}` and the `d-30` Task keys are
  both counted from the conference start; and attaching a subject Recipe creates no Task by itself —
  the next daily expansion, or the next Trigger, does. A built-in Campaign with no stored Recipes
  (before migration 053) refuses Recipes, as `plan.copy` refuses it.

Deferred: an offer to refresh the copy of unpublished, unedited Tasks after a skeleton change.
Rejected: reconciling existing Tasks to the Recipe, which would change work after it was approved.

## 6. Organization-owned Templates

### 6.1 What a Template holds

**In:** Campaigns (title, window anchors, Outcome, target page, optional flag) and their Recipes. A
Template holds Recipes, never Tasks: a Task of origin `template` or `copy` is represented by the
static Recipe it came from, and a `manual` Task becomes a static Recipe at save time (title, Kind,
Channel, anchor, Prerequisites, instructions, target page, skeleton, alt), so seeding from a Template
is the same expansion as seeding from the built-in. A static Recipe whose Task was deleted from the
plan is left out. **Out:** assignees, status, approvals, assets, published posts,
outreach Tasks, and every Trigger- or expansion-origin Task — their Recipe is saved, the instances
are not. A Target is saved as a share of ticket capacity. Campaign and Task **keys are preserved**, as
`plan.copy` preserves them, so the report's previous-edition comparison (matched by Campaign key)
works for hand-built Campaigns seeded from a Template.

### 6.2 Save as Template

An action on plan settings. The dialog asks for a new Template (name) or a new version of an existing
one, then shows a review list of exactly the Tasks that need a decision:

- **Unanchored Tasks**, each with an anchor derived by the existing `reanchor` of `copy.ts` (nearest
  Milestone the edition actually set, else the Campaign start), to confirm or change.
- **Tasks carrying literal copy** (`copyEdited`, or no skeleton). The text is editable in place: the
  organizer may replace "12 November 2026" with `{date}`, and what they leave becomes that Task's
  skeleton in the Template. Only conference placeholders are accepted for static Tasks. Untouched,
  the copy is saved verbatim and the Task is marked so the seeded plan flags it for review.

Tasks whose copy was never edited save their stored skeleton and need no review. The live plan is
never modified by saving. Saving writes version n+1 guarded against a concurrent save of the same
Template.

### 6.3 Templates page

`/admin/marketing/templates`, linked from plan settings and from the Create-plan dialog, available
whether or not the edition has a plan. Lists the organization's Templates; each opens to its version
history (version, saved by, saved from, date) and a **preview** of any version: Campaigns, Task
counts, Recipes. Actions: restore, rename, delete. Template contents are not editable here.

### 6.4 Version lifecycle

Versions are immutable and every one is seedable. **Restore** writes a new version with the old one's
contents (`restoredFrom`), so history is append-only. **Delete** removes the Template with all its
versions after a confirmation naming it; plans seeded from it are unaffected and keep their stamped
origin (§2.3).

## 7. tRPC surface

Added to `marketing` (organizer procedures, as slice 1 §8):

`plan.create({ source })` with `source` a discriminated union of `blank`, `builtin`
(`templateVersion`, `includeOptional[]`), `template` (`templateId`, `version`, `includeOptional[]`);
`plan.seed` folds into it, `plan.copy` stays. `campaign.addBuiltin({ key })`;
`campaign.recipes.library`, `campaign.recipes.attach/update/remove` (revision-guarded on the
Campaign). `task.create` gains the anchor alternative. `template.list`, `template.versions`,
`template.preview`, `template.savePreview` (the review list), `template.save`, `template.restore`,
`template.rename`, `template.delete`.

## 8. Delivery

Five changes, each shippable alone, in this order (3 may run alongside 2):

1. **Blank plan and the Create-plan dialog** — §2.3, §3 without organization Templates.
2. **Stored Recipes, one generator path, backfill migration** — §2.1. No visible change; reviewed
   with nothing else in the diff.
3. **Task anchoring** — §2.2.
4. **Recipe Library and built-in Campaigns on demand** — §4, §5. Needs 2.
5. **Organization Templates** — §2.4, §6, the Template source in §3. Needs 2, 3 and 4, because
   versions are immutable: a Template saved before them would be permanently missing Recipes and
   anchors.

## 9. Known limits

- A Task whose copy was edited during an edition comes back as literal text the next time the plan is
  saved as a Template; the placeholders have to be put in again.
- `utm_campaign=custom-<uuid>` stays as unreadable as it is today.
- The generator rewrite of step 2 is the first marketing change whose risk is in production data; no
  part of this design has been exercised against live Sanity or PostHog.
- No new personal data is collected: a Template records which organizer saved it, the same class of
  data a plan already holds, so `/privacy` is unchanged.
