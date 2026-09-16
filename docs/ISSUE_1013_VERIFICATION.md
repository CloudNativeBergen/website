# Issue #1013: Promo studio as a Task tool

## Implementation

The existing studio stays at `/admin/marketing/studio` with all five tabs. Task links carry the Task and speaker/sponsor selection; subjectless Tasks open Conference Promo. Client navigation updates the selected tab. Downloads and attachments share the image-loading, proxy-rewriting, canvas, PNG, and cleanup lifecycle.

`POST /api/admin/marketing-studio-image` authorizes the current organization, guards the Task's conference before reading its contents, and binds the uploaded image to that Task under its revision. `marketing.task.attachAsset` accepts only that Task's bound upload (or its already-saved output for retries), writes a Sanity image object, and leaves `status` untouched. The existing tool-only completion refusal stays in place.

A pure selector chooses publishing siblings that list this render as a Prerequisite. The handoff checks the tenant-scoped post and variant, then commits the post image and the variant's selection in one transaction, guarded by both revisions. Existing post attachments are preserved. Alt text uses the Task's alt or a nonempty title/subject fallback.

The image and `handoffPending: true` commit together before fan-out. A studio render is complete once its asset is saved (spec §2.3); pending handoff is a separate delivery concern. Exceptions and unavailable recipients keep the saved image and durable recovery marker. The Task editor shows a retry control after reload; dependent publishing Task editors link to it. Successful handoff compares the recipient sets and clears the marker with a transaction guarded by the render revision and the Campaign revision captured before discovery. Prerequisite edits advance that Campaign revision in their own atomic write, so an edit after the recheck also preserves recovery. Both studio and editor retries refresh the current revision before reattaching, without recapturing or uploading. No new dependencies.

## Original feature verification (historical)

The command results and sabotage table below describe the original feature session, not the resumed repair. Current repair evidence is recorded in the section appended below.

### Verification boundaries

- Unit tests exercise generated revision-protected mutations; they do not prove a live Sanity commit. No production data was written.
- GROQ fixtures execute the real query strings and completion projection using `groq-js`.
- Original defect (repaired below): the failed-handoff retry UI was session-local and disappeared on reload/navigation.
- Uploading successfully and then losing the Task revision race can leave an unreferenced image. It is not deleted automatically because Sanity may deduplicate that upload to a shared asset.
- Historical attempt (superseded by the confirmed visual evidence below): visual verification was attempted with `SHOOT_PORT=6106 pnpm shoot systems-marketing-promostudio--subjectless-task`. Storybook reports `SB_CORE-SERVER_0018 (NoFreePortError)` because this sandbox blocks port binding. A separate Chromium launch fails with `bootstrap_check_in Permission denied (1100)` / SIGTRAP. No PNG was produced or inspected, and no visual pass is claimed. The story was subsequently inspected, as recorded below.
- GitHub issue retrieval failed (`error connecting to api.github.com`); implementation used the supplied issue description. No push or merge was attempted.

## Guard sabotage evidence

Each row removes the named guard, runs the named test selection, observes a concrete failure, and restores the source. All runs below exited 1. Each collected exactly one test file; counts include skipped tests so an import failure cannot masquerade as a successful sabotage. The restored focused suite passes.

