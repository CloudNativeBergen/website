# Issue #1014 verification

Verified in `wt-1014` on 2026-09-16, based on the completed #1013 render/handoff changes.

## Implementation and decisions

- The Campaign ledger opens a manual speaker/sponsor outreach Task form. The
  server validates conference ownership and recipient standing/relationship.
  No built-in recipes: recipient choice stays explicit. Recipient-specific
  outreach is excluded when copying a plan to another edition.
- Materialization retains `targetPage`; the Task read model derives the tagged
  link and marketing `{token}` template; the editor supports destination changes
  and edited message submission. `utm_source=outreach` widens only the tagged
  link input, never the publishing `MarketingChannel` union.
- The existing `addMessage` transaction stages message creation, conversation
  timestamp, and revision-guarded Task `messageId` together. Sending never writes
  Task `status`; reads derive completion. There is no timestamp claim to strand.
- Existing conversation and notification helpers are reused, including loaded
  sponsor fan-out context, organizer author identity, `runAfterResponse`, the
  5000-character body schema, and a shared extraction of the existing throttle.
- Review fixed two retry defects: speaker conversation IDs now bind conference,
  Task, and recipient (and loaded contexts are checked before sending); stale
  destination edits can be reset and saved against the latest revision.
- #1013 pending studio handoff stories and all five existing editor tests remain.

## Commands and results

- `pnpm typecheck`: exit 0 (`tsc --noEmit`).
- `npx eslint .`: exit 0; **0 errors, 112 warnings**.
- `pnpm run lint:tenancy`: exit 0; **112 warnings across 38 files**, matching
  **112 across 38** in the baseline; no file exceeds its baseline.
- `pnpm run knip`: exit 0; one existing configuration hint to remove
  `.storybook/mocks/tickets-provider.ts` from `ignore`.
- `pnpm run format:check`: exit 0; all matched files use Prettier style.
- Initial targeted run: **7 files passed, 155 tests passed**.
- Expanded/restored targeted run: **7 files passed, 169 tests passed**.
- `pnpm test --maxWorkers=2`: exit 0; **682 files passed, 10,467 tests passed**
  in 175.84 seconds. Non-failing jsdom navigation/canvas notices were emitted.

Targeted command (two concurrent workers to keep memory bounded):

```sh
pnpm vitest run \
  src/server/routers/marketing-outreach.test.ts \
  src/lib/messaging/outreach-transaction.test.ts \
  src/lib/marketing/outreach/sanity.test.ts \
  src/lib/marketing/task-sanity.test.ts \
  src/lib/marketing/copy.test.ts \
  src/server/routers/marketing-task.test.ts \
  src/components/admin/marketing/TaskEditorPage.test.tsx --maxWorkers=2
```

## Atomicity evidence and limits

The router tests mock messaging boundaries and use real editor completion
projection. They prove submitted bodies, recipient/author parameters, distinct
refusals, no call to `addMessage` on already-sent or already-stale Tasks,
recovery after a persistence error, and completion after a lost commit response.
They do not prove storage atomicity.

The persistence tests execute real `addMessage` against an explicit atomic
transaction simulator. Failure is injected after staging the message and before
staging the Task completion; a retry produces exactly one persisted message
referenced by the completed Task. Overlapping same-revision sends have one
winner. Separately, the **real installed Sanity client** builds a single POST
request containing all three mutations, including `ifRevisionID` and the same
message id; an offline transport captures the request before any network use.
This proves the client transaction boundary, **not the live backend's rollback**.
Sanity transaction atomicity remains a service guarantee; no production writes
were made. The overlapping transaction loser may enter `addMessage`, but cannot
commit another message; the earlier router revision check refuses without it.

Notification fan-out is still best-effort. A lost commit response can leave a
complete Task/message without running its notification callback. This change
does not introduce a durable notification outbox or claim exactly-once email,
push, or hub delivery. Empty conversations from failed sends can remain; stable
IDs reuse them for the same recipient.

## Guard sabotage matrix

Every row is a separate mutation, restored immediately in a `finally` block.
Each run used `pnpm vitest run <affected-test-file> --maxWorkers=1`; every run
loaded **one test file**, retained the indicated total tests, and exited 1 for
assertion failures. There were no import/discovery failures or surviving mutations.
The first router batch had 46 tests; the second had 49 after adding missing-subject
and sponsor/wrong-type cases. Query tests had 10, transaction tests 7, editor tests 9.
The restored suite subsequently passed with all 169 tests.

