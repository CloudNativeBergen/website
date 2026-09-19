import { describe, expect, it } from 'vitest'
import {
  backfillSnapshot,
  weakenOwnerRefs,
} from '../../../../migrations/052-weaken-snapshot-campaign-ref/backfill'

const campaign = {
  _id: 'camp',
  key: 'cfp',
  title: 'Call',
  primaryOutcome: 'cfpSubmissions',
  target: 0,
  startDate: '2026-02-01',
  endDate: '2026-03-01',
}
const snapshot = {
  _id: 'snap',
  campaign: { _type: 'reference', _ref: 'camp' },
  perTask: [{ _key: 'row', task: { _ref: 'task', _weak: true }, sessions: 7 }],
}
const docs = new Map<string, Record<string, unknown>>([
  ['camp', campaign],
  ['task', { key: 'cfp:launch' }],
])

describe('mandatory snapshot backfill', () => {
  it('copies identity, and refuses to invent the measurement basis', () => {
    // Identity is copied — the key is what keeps a reading attributable once
    // its Campaign is gone, and the Report drops a retired Campaign from the
    // breakdown entirely without the Outcome.
    //
    // The WINDOW is not. It describes what the reading was measured against,
    // and the Campaign's current dates are not evidence of what they were
    // then: #1078 re-dates windows whenever a Milestone is set.
    // Writing today's window onto a historical row would make the Report treat
    // that reading as measured over a span it never covered, permanently —
    // the true one is not recoverable afterwards.
    expect(backfillSnapshot(snapshot, docs)).toEqual({
      campaign: { _type: 'reference', _ref: 'camp', _weak: true },
      campaignKey: 'cfp',
      campaignTitle: 'Call',
      campaignPrimaryOutcome: 'cfpSubmissions',
      // A goal, not a measurement property: the Report reads a target from the
      // LIVE Campaign and keeps this copy for RETIRED ones, so a Campaign
      // migrated and then deleted would otherwise lose its goal entirely.
      campaignTarget: 0,
      perTask: [
        {
          _key: 'row',
          task: { _ref: 'task', _weak: true },
          sessions: 7,
          taskKey: 'cfp:launch',
        },
      ],
    })
  })
  it('does not stamp a re-dated window onto a reading taken before the move', () => {
    // The concrete harm. A Milestone is set, #1078 re-dates the Campaign
    // window, and the migration then runs over readings taken under the OLD
    // window. Copying the Campaign's current dates would make the Report treat
    // those readings as measured over a span they never covered — and
    // `strictWindow` counts cfpSubmissions and ticketsSoldInWindow strictly
    // inside it, so the numbers would be attributed to the wrong period for
    // good.
    const moved = {
      ...campaign,
      startDate: '2026-05-01',
      endDate: '2026-06-01',
    }
    const written = backfillSnapshot(
      snapshot,
      new Map<string, Record<string, unknown>>([
        ['camp', moved],
        ['task', { key: 'cfp:launch' }],
      ]),
    )
    expect('campaignStartDate' in written).toBe(false)
    expect('campaignEndDate' in written).toBe(false)
    // Identity still lands, so the reading stays attributable and deletable —
    // and the goal with it, which the Report would have read live anyway.
    expect(written.campaignKey).toBe('cfp')
    expect(written.campaignTarget).toBe(0)
  })

  it('keeps a window a NEWER snapshot already recorded for itself', () => {
    // Rows the cron wrote natively carry their own basis; the migration must
    // leave those exactly as they are rather than treating them as gaps.
    // Deliberately NOT the fixture Campaign's window. With the two equal, the
    // assertion below passed just as well when the migration copied the live
    // dates over them, which is the behaviour this test exists to refuse.
    const own = {
      ...snapshot,
      campaignStartDate: '2025-11-03',
      campaignEndDate: '2025-12-24',
    }
    const written = backfillSnapshot(own, docs)
    expect({ ...own, ...written }).toMatchObject({
      campaignStartDate: '2025-11-03',
      campaignEndDate: '2025-12-24',
    })
  })

  it('keeps historical values on rerun after campaign edits or deletion', () => {
    const migrated = { ...snapshot, ...backfillSnapshot(snapshot, docs) }
    expect({ ...migrated, ...backfillSnapshot(migrated, new Map()) }).toEqual(
      migrated,
    )
  })
  it('refuses an unrecoverable Campaign join rather than weakening an unattributable snapshot', () => {
    expect(() => backfillSnapshot(snapshot, new Map())).toThrow(
      'campaign no longer resolves',
    )
  })
  it('keeps a perTask row whose Task is already deleted, without a key', () => {
    // `task.delete` predates this migration and the perTask reference is weak,
    // so dangling rows are expected. Throwing would block the migration — and
    // deletion with it — on data nobody can restore; there is no key left to
    // recover and the Report renders the row as "Deleted Task" either way.
    // The row here is already weak, so nothing about it changes and no
    // `perTask` patch is emitted — the stored row simply survives as it is.
    // What matters is that the Campaign metadata still lands and nothing throws.
    const fields = backfillSnapshot(snapshot, new Map([['camp', campaign]]))
    expect(fields.perTask).toBeUndefined()
    expect(fields.campaignKey).toBe('cfp')

    // With a row that DOES need rewriting, the dangling row is re-emitted and
    // is still keyless rather than blocking the migration.
    const strongRow = {
      ...snapshot,
      perTask: [{ _key: 'row', task: { _ref: 'task' }, sessions: 7 }],
    }
    const rows = backfillSnapshot(strongRow, new Map([['camp', campaign]]))
      .perTask as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].taskKey).toBeUndefined()
    expect(rows[0].task).toEqual({ _ref: 'task', _weak: true })
  })
})

