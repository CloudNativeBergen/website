import { describe, expect, it } from 'vitest'
import { evaluate, parse } from 'groq-js'
import type { MigrationContext } from 'sanity/migrate'
import type { SanityDocument } from '@sanity/types'
import migration from './index'

const conference = {
  _id: 'conference-a',
  _type: 'conference',
  _rev: 'c-rev',
  cfpStartDate: '2026-01-12',
  cfpEndDate: '2026-03-12',
  cfpNotifyDate: '2026-04-12',
  programDate: '2026-05-12',
  startDate: '2026-06-12',
  endDate: '2026-06-13',
}

function task(id: string, conferenceId = conference._id) {
  return {
    _id: id,
    _type: 'marketingTask',
    _rev: 'task-rev',
    conference: { _type: 'reference', _ref: conferenceId },
    kind: 'publishing',
    channel: 'linkedin',
    milestone: 'TICKETS_OPEN',
    offsetDays: 0,
  }
}

describe('plannedAt migration', () => {
  it('patches the scoped published Task with the exact computed stamp and revision', async () => {
    const dataset = [
      conference,
      task('task-a'),
      task('task-b', 'conference-b'),
      task('drafts.task-a'),
      task('versions.release.task-a'),
      { ...task('already-stamped'), plannedAt: '2026-01-01T07:00:00.000Z' },
    ]
    const client = {
      fetch: async (query: string, params: Record<string, unknown>) =>
        (await evaluate(parse(query), { dataset, params })).get(),
    }
    async function* documents() {
      yield conference as unknown as SanityDocument
      yield {
        ...conference,
        _id: 'drafts.conference-a',
      } as unknown as SanityDocument
      yield {
        ...conference,
        _id: 'versions.release.conference-a',
      } as unknown as SanityDocument
    }
    if (typeof migration.migrate !== 'function')
      throw new Error('Expected streaming migration')
    const patches = []
    for await (const mutation of migration.migrate(documents, {
      client,
    } as unknown as MigrationContext)) {
      patches.push(mutation)
    }
    expect(patches).toEqual([
      {
        type: 'patch',
        id: 'task-a',
        patches: [
          {
            path: ['plannedAt'],
            op: { type: 'setIfMissing', value: '2026-03-20T07:00:00.000Z' },
          },
        ],
        options: { ifRevision: 'task-rev' },
      },
    ])
  })
})