| Guard removed                       | Named failing test                                                                                                                          | Passed / failed / skipped / total |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| attach tenant guard                 | task.attachAsset refuses a foreign tenant before reading the render Task                                                                    | 0 / 1 / 45 / 46                   |
| attach task exists                  | task.attachAsset refuses a missing render Task                                                                                              | 0 / 1 / 45 / 46                   |
| attach kind                         | task.attachAsset refuses a wrong kind even with a bound upload                                                                              | 0 / 1 / 45 / 46                   |
| attach provenance                   | task.attachAsset refuses an asset uploaded for a different Task                                                                             | 0 / 1 / 45 / 46                   |
| attach loaded revision              | task.attachAsset surfaces a stale loaded revision as CONFLICT                                                                               | 0 / 1 / 45 / 46                   |
| attach save conflict                | task.attachAsset surfaces an atomic save revision conflict as CONFLICT                                                                      | 0 / 1 / 45 / 46                   |
| upload organizer                    | studio upload provenance refuses callers outside the current organization                                                                   | 0 / 1 / 9 / 10                    |
| upload tenant                       | studio upload provenance refuses a foreign Task before its content read or upload                                                           | 0 / 1 / 9 / 10                    |
| upload task exists                  | studio upload provenance rejects missing Tasks                                                                                              | 0 / 1 / 9 / 10                    |
| upload kind                         | studio upload provenance rejects other Task kinds                                                                                           | 0 / 1 / 9 / 10                    |
| upload id validation                | studio upload provenance refuses malformed upload (, image/png, true)                                                                       | 2 / 1 / 7 / 10                    |
| upload raster MIME                  | studio upload provenance refuses malformed upload (render, text/plain, true)                                                                | 2 / 1 / 7 / 10                    |
| upload file required                | studio upload provenance refuses malformed upload (render, image/png, false)                                                                | 2 / 1 / 7 / 10                    |
| upload size                         | studio upload provenance refuses oversized rasters                                                                                          | 0 / 1 / 9 / 10                    |
| handoff variant exists              | atomic studio attachment handoff reports a missing variant                                                                                  | 0 / 1 / 7 / 8                     |
| handoff post exists                 | atomic studio attachment handoff reports a missing post                                                                                     | 0 / 1 / 7 / 8                     |
| handoff empty post                  | atomic studio attachment handoff an occupied post gets neither another attachment nor a variant selection                                   | 0 / 1 / 7 / 8                     |
| handoff publishing lock             | atomic studio attachment handoff does not mutate a publishing variant; atomic studio attachment handoff does not mutate a published variant | 0 / 2 / 6 / 8                     |
| post CAS revision                   | atomic studio attachment handoff writes an image to the empty post AND selects its key on the variant in one revision-protected transaction | 0 / 1 / 7 / 8                     |
| variant CAS revision                | atomic studio attachment handoff writes an image to the empty post AND selects its key on the variant in one revision-protected transaction | 0 / 1 / 7 / 8                     |
| publishing sibling                  | renderHandoffRecipients selects exactly publishing Tasks with a variant and this prerequisite                                               | 0 / 1 / 4 / 5                     |
| sibling variant required            | renderHandoffRecipients selects exactly publishing Tasks with a variant and this prerequisite                                               | 0 / 1 / 4 / 5                     |
| prerequisite edge                   | renderHandoffRecipients selects exactly publishing Tasks with a variant and this prerequisite                                               | 0 / 1 / 4 / 5                     |
| upload binding CAS revision         | studio upload provenance binds the uploaded raster to this Task with its revision and returns the new revision                              | 0 / 1 / 9 / 10                    |
| Invisible capture dimensions        | refuses an invisible card even when rendering could succeed                                                                                 | 0 / 1 / 5 / 6                     |
| Generated canvas dimensions         | refuses a zero-size generated canvas even when a PNG blob is available                                                                      | 0 / 1 / 5 / 6                     |
| Missing PNG blob                    | rejects a missing PNG blob and releases the canvas                                                                                          | 0 / 1 / 5 / 6                     |
| Client render-kind gate             | does not offer attachment for a non-render Task                                                                                             | 0 / 1 / 3 / 4                     |
| Client upload HTTP success          | surfaces upload refusal without presenting completion                                                                                       | 0 / 1 / 3 / 4                     |
| Changed default-tab synchronization | honours a changed default tab after client navigation and retains all five tabs                                                             | 0 / 1 / 0 / 1                     |

Two independent adversarial reviews inspected backend and UI behavior. The sponsor selection index and empty-selection feedback were corrected; no further actionable issues were reported. Visual verification was subsequently completed for the states listed below.

## Command results