it('writes nothing for a Snapshot both passes have already finished', () => {
  // `weakenOwnerRefs` returns null when clean, so `index.ts` skips the
  // document. This pass set `campaign` and `perTask` unconditionally, so it
  // always reported a change and the migration re-patched EVERY Snapshot on
  // every run — thousands of them in a dataset with history — bumping each
  // revision and `_updatedAt` for no change in value.
  const done = {
    ...snapshot,
    campaign: { _type: 'reference', _ref: 'camp', _weak: true },
    campaignKey: 'cfp',
    campaignTitle: 'Call',
    campaignPrimaryOutcome: 'cfpSubmissions',
    campaignTarget: 0,
    campaignStartDate: '2026-02-01',
    campaignEndDate: '2026-03-01',
    perTask: [
      {
        _key: 'row',
        task: { _ref: 'task', _weak: true },
        taskKey: 'cfp:launch',
        sessions: 7,
      },
    ],
  }
  expect(backfillSnapshot(done, docs)).toEqual({})
  // One field left undone is still picked up.
  expect(
    backfillSnapshot({ ...done, campaign: { _ref: 'camp' } }, docs),
  ).toEqual({ campaign: { _ref: 'camp', _weak: true } })
})

it('skips a Snapshot that has no campaign reference at all', () => {
  // A half-filled Studio draft. It used to throw "restore the Campaign from
  // backup" — not actionable for a document that never had one — and because
  // deletion refuses until this migration completes, one such draft made every
  // plan permanently undeletable.
  const orphan = { ...snapshot }
  delete (orphan as { campaign?: unknown }).campaign
  expect(backfillSnapshot(orphan, docs)).toEqual({})
})

describe('weakening the references that refuse a delete', () => {
  it('weakens every reference the schema declares weak, including nested ones', () => {
    // A list of only the top-level trio left four of the nine strong for ever,
    // three of them permanently rather than for the pre-migration window.
    const before = {
      _id: 'task-1',
      campaign: { _type: 'reference', _ref: 'camp' },
      plan: { _type: 'reference', _ref: 'plan' },
      post: { _type: 'reference', _ref: 'post' },
      variant: { _type: 'reference', _ref: 'variant' },
      copiedFrom: { _type: 'reference', _ref: 'old-plan' },
      prerequisites: [
        { _type: 'reference', _ref: 'task-0', _key: 'a' },
        { _type: 'reference', _ref: 'task-x', _key: 'b', _weak: true },
      ],
      perTask: [{ _key: 'p', task: { _type: 'reference', _ref: 'task-9' } }],
    }
    const fields = weakenOwnerRefs(before)!
    for (const name of ['campaign', 'plan', 'post', 'variant', 'copiedFrom'])
      expect(fields[name]).toMatchObject({ _weak: true })
    expect(fields.prerequisites).toEqual([
      { _type: 'reference', _ref: 'task-0', _key: 'a', _weak: true },
      { _type: 'reference', _ref: 'task-x', _key: 'b', _weak: true },
    ])
    expect(fields.perTask).toEqual([
      {
        _key: 'p',
        task: { _type: 'reference', _ref: 'task-9', _weak: true },
      },
    ])
  })

  it('returns null when everything is already weak, so a re-run writes nothing', () => {
    expect(
      weakenOwnerRefs({
        campaign: { _type: 'reference', _ref: 'camp', _weak: true },
        perTask: [
          { _key: 'p', task: { _type: 'reference', _ref: 't', _weak: true } },
        ],
      }),
    ).toBeNull()
  })
})

it('weakens perTask task references through BOTH passes in order', () => {
  // The Snapshot pass is yielded after the owner-reference pass, so re-emitting
  // perTask from the raw document silently undid the `_weak: true` the other
  // pass had just set. Testing `weakenOwnerRefs` in isolation could not see it.
  const raw = {
    ...snapshot,
    perTask: [{ _key: 'p', task: { _type: 'reference', _ref: 'task-1' } }],
  }
  const owner = weakenOwnerRefs(raw)!
  expect(owner.perTask).toEqual([
    { _key: 'p', task: { _type: 'reference', _ref: 'task-1', _weak: true } },
  ])
  // The order the migration actually yields them in.
  const applied = { ...raw, ...owner, ...backfillSnapshot(raw, docs) }
  expect(
    (applied.perTask as { task: { _weak?: boolean } }[])[0].task._weak,
  ).toBe(true)
})
