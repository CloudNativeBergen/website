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
  it('preserves all metadata and task keys before weakening the campaign reference', () => {
    expect(backfillSnapshot(snapshot, docs)).toEqual({
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
          sessions: 7,
          taskKey: 'cfp:launch',
        },
      ],
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
    const fields = backfillSnapshot(snapshot, new Map([['camp', campaign]]))
    const rows = fields.perTask as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].taskKey).toBeUndefined()
    expect((rows[0].task as { _ref: string })._ref).toBe('task')
    expect(fields.campaignKey).toBe('cfp')
  })
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
