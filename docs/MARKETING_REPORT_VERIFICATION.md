# Marketing Report — issue #1019

Implemented on `feat/marketing-1019`, without pushing or opening a PR.

## Semantics and implementation

- `marketing.report.get`, `exportCsv`, and `exportPdf` use one `loadReport` / `ReportView` pipeline. Reads are tenant-scoped; the request domain supplies the conference. The strict input schema refuses client tenant selectors. No vendor calls or live Outcome recomputation occur.
- Dates are a half-open observation range, not an activity range or period increment. The default starts at the earliest Campaign and ends at the latest Campaign end + `ATTRIBUTION_TAIL_DAYS + 1`, including the seventh grace day.
- Daily grain passes observations through. Weekly grain selects the last measured field in each conference-timezone week. It never sums or maximizes observations. Missing readings stay null or retain a measurement within the bucket. Primary retention indicators come from the actual final primary reading, independent of unrelated vendor statuses.
- Summary and top-ten ranking use the last measured fields in the selected range. Ranking is combined CFP/sponsor/checkout clicks, then sessions. Channel stages contain Task sessions and combined clicks only. Unknown constituent values keep Channel totals unknown; unresolved Tasks retain an unknown Channel. Campaign/Task observations are not unique edition totals.
- Health counts independently include waiting/failed overdue Tasks. Health remains first through the latest Campaign end, including post-event Campaigns, then moves last.
- Previous edition means the latest strictly earlier edition in the organization. Matching Campaign keys alone is insufficient. Comparable strict CFP/ticket windows require matching Outcome types, conference-relative boundaries, and complete observations. Attribution and all-time comparisons explain why publication windows/post ages cannot be established from stored Snapshots.
- CSV preserves original daily Campaign/Task rows regardless of display grain, including weak Task references that no longer resolve, nulls, source status and per-counter readings. `csvDocument` protects formula-like text.
- PDF renders the shared model with six sections, curves, Campaign windows and Milestones. Web discovery is present on the Marketing Plan and in the admin navigation/destination registry.

New report engines, exports, section components, stories and tests are in separate files. Router/schema additions are separate blocks to keep sibling-PR integration textual. Existing timeline geometry and CSV guards are reused; no dependencies or stored schema fields were added.

## Sabotage evidence

Each temporary mutation was restored. Counts below are collected files/tests, including failing runs; no import/collection failure was accepted as proof.

| Removed or corrupted behavior                    | Files/tests | Observed failure                                                              |
| ------------------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| Strict report input rejects tenant substitution  | 1 / 15      | 3 failures: get/CSV/PDF resolved instead of rejecting                         |
| Valid calendar dates                             | 1 / 15      | 1 failure: impossible date accepted                                           |
| Both boundaries required together                | 1 / 15      | 2 failures: one-sided ranges accepted                                         |
| Exclusive end after start                        | 1 / 15      | 2 failures: equal/reversed ranges accepted                                    |
| Organizer middleware                             | 1 / 15      | 3 failures: foreign organizer read/exports succeeded                          |
| Page authorization branch                        | 1 / 2       | 2 failures, including report content rendered instead of Access Denied        |
| Client range validation                          | 1 / 2       | 1 failure: inverted range reached the query input                             |
| CSV formula guard                                | 1 / 4       | 1 failure: `=1+1` remained unescaped instead of apostrophe-prefixed           |
| Empty Snapshot scope guard                       | 2 / 14      | 1 failure: read succeeded                                                     |
| Future-edition exclusion                         | 2 / 14      | 1 failure: future edition selected                                            |
| Last observation changed to max                  | 2 / 14      | 4 value failures                                                              |
| Null carry-forward removed                       | 2 / 14      | 1 value failure                                                               |
| Inclusive final grace day removed                | 2 / 14      | 1 date-boundary failure                                                       |
| Failed Tasks excluded from overdue               | 2 / 14      | 1 count failure                                                               |
| Completed Tasks included in open health          | 2 / 14      | 1 count failure                                                               |
| Outcome compatibility removed                    | 2 / 14      | 1 comparison failure                                                          |
| Relative window compatibility removed            | 2 / 14      | 1 comparison failure                                                          |
| Retention reverted to vendor-status heuristic    | 2 / 18      | 4 freshness-value failures                                                    |
| Empty loader conference guard                    | 2 / 22      | 1 failure: distinct forbidden plan-read sentinel reached; zero reads asserted |
| All-time window incompatibility removed          | 2 / 22      | 1 comparison failure                                                          |
| First-publication window incompatibility removed | 2 / 22      | 1 comparison failure                                                          |
| Complete observation requirement removed         | 2 / 22      | 1 comparison failure                                                          |

