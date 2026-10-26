# J5: Message Category judged — verification record

This work implements issue #1586 locally on `feat/content-judgement-j5` in
`/Users/oyr/projects/cndn/wt-1586`. No network, `gh`, push, or production writes
were used. The existing worktree was the authorized isolation boundary.

## Implementation and first-message paths

All five production message producers converge on `addMessage` in
`src/lib/messaging/sanity.ts:1612`. Conversation creation alone does not trigger
judging.

| Producer                                                     | Creation / message write                                                                                                         | Coverage                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Speaker or organizer, proposal                               | `src/server/routers/message.ts:390`, `:474`                                                                                      | Real `ensureProposalConversation` + `addMessage`, both author roles; existing router tests           |
| Speaker or organizer, general or existing empty conversation | `src/server/routers/message.ts:435`, `:474`                                                                                      | Real `createGeneralConversation` + `addMessage`, both author roles; stored-state tests               |
| Marketing outreach                                           | `src/server/routers/marketing.ts:1272`, `:1333`                                                                                  | Router keeps origin person/absent; real opening test also checks atomic Task completion              |
| Proposal action relay                                        | `src/server/routers/proposal.ts:1967`, `:1976`                                                                                   | Cancel, withdraw, and all four typed-comment relays are system / proposal_status                     |
| Co-speaker removal notice                                    | `src/server/routers/proposal.ts:2217`, `:2224`                                                                                   | Removal notice with and without typed comment is system / proposal_status                            |
| Sponsor producers (excluded)                                 | `src/server/routers/message.ts:577`, `src/server/routers/marketing.ts:1266`, `src/server/routers/sponsorMessages.ts:141`, `:157` | Organizer/sponsor author variants on sponsor threads bypass judging; message delivery still succeeds |

The stored message count and parent revision are read together, including on
legacy conversations with no marker. The opening's message transaction uses
`ifRevisionId` on the parent, which every message transaction updates. A losing
starter re-reads and appends as a reply. A 409 from an unchanged parent is
re-thrown: a stale outreach Task must refuse once, rather than retry forever.

A first system message sets its event category in that same message transaction.
A later system message never sets a category, including on an unjudged thread.
A first person message schedules the task through the existing never-fail
`runAfterResponse`. It obtains one live-gated judge for the owning organization,
uses the existing org-scoped organizer lookup for `openedBy`, and sends the
shared `{ subject, message, openedBy }` request. Sponsors never reach the judge.

A successful task writes the shared `judgementDocument` (surface `conversation`,
part `opening`) and the category in one transaction. Whole-object `setIfMissing`
is the write-time category guard, preserving organizer, system, and earlier Jev
categories, including an organizer override made while the fetch is in flight.
The deterministic judgement uses `createIfNotExists`. Failures leave no category.
Raw settings exceptions were removed from logging; all new failure logs contain
fixed categories only. The judgement record stores no subject or body.

No UI, organizer-category mutation, or new tRPC procedure was added. Mutation
surface snapshots therefore remain unchanged. `questions.ts`, `store.ts`, and
`store.test.ts` were not changed. The existing judgement helper, messaging
transaction, organizer lookup, and after-response helper are reused.

## Guard sabotage

The implementation and its tests were committed before sabotage (commit
`889949ac`). Each mutation was applied alone and restored byte-for-byte in a
`finally` block. `git status --porcelain` was asserted empty before the first
mutation and after every restoration. Each run asserted the expected file count
and the unchanged discovered test count, and required at least one actual failed
assertion. Import/discovery errors did not count as a kill.

Baseline and final restored runs: **4 files / 208 tests passed, 0 failed**.
The baseline was 39 opening tests, 89 proposal tests, 12 removal tests, and 68
outreach tests. Counts below include skipped tests under targeted name filters.
All rows ran one file; the total is checked against that file's baseline.

