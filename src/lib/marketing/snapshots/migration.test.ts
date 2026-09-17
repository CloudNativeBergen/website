import { describe, expect, it } from 'vitest'
import { backfillSnapshot } from '../../../../migrations/051-weaken-snapshot-campaign-ref/backfill'

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
  it('refuses unrecoverable joins rather than weakening an incomplete snapshot', () => {
    expect(() => backfillSnapshot(snapshot, new Map())).toThrow(
      'campaign no longer resolves',
    )
    expect(() =>
      backfillSnapshot(snapshot, new Map([['camp', campaign]])),
    ).toThrow('task task no longer resolves')
  })
})