Restored model/data run: **2 files / 22 passed**. Restored router/page run: **2 files / 17 passed**. Restored UI/geometry run: **2 files / 15 passed**. Restored CSV/PDF run: **2 files / 6 passed**. Combined targeted run: **8 files / 60 passed**.

Router tests run the real scoped loader and real PDF renderer over nonempty storage fixtures. They assert numeric values in decoded PDF text and CSV output, explicit refusals before data reads, and the null-shaped no-previous-edition result. Storage fixtures are not proof of a live Sanity response.

## Visual inspection and remaining holes

The required commands were attempted with `SHOOT_PORT=6108 pnpm shoot systems-marketing-report--<story>` for `summary`, `channels`, `timeline`, `tasks`, `comparison`, `health`, `empty-plan`, and `unavailable-sources`. All exited 1: `[shoot] Storybook did not come up on :6108`. Starting Storybook directly, including `--host 127.0.0.1`, failed with `SB_CORE-SERVER_0018 NoFreePortError`. Direct Chromium also failed with SIGTRAP / `MachPortRendezvousServer` permission denied. No web-story PNG was produced or inspected. Phone-width UI visual verification remains outstanding; component tests and code review do not replace it.

A real PDF fixture was rendered using native macOS PDFKit and the PNG inspected. Title spacing, footer, six sections, a decreasing curve, Campaign window and Milestone were visually checked. This covered a nonempty single-Campaign PDF, not a large multi-page edition.

Two independent adversarial reviews found freshness-label, range-error recovery and empty-observation messaging issues. All were fixed and re-reviewed; both reviewers reported no remaining actionable findings. That is code review evidence, not browser or production evidence.

## Final command results

| Command                                     | Result                                                                                               |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                            | Exit 0; `tsc --noEmit` completed without errors                                                      |
| `npx eslint .`                              | Exit 0; `112 problems (0 errors, 112 warnings)`                                                      |
| `pnpm run lint:tenancy`                     | Exit 0; `112 warnings across 38 files (baseline 112 across 38)`; `OK: no file exceeds its baseline.` |
| Targeted `pnpm vitest run` below            | Exit 0; `Test Files 8 passed (8)`, `Tests 60 passed (60)`                                            |
| `pnpm test`                                 | Exit 0; `Test Files 678 passed (678)`, `Tests 10378 passed (10378)`; 189.03 seconds                  |
| `pnpm exec knip`                            | Exit 0; existing configuration hint to remove `.storybook/mocks/tickets-provider.ts` from ignore     |
| Prettier check on changed source/test files | Exit 0; all matched files use Prettier code style                                                    |
| `git diff --check`                          | Exit 0                                                                                               |

```sh
pnpm vitest run \
  __tests__/marketing/report-model.test.ts \
  __tests__/marketing/report-data.test.ts \
  __tests__/marketing/report-page.test.tsx \
  src/server/routers/marketing-report.test.ts \
  src/lib/marketing/report-csv.test.ts \
  src/lib/marketing/report-pdf.test.ts \
  src/components/admin/marketing/report/MarketingReportPage.test.tsx \
  src/components/admin/marketing/timeline-model.test.ts
```

The full suite emitted jsdom navigation/canvas-not-implemented messages and the existing Vite configuration warning, with no failed tests. ESLint's warnings are the unchanged tenancy baseline. No production build, live Sanity integration, or browser download end-to-end run was performed.