| Guard removed or corrupted             | Specific failing test (first when several)                                                                                                           | Failed / passed / skipped / total |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Parent id predicate                    | conversation opening: executed GROQ and first-message ownership derives each tenant from its own parent and never counts another thread’s messages   | 1 / 0 / 38 / 39                   |
| Message correlation predicate          | conversation opening: executed GROQ and first-message ownership derives each tenant from its own parent and never counts another thread’s messages   | 1 / 0 / 38 / 39                   |
| Existing-message guard                 | conversation opening: executed GROQ and first-message ownership does not judge legacy threads with existing stored messages                          | 1 / 0 / 38 / 39                   |
| Opening revision precondition          | conversation opening: executed GROQ and first-message ownership concurrent first writers commit both messages but only the revision winner is judged | 1 / 0 / 38 / 39                   |
| Retry after a parent revision conflict | conversation opening: executed GROQ and first-message ownership concurrent first writers commit both messages but only the revision winner is judged | 1 / 0 / 38 / 39                   |
| Unchanged-parent Task conflict guard   | conversation opening: executed GROQ and first-message ownership a stale outreach Task fails once without retrying an unchanged parent revision       | 1 / 0 / 38 / 39                   |
| Sponsor exclusion                      | system and sponsor openings a organizer-authored sponsor opening is never judged                                                                     | 1 / 1 / 37 / 39                   |
| System bypass of Jev                   | system and sponsor openings writes the event category with the first system message without calling Jev                                              | 1 / 0 / 38 / 39                   |
| System category only on first message  | system and sponsor openings a system reply to an unjudged legacy opening does not assign a category                                                  | 1 / 0 / 38 / 39                   |
| Jev whole-object setIfMissing          | write-time category guard preserves an organizer override written while the Jev fetch is in flight                                                   | 1 / 0 / 38 / 39                   |
| System whole-object setIfMissing       | write-time category guard a system opening also preserves an existing organizer setting                                                              | 1 / 0 / 38 / 39                   |
| Off/null judge exit                    | conversation opening: executed GROQ and first-message ownership does not judge a later reply when the opening was written while disabled             | 1 / 0 / 38 / 39                   |
| Failed outcome exit                    | never-fail on both person write paths speaker-a: message succeeds when 402 (+1)                                                                      | 2 / 0 / 37 / 39                   |
| Task never-fail catch                  | never-fail on both person write paths speaker-a: message succeeds when real judge rejects on unexpected response access (+1)                         | 2 / 0 / 37 / 39                   |
| Opening read never-fail catch          | never-fail on both person write paths an opening lookup failure still delivers the person’s message                                                  | 1 / 0 / 38 / 39                   |
| Task log redaction                     | never-fail on both person write paths speaker-a: message succeeds when missing API key (+1)                                                          | 2 / 0 / 37 / 39                   |
| Organizer membership check             | conversation opening: executed GROQ and first-message ownership general first message by organizer-a is judged after its response as organizer (+1)  | 2 / 0 / 37 / 39                   |
| Action relay origin/category markers   | proposal router action organizer cancel / withdraw posts the comment to the thread and fans it out, no formal email by default (+8)                  | 9 / 80 / 0 / 89                   |
| Removal notice origin/category markers | proposal.admin.removeSpeaker posts to the thread and tells the removed speaker and Slack (+1)                                                        | 2 / 10 / 0 / 12                   |
| Outreach remains person                | marketing outreach delivery sends the submitted speaker body, atomically requests completion, and reads real derived completion                      | 1 / 67 / 0 / 68                   |
| Settings log redaction                 | never-fail on both person write paths speaker-a: message succeeds when settings read throws (+1)                                                     | 2 / 0 / 37 / 39                   |

The privacy tests inspect `Error.message` explicitly; plain JSON serialization
of an Error would have hidden the settings-error leak. Expected failure outcomes
also check error-log counts, so removing their early exit cannot hide behind the
task's outer catch. The stale-Task test rejects a retry with a distinct error,
so a loop or an unrelated rejection cannot pass as the expected 409.

## Verification

- `npx tsc --noEmit -p .`: exit 0 after final source/test changes.
- `npx eslint` on all 11 changed TS files: exit 0, zero lint errors.
  The two legacy `__tests__/api/trpc` files are ignored by repository config
  (two explicit ignored-file warnings); the other nine files were linted.
- `npx prettier --check` on all 11 changed TS files: exit 0. This verification
  document was then formatted and checked separately.
- `pnpm run lint:tenancy`: exit 0; **107 warnings / 37 files**, unchanged from
  **107 / 37** baseline. No new file warnings and no raised ceilings.
- `pnpm run lint:routers`: exit 0; **35 / 37** routers tested (baseline allows
  the other two). No new procedures or mutation snapshot changes.