- `pnpm typecheck`: exit 0, including a repeat after the pending-upload image-shape correction.
- `npx eslint .`: exit 0; 0 errors, 112 existing warnings.
- `pnpm run lint:tenancy`: exit 0; 112 warnings across 38 files, equal to baseline; no file exceeds its baseline.
- `pnpm run knip`: exit 0; one existing configuration hint (`.storybook/mocks/tickets-provider.ts`).
- `pnpm format:check`: exit 0 after formatting the new local visual-verdict JSON; all matched files use Prettier style.
- Baseline `pnpm vitest run src/server/routers/marketing-task.test.ts`: 1 file, 35 tests passed.
- Final focused suite (Task router, four new marketing/upload suites, capture, tab navigation, provider, schema compilation and speaker schema validation): 10 files, 88 tests passed.
- First `pnpm test`: 675 files passed, 3 failed; 10,373 tests passed, 6 failed (10,379 total). Five failures exposed the new pending-image schema reference error; fixed by storing the standard image object and rerunning schema tests. The sixth was an existing ScheduleEditor test's 5-second timeout. Its isolated rerun passed 1 file / 6 tests.

- Corrected `pnpm test`: 677 files passed, 1 failed; 10,378 tests passed, 1 failed (10,379 total). The remaining failure is `cleanup-notifications` → `returns 401 without authorization header`, timing out during its first dynamic import at the default 5 seconds.
- `pnpm test --maxWorkers=2`: the same counts and timeout (678 files / 10,379 tests collected); reducing concurrency alone did not eliminate it.
- `pnpm vitest run __tests__/api/cron/cleanup-notifications.test.ts --testTimeout=15000`: 1 file / 7 tests passed in 1.15 seconds.
- Corrected schema/upload/query files were linted again after the image-shape fix: exit 0.

`pnpm test --testTimeout=15000`: **678 files passed; 10,379 tests passed**, exit 0, 71.96 seconds. Repository test configuration is unchanged. This does not erase the default-timeout failures above.

## Resumed adversarial-review repairs

The interrupted working tree was inspected before editing. Its tests were exercised against the original implementations and against the specified mutations; prior partial changes were not treated as verified.

### Changes and limits

- `marketingTask` schema, marketing read model, and router: persist the image and pending marker together before fan-out. A failed or interrupted handoff remains visible after reload; the saved render is complete under spec §2.3. A successful retry clears pending only while the current asset and revision still match.
- `StudioTaskProvider`: reread the revision before retrying a retained upload. The test's initial `r2` request conflicts, while the second request sends `r3` and succeeds.
- `TaskEditorPage`: expose recovery on the render Task and link to it from dependent publishing Tasks. Retry reads the current asset and revision with `staleTime: 0`; a real QueryClient fixture proves an otherwise fresh 60-second cached `r2` cannot defeat recovery. Hide old success feedback when a later render becomes pending.
- Storage tests evaluate production GROQ and simulate another append between the empty read and the transaction. Router tests exercise missing/null/blank alt values. Provider tests use the real attach button and shared capture implementation, mocking only rasterization and network boundaries; they assert the uploaded bytes, proxy source, restored source and released canvas.
- No new dependency or parallel attachment implementation was added. Existing capture and attachment helpers remain shared.
- Prerequisites remain advisory. Pending state **does not automatically block scheduled publication**; the editor explicitly warns about that possibility. This repair provides durable visibility and retry, not a scheduler policy change.
- Upload-binding conflicts can still leave orphaned `sanity.imageAsset` records. Immediate deletion is unsafe around concurrent uploads that may use the same asset. `scripts/manage-orphaned-files.ts` queries only `sanity.fileAsset`, so it does not clean up these images. No production cleanup was run.
- Server transaction behavior is mocked; real GROQ projections run through `groq-js`. No live Sanity write was performed. The rasterizer is mocked, so unit tests do not establish pixel fidelity.

### Fresh red/green evidence

All mutation runs exited 1 on test assertions, collected the stated files and tests, and were followed by a restored run exiting 0. No sabotage remains in production code. Counts below are failed/passed, with no skipped tests.

