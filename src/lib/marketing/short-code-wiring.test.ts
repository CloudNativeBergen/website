import { describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

import { materializeTask, type MaterializeInput } from './materialize'
import { taskDocument, variantDocument } from './sanity'
import { sequentialShortCodes } from './short-code'
import { expandTemplate } from './seed'
import { BUILTIN_TEMPLATE } from './template'
import type { TaskKind } from './types'

const CONFERENCE = {
  _id: 'conf-1',
  title: 'Cloud Native Days Norway',
  city: 'Bergen',
  baseUrl: 'https://cloudnativebergen.dev',
  cfpStartDate: '2026-11-01',
  cfpEndDate: '2026-12-01',
  cfpNotifyDate: '2026-12-15',
  programDate: '2027-01-15',
  startDate: '2027-03-01',
  endDate: '2027-03-02',
}

function build(kind: TaskKind, newShortCode: () => string) {
  const input: MaterializeInput = {
    recipe: {
      key: 'beat',
      beat: 'beat',
      title: 'A Task',
      kind,
      ...(kind === 'publishing' ? { channel: 'bluesky' as const } : {}),
      targetPage: '/program',
      subjectSource: 'none',
    },
    taskId: 'marketingTask.t1',
    key: 'beat:bluesky',
    campaign: { _id: 'marketingCampaign.c1', key: 'cfp' },
    planId: 'marketingPlan.p1',
    conference: { _id: 'conf-1', baseUrl: CONFERENCE.baseUrl },
    values: {},
    at: '2027-01-10T17:00:00.000Z',
    anchor: null,
    provisional: false,
    assigneeId: 'sp-1',
    prerequisiteIds: [],
    origin: 'template',
    newId: (type) => `${type}.x`,
    newShortCode,
  }
  return materializeTask(input)
}

describe('materializeTask stays pure and takes its codes in (spec §2.2)', () => {
  it('puts the code on the VARIANT of a publishing Task, not on the Task', () => {
    const records = build('publishing', sequentialShortCodes())
    expect(records.variants[0].shortCode).toBe('aaaaaa')
    expect(records.tasks[0].shortCode).toBeUndefined()
  })

  it('puts the code on an OUTREACH Task itself', () => {
    for (const kind of ['speakerOutreach', 'sponsorOutreach'] as const) {
      expect(build(kind, sequentialShortCodes()).tasks[0].shortCode).toBe(
        'aaaaaa',
      )
    }
  })

  it('mints NOTHING for a Kind with no link to shorten', () => {
    for (const kind of [
      'checklist',
      'studioRender',
      'eventPageUpdate',
    ] as const) {
      const next = vi.fn(sequentialShortCodes())
      expect(build(kind, next).tasks[0].shortCode).toBeUndefined()
      expect(next).not.toHaveBeenCalled()
    }
  })

  it('draws at most ONE code per Task', () => {
    const next = vi.fn(sequentialShortCodes())
    build('publishing', next)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('the code reaches Sanity (spec §2.1)', () => {
  it('variantDocument writes it', () => {
    const records = build('publishing', sequentialShortCodes())
    const document = variantDocument(
      records.variants[0],
      { _type: 'reference', _ref: 'conf-1' },
      '2027-01-01T00:00:00.000Z',
    )
    expect(document.shortCode).toBe('aaaaaa')
  })

  it('taskDocument writes an outreach code, and omits the field otherwise', () => {
    const outreach = build('speakerOutreach', sequentialShortCodes())
    const conference = { _type: 'reference' as const, _ref: 'conf-1' }
    expect(taskDocument(outreach.tasks[0], conference)).toMatchObject({
      shortCode: 'aaaaaa',
    })
    const checklist = build('checklist', sequentialShortCodes())
    expect(taskDocument(checklist.tasks[0], conference)).not.toHaveProperty(
      'shortCode',
    )
  })
})

describe('a whole plan mints distinct codes', () => {
  function seed(newShortCode: () => string) {
    let n = 0
    return expandTemplate({
      template: BUILTIN_TEMPLATE,
      conference: CONFERENCE,
      includeOptional: [],
      ownerId: 'sp-1',
      now: '2026-10-01T09:00:00.000Z',
      newId: (type) => `${type}.${++n}`,
      newShortCode,
    })
  }

  it('gives every seeded variant its own code', () => {
    const plan = seed(sequentialShortCodes())
    const codes = plan.variants.map((v) => v.shortCode)
    expect(codes.length).toBeGreaterThan(3)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) expect(code).toMatch(/^[a-hjkmnp-z2-9]{6}$/)
  })

})