- `npx knip`: exit 0; one existing configuration hint for
  `.storybook/mocks/tickets-provider.ts` in `knip.json`.
- Opening suite: **1 file / 39 tests passed**. Schema contract: **1 / 25**.
  Existing messaging checks: **5 / 103**. Proposal/removal/outreach: **3 / 169**.
  Earlier aggregate before the last three opening cases: **14 / 378 passed**.
  Every run checked both discovered files and tests.
- Sabotage baseline and restored run: **4 files / 208 tests passed**, zero
  failed, clean git status after restoration. **21 / 21** mutations killed by
  actual assertion failures, with file/test discovery checked per mutation.
- Full `npx vitest run`, executed **once** after restoration: exit 1;
  **1191 passed + 6 failed = 1197 files**;
  **19405 passed + 2 failed + 20 skipped = 19427 tests**; **4 unhandled errors**;
  **171.99 seconds**. No J5 test failed.

### Full-suite failures (sandbox restrictions)

| File                                                      | Failure                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `scripts/ci-build.test.ts`                                | One test: the tsx CLI cannot create its IPC socket (`listen EPERM`); returns 1 instead of stub build's 3 |
| `__tests__/scripts/erase-speaker-cli.test.ts`             | One test: same tsx IPC `listen EPERM`, before the CLI can print usage                                    |
| `src/lib/feedback/summary.real-client.test.ts`            | beforeAll listener denied at `0.0.0.0`; hook timeout, seven tests skipped                                |
| `src/lib/marketing-asset/move.real-client.test.ts`        | Local HTTP listener denied at `127.0.0.1`; hook timeout, nine tests skipped                              |
| `src/lib/marketing-asset/blob-delete.real-client.test.ts` | Local HTTP listener denied at `127.0.0.1`; hook timeout, two tests skipped                               |
| `src/lib/photo-wall/submit.upload.real-client.test.ts`    | Local HTTP listener denied at `127.0.0.1`; hook timeout, two tests skipped                               |

The last four produced the four unhandled `listen EPERM` errors. These files and
their production implementations were not changed. A standalone reproduction
with an offline failing-build stub confirmed the ci-build tsx IPC error. Running
the same unchanged script with `node --import tsx scripts/ci-build.ts` instead
(no CLI IPC server) returned the expected **3** and passed stdout/stderr through.
No permissions were escalated and the full suite was not rerun.

## Changed files

| File                                                       | Purpose                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| `sanity/schemaTypes/message.ts`                            | Optional message origin                                         |
| `sanity/schemaTypes/conversation.ts`                       | Category object schema                                          |
| `src/lib/messaging/types.ts`                               | Origin and category types                                       |
| `src/lib/messaging/sanity.ts`                              | Origin roundtrip, opening CAS, system category, task scheduling |
| `src/lib/content-judgement/conversation.ts`                | Opening snapshot and never-fail judging transaction             |
| `src/lib/content-judgement/settings.ts`                    | Omit raw settings errors from logs                              |
| `src/server/routers/proposal.ts`                           | Both system relay markers                                       |
| `src/lib/content-judgement/conversation.test.ts`           | 39 real-client/SDK/GROQ boundary cases                          |
| `__tests__/api/trpc/proposal.test.ts`                      | Action relay coverage                                           |
| `__tests__/api/trpc/proposal-admin-remove-speaker.test.ts` | Removal notice coverage                                         |
| `src/server/routers/marketing-outreach.test.ts`            | Outreach remains person                                         |
| `docs/CONTENT_JUDGEMENT_J5_VERIFICATION.md`                | Local evidence in place of a network PR body                    |

## Limits and remaining work

- Live smoke with a staging OpenRouter key and test conference remains open,
  explicitly outside this offline task.
- GROQ is executed by `groq-js` on two conference/organization datasets. The
  installed SDK's actual Transaction/Patch builders establish submitted mutation
  shape. The in-memory storage boundary exercises preconditions/atomicity but
  does **not** establish Sanity backend isolation or indexing behavior.
- Timeout tests use an abort-aware stalled fetch and fake timers; unexpected
  real-judge rejection is produced by a response getter that throws. These are
  boundary tests, not claims about a live provider.
- Two independent adversarial reviews (correctness and privacy/never-fail),
  repeated after test completion, found no actionable issue. The optional Qodo
  rules service could not be consulted without network access.