| Mutation / pre-fix implementation                                | Files collected | Red tests failed / passed | Restored tests passed | Concrete regression                                                      |
| ---------------------------------------------------------------- | --------------: | ------------------------: | --------------------: | ------------------------------------------------------------------------ |
| Original Task editor                                             |               2 |                     3 / 6 |                     9 | Reloaded editor content lacks durable recovery warning                   |
| Retry resends stale saved revision                               |               2 |                     2 / 7 |                     9 | Second mutation carries `r2`, not `r3`                                   |
| Real attach callback replaced with dummy PNG bytes               |               2 |                     3 / 6 |                     9 | Uploaded byte value becomes `dummy PNG bytes`                            |
| Remove post revision CAS                                         |               1 |                     2 / 6 |                     8 | Concurrent image is overwritten; outcome is `attached`, not 409          |
| Replace attachment-count projection with constant `0`            |               1 |                     1 / 7 |                     8 | Occupied post returns `attached`, not `occupied`                         |
| Replace `renderAlt(task)` with `task.alt!`                       |               1 |                    3 / 49 |                    52 | Handoff alt becomes undefined/null/whitespace instead of `Save the date` |
| Historical, superseded: remove pending predicate from completion |               1 |                    1 / 51 |                    52 | Pending render reads complete                                            |
| Remove durable pending marker                                    |               1 |                    2 / 51 |                    53 | Real editor read reports no pending recovery state                       |
| Remove newer-asset finalization guard                            |               1 |                    1 / 52 |                    53 | Wrong render's recovery is reported cleared                              |
| Remove missing-task finalization guard                           |               1 |                    1 / 52 |                    53 | Retry does not return the expected recovery result                       |
| Ignore pending-clear CAS failure                                 |               1 |                    1 / 52 |                    53 | Conflicted finalization reports success                                  |
| Remove editor retry `staleTime: 0`                               |               2 |                     2 / 9 |                    11 | Real QueryClient returns cached `r2` rather than current `r3`            |
| Remove pending gate on prior success feedback                    |               2 |                    1 / 10 |                    11 | Later pending state still displays `Image handoff completed.`            |

The durable-state fixture records a snapshot **inside** fan-out and asserts it **outside** the router's catch, so a swallowed assertion cannot masquerade as proof. It also reloads both the render editor and the publishing editor's sibling projection. Independent UI and backend adversarial reviewers found no remaining actionable issue after the UI cache and stale-feedback fixes.

### Prior repair verification commands

- `pnpm typecheck`: exit 0 (`tsc --noEmit`).
- `npx eslint .`: exit 0; `112 problems (0 errors, 112 warnings)`.
- `pnpm run lint:tenancy`: exit 0; `112 warnings across 38 files (baseline 112 across 38)`; `OK: no file exceeds its baseline.`
- Targeted command below: exit 0; `Test Files 9 passed (9)`; `Tests 97 passed (97)`. Worker concurrency is capped through the environment following the prior OOM interruption; project configuration is unchanged.

```sh
VITEST_MAX_WORKERS=2 pnpm vitest run \
  src/server/routers/marketing-task.test.ts \
  src/app/api/admin/marketing-studio-image/route.test.ts \
  src/lib/marketing/render-sanity.test.ts \
  src/lib/marketing/render-queries.test.ts \
  src/lib/marketing/render-handoff.test.ts \
  src/components/common/image-capture/capture.test.ts \
  src/components/admin/MarketingTabs.test.tsx \
  src/components/admin/marketing/StudioTaskProvider.test.tsx \
  src/components/admin/marketing/TaskEditorPage.test.tsx
```

- `VITEST_MAX_WORKERS=2 pnpm test`: exit 0; **`Test Files 679 passed (679)`**, **`Tests 10393 passed (10393)`**, duration 174.55 seconds. Default test timeout was unchanged. The run emitted jsdom navigation/canvas notices but no failed tests.

- `pnpm run knip`: exit 0; one existing configuration hint for `.storybook/mocks/tickets-provider.ts`.
- `pnpm format:check`: exit 0; `All matched files use Prettier code style!`.
- `git diff --check` and `git diff --cached --check`: exit 0.

### Prior visual attempts and subsequently confirmed verification

Both requested captures were attempted:

