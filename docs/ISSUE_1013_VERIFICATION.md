# Issue #1013: Promo studio as a Task tool

## Implementation

The existing studio stays at `/admin/marketing/studio` with all five tabs. Task links carry the Task and speaker/sponsor selection; subjectless Tasks open Conference Promo. Client navigation updates the selected tab. Downloads and attachments share the image-loading, proxy-rewriting, canvas, PNG, and cleanup lifecycle.

`POST /api/admin/marketing-studio-image` authorizes the current organization, guards the Task's conference before reading its contents, and binds the uploaded image to that Task under its revision. `marketing.task.attachAsset` accepts only that Task's bound upload (or its already-saved output for retries), writes a Sanity image object, and leaves `status` untouched. The existing tool-only completion refusal stays in place.

A pure selector chooses publishing siblings that list this render as a Prerequisite. The handoff checks the tenant-scoped post and variant, then commits the post image and the variant's selection in one transaction, guarded by both revisions. Existing post attachments are preserved. Alt text uses the Task's alt or a nonempty title/subject fallback.

Completion commits before fan-out. Exceptions and unavailable publishing recipients are returned as explicit failures; the studio retains the upload and offers a retry without recapture/upload. No new dependencies.

## Verification boundaries

- Unit tests exercise generated revision-protected mutations; they do not prove a live Sanity commit. No production data was written.
- GROQ fixtures execute the real query strings and completion projection using `groq-js`.
- A failed handoff leaves the render saved. Its retry button/message are session-local and disappear on reload/navigation; the API can retry the saved asset.
- Uploading successfully and then losing the Task revision race can leave an unreferenced image. It is not deleted automatically because Sanity may deduplicate that upload to a shared asset.
- Visual verification was attempted with `SHOOT_PORT=6106 pnpm shoot systems-marketing-promostudio--subjectless-task`. Storybook reports `SB_CORE-SERVER_0018 (NoFreePortError)` because this sandbox blocks port binding. A separate Chromium launch fails with `bootstrap_check_in Permission denied (1100)` / SIGTRAP. No PNG was produced or inspected, and no visual pass is claimed. The story must be inspected in a permitted environment.
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

Two independent adversarial reviews inspected backend and UI behavior. The sponsor selection index and empty-selection feedback were corrected; no further actionable issues were reported. Review is not a substitute for the blocked visual inspection.

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