| Removed/weakened guard         | File result  | Test result               |
| ------------------------------ | ------------ | ------------------------- |
| send kind                      | 1 failed (1) | 1 failed / 45 passed (46) |
| already sent                   | 1 failed (1) | 2 failed / 44 passed (46) |
| loaded revision                | 1 failed (1) | 1 failed / 45 passed (46) |
| open status                    | 1 failed (1) | 1 failed / 45 passed (46) |
| subject type                   | 1 failed (1) | 2 failed / 44 passed (46) |
| destination required           | 1 failed (1) | 1 failed / 45 passed (46) |
| speaker standing send          | 1 failed (1) | 8 failed / 38 passed (46) |
| sponsor relationship send      | 1 failed (1) | 1 failed / 45 passed (46) |
| throttle                       | 1 failed (1) | 1 failed / 45 passed (46) |
| conversation exists            | 1 failed (1) | 1 failed / 45 passed (46) |
| conversation tenant            | 1 failed (1) | 1 failed / 45 passed (46) |
| speaker thread kind            | 1 failed (1) | 1 failed / 45 passed (46) |
| speaker thread recipient       | 1 failed (1) | 1 failed / 45 passed (46) |
| sponsor thread kind            | 1 failed (1) | 1 failed / 45 passed (46) |
| sponsor thread recipient       | 1 failed (1) | 1 failed / 45 passed (46) |
| update outreach only           | 1 failed (1) | 1 failed / 45 passed (46) |
| update only open unsent        | 1 failed (1) | 2 failed / 44 passed (46) |
| campaign exists                | 1 failed (1) | 1 failed / 45 passed (46) |
| creation speaker standing      | 1 failed (1) | 1 failed / 45 passed (46) |
| creation sponsor relationship  | 1 failed (1) | 2 failed / 44 passed (46) |
| task tenant before read        | 1 failed (1) | 1 failed / 45 passed (46) |
| campaign tenant before read    | 1 failed (1) | 1 failed / 45 passed (46) |
| manual complete refusal        | 1 failed (1) | 1 failed / 45 passed (46) |
| body validation                | 1 failed (1) | 3 failed / 43 passed (46) |
| create destination schema      | 1 failed (1) | 3 failed / 43 passed (46) |
| update destination schema      | 1 failed (1) | 3 failed / 43 passed (46) |
| tagged same origin             | 1 failed (1) | 1 failed / 45 passed (46) |
| subject presence               | 1 failed (1) | 2 failed / 47 passed (49) |
| speaker standing predicate     | 1 failed (1) | 2 failed / 47 passed (49) |
| creation standing predicate    | 1 failed (1) | 1 failed / 48 passed (49) |
| sponsor tenant scope           | 1 failed (1) | 5 failed / 5 passed (10)  |
| sponsor matching subject       | 1 failed (1) | 2 failed / 8 passed (10)  |
| sponsor actual type            | 1 failed (1) | 1 failed / 9 passed (10)  |
| sponsor published              | 1 failed (1) | 1 failed / 9 passed (10)  |
| sponsor live version           | 1 failed (1) | 1 failed / 9 passed (10)  |
| campaign parent tenant         | 1 failed (1) | 1 failed / 9 passed (10)  |
| campaign tenant scope          | 1 failed (1) | 3 failed / 7 passed (10)  |
| campaign live documents        | 1 failed (1) | 2 failed / 8 passed (10)  |
| atomic Task CAS                | 1 failed (1) | 3 failed / 4 passed (7)   |
| atomic Task completion         | 1 failed (1) | 5 failed / 2 passed (7)   |
| retry conversation idempotency | 1 failed (1) | 1 failed / 6 passed (7)   |
| stale destination saving       | 1 failed (1) | 1 failed / 8 passed (9)   |
| stale body sending             | 1 failed (1) | 1 failed / 8 passed (9)   |
| wait for new destination       | 1 failed (1) | 1 failed / 8 passed (9)   |
| immediate sent state           | 1 failed (1) | 1 failed / 8 passed (9)   |

The destination regression was additionally demonstrated red before its fix:
**1 file; 1 failed + 8 passed (9 total)**, failing on the Save button's disabled
value (`false` instead of `true`); restored implementation passed all 9.

## Independent reviews

Two native reviewers independently checked transaction/tenancy/rate behavior
and UI/creation/link/#1013 compatibility. After fixing their recipient-retry and
stale-destination findings, both reviewed the final code and found no remaining
concrete actionable defects. Review is not a substitute for the missing visual
or live-service checks.

## Visual verification — blocked

Attempted:

```sh
SHOOT_PORT=6109 SHOOT_OUT=/tmp pnpm shoot systems-marketing-admin-taskeditorpage--speaker-outreach
SHOOT_PORT=6109 SHOOT_OUT=/tmp pnpm shoot systems-marketing-admin-createoutreachtask--sponsor
```

Both exited 1: `Storybook did not come up on :6109`. A direct diagnostic start
reported `SB_CORE-SERVER_0018 (NoFreePortError)` and explicitly reported that the
environment blocks listening on network ports. The MSW worker was initialized.
**No PNG was generated or viewed**, and Storybook interaction stories were not
executed. Visual inspection is outstanding, including the new
`systems-marketing-admin-taskeditorpage--outreach-destination-edit` story. UI
behavior has unit coverage but no rendered-browser verification in this sandbox.

## Repository delivery

No push, merge, or remote PR mutation was performed.

The requested commit amendment is blocked by the filesystem sandbox. Staging
failed with `Operation not permitted` creating
`/Users/oyr/projects/cndn/website/.git/worktrees/wt-1014/index.lock`. The worktree's
Git metadata is outside the writable roots. HEAD is unchanged; the completed
edits and this evidence file remain in the working tree. A conventional Lore
commit message is prepared at `/tmp/1014-commit-message.txt`; from an unrestricted
shell in this worktree, stage the changes and run
`git commit --amend -F /tmp/1014-commit-message.txt`. Do not push.