```sh
SHOOT_PORT=6116 pnpm shoot systems-marketing-promostudio--subjectless-task
SHOOT_PORT=6116 pnpm shoot systems-marketing-admin-taskeditorpage--pending-handoff
```

Those earlier attempts exited 1 with `Storybook did not come up on :6116`. Direct Storybook startup reported `SB_CORE-SERVER_0018 (NoFreePortError)`; retrying with `--host 127.0.0.1 -p 6116` failed as well. These failures describe the earlier session, not the current verification status.

The following subsequent evidence was confirmed in the PR #1072 repair brief:

- The pending-handoff Task editor state was rendered and visually inspected.
- The subjectless studio story was rendered and visually inspected.
- The StudioTaskProvider play test passed under the real Storybook test runner.

This records only those supplied results. It does not claim that the Task editor play assertions, every studio story, or every viewport passed, nor invent PNG paths, runner counts, or commands for those subsequent runs.

## PR #1072 Greptile repairs

### Scope and interpretation

- Restored spec §2.3: `studioRender` completes when `asset` is set, including while delivery is pending. The Task editor banner, retry control and warning are unchanged.
- Re-read and compare Task/variant recipient pairs after fan-out. In addition, atomically coordinate `setPrerequisites` and marker clearing using the Campaign revision. The clear uses the original Campaign revision, never the refreshed one. Missing revisions preserve recovery. Concurrent prerequisite edits can conservatively require a retry even when unrelated to this render.
- Pin the selected speaker/sponsor card above the unchanged full grid, retaining all original cards and download controls. A separate section identifies “Card for your Task”; the filter/Show-all detour was removed.
- Interpret sponsor selection as **UI preselection of already server-fetched, org-scoped data**, not a data-access filter. Parse `task`, `speaker`, `sponsor`, and `tab` through Zod in the server page. Invalid fields are discarded individually; valid neighboring selections survive.
- No dependency or production data changes. Persistence tests exercise emitted mutations and a simulated atomic revision conflict; they do not prove a live Sanity write. The late-interleaving test calls the actual `setPrerequisites` router with persistence mocked.

### Test-first and sabotage evidence

Each production mutation below was applied, the stated assertions failed (exit 1), the source was restored, and the same files passed (exit 0). File **and** test counts were checked on every run; none of these sabotage runs failed to import or collect tests. No mutation remains.

Test-first: completion produced 2 failed files / 2 failed + 63 passed tests (65); restoring the spec passed 2 files / 65 tests. Recipient changes produced 1 failed file / 2 failed + 53 passed tests (55), then 1 file / 55 passed. The later race test produced 1 failed file / 1 failed + 55 passed tests (56), then passed after the Campaign barrier. Studio pinning first failed on selected-card count (1 instead of 2), 1 file / 2 failed tests, then 1 file / 2 passed. Zod cases first failed on rendered values, 1 file / 4 failed + 2 passed tests (6), then 1 file / 6 passed; extended malformed-input cases brought the file to 15 passed tests.

| Mutation                                      | Named failing test / value                                                                                                                             | Red file counts        | Red test counts          | Restored files / tests |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- | ------------------------ | ---------------------- |
| Reinstate pending predicate in completion     | `completes a studio render once its asset is saved even while handoff is pending (spec §2.3)` and fresh editor recovery read: `complete` false vs true | 2 failed (2)           | 2 failed, 63 passed (65) | 2 / 65 passed          |
| Disable recipient comparison result           | `retains the pending marker when setPrerequisites ... after the handoff snapshot` (addition and variant replacement): stored marker false vs true      | 1 failed (1)           | 2 failed, 53 passed (55) | 1 / 55 passed          |
| Remove Campaign touch from prerequisite write | `retains the marker when setPrerequisites commits after the recipient recheck`: stored marker false vs true                                            | 1 failed, 2 passed (3) | 1 failed, 77 passed (78) | 3 / 78 passed          |
| Remove original Campaign revision from clear  | Same late-interleaving test plus pending-clear CAS argument regression                                                                                 | 1 failed, 2 passed (3) | 2 failed, 76 passed (78) | 3 / 78 passed          |
| Remove missing-Campaign-revision guard        | `keeps the pending marker when the campaign revision is unavailable`: stored marker false vs true                                                      | 1 failed, 2 passed (3) | 1 failed, 77 passed (78) | 3 / 78 passed          |
| Remove storage Campaign CAS                   | `keeps the pending marker when the campaign revision changes before finalization commits`: stored marker false vs true                                 | 1 failed, 2 passed (3) | 1 failed, 77 passed (78) | 3 / 78 passed          |
| Remove storage Campaign patch                 | Same storage conflict test plus `advances the campaign revision barrier in the same transaction as a prerequisite edit`                                | 1 failed, 2 passed (3) | 2 failed, 76 passed (78) | 3 / 78 passed          |
| Filter full grid to pinned card               | `pins the selected speaker above the unchanged full grid` and sponsor equivalent: other-card count 0 vs 1                                              | 1 failed (1)           | 2 failed, 13 passed (15) | 1 / 15 passed          |
| Disable pinned lookup                         | Same pin tests and valid-selection retention: selected-card count 1 vs 2                                                                               | 1 failed (1)           | 6 failed, 9 passed (15)  | 1 / 15 passed          |
| Bypass server Zod parse                       | Malformed/repeated/oversized/draft parameter cases: raw Task value or wrong selected tab reaches rendered props                                        | 1 failed (1)           | 13 failed, 2 passed (15) | 1 / 15 passed          |

Independent backend and UI/schema adversarial reviews found no remaining actionable source issues after strengthening the final race window. Source review does not certify visual fit.

### New pinning visual check

The new `StudioCardGrid` stories use the real grid and download controls with representative graphics. `SHOOT_PORT=6107 SHOOT_OUT=/tmp pnpm shoot systems-marketing-studiocardgrid--speaker-task 1440 1100` exited 1: `Storybook did not come up on :6107`. Direct `pnpm run storybook --ci --quiet -p 6107` exited 1 with `SB_CORE-SERVER_0018 (NoFreePortError)` and the sandbox port-binding diagnostic. No new pin-grid PNG was generated or inspected. This limitation applies to the **new pinning layout only**; it does not rescind the three previously confirmed results above.

### Fresh required command output

Required commands were run on the repaired working tree. Test worker concurrency was capped via `VITEST_MAX_WORKERS=2`, retaining the default timeout and repository configuration.

- `pnpm typecheck`: exit 0; `tsc --noEmit`.
- `npx eslint .`: exit 0; `112 problems (0 errors, 112 warnings)`.
- `pnpm run lint:tenancy`: exit 0; `112 warnings across 38 files (baseline 112 across 38).` / `OK: no file exceeds its baseline.`
- Targeted command below: exit 0; `Test Files 12 passed (12)`; `Tests 146 passed (146)`; duration 6.29s.

```sh
VITEST_MAX_WORKERS=2 pnpm vitest run \
  src/lib/marketing/sanity.test.ts \
  src/lib/marketing/task-sanity.test.ts \
  src/server/routers/marketing-task.test.ts \
  src/lib/marketing/render-queries.test.ts \
  src/lib/marketing/render-sanity.test.ts \
  src/lib/marketing/render-handoff.test.ts \
  src/app/api/admin/marketing-studio-image/route.test.ts \
  src/components/common/image-capture/capture.test.ts \
  src/components/admin/MarketingTabs.test.tsx \
  src/components/admin/marketing/StudioTaskProvider.test.tsx \
  src/components/admin/marketing/TaskEditorPage.test.tsx \
  __tests__/app/admin/marketing/studio-page.test.tsx
```

- `VITEST_MAX_WORKERS=2 pnpm test`: exit 0; `Test Files 680 passed (680)`; `Tests 10415 passed (10415)`; duration 177.65s. The run emitted jsdom navigation/canvas notices and the existing Vite config warning, with no failed tests.
- `pnpm run knip`: exit 0; one existing configuration hint for `.storybook/mocks/tickets-provider.ts`.

- `pnpm format:check`: exit 0; `All matched files use Prettier code style!`.
- `git diff --check` and `git diff --cached --check`: exit 0.
