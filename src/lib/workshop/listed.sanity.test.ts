/**
 * @vitest-environment node
 *
 * What an attendee can sign up for (#1301): exactly what the portal lists, a
 * confirmed workshop of the request's conference. Asserted against stored
 * documents (`__tests__/helpers/versionedSanityStore.ts`: the real client's
 * reads served from an in-memory dataset).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VersionedSanityStore } from '../../../__tests__/helpers/versionedSanityStore'

const h = vi.hoisted(() => ({ store: null as null | VersionedSanityStore }))
vi.mock('@/lib/sanity/client', async () => {
  const { createVersionedSanityStore } =
    await import('../../../__tests__/helpers/versionedSanityStore')
  h.store ??= createVersionedSanityStore()
  return h.store.clients
})

import { isListedWorkshopOf } from './sanity'
import { getWorkshops } from '@/lib/proposal/data/sanity'

const CONF = 'conf-a'

function talk(_id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id,
    _type: 'talk',
    _rev: 'r0',
    conference: { _type: 'reference', _ref: CONF },
    status: 'confirmed',
    format: 'workshop_120',
    ...overrides,
  }
}

beforeEach(() => {
  h.store!.reset([
    talk('listed-120'),
    talk('listed-240', { format: 'workshop_240' }),
    talk('a-talk', { format: 'presentation_40' }),
    talk('a-lightning-talk', { format: 'lightning_10' }),
    talk('submitted', { status: 'submitted' }),
    talk('accepted', { status: 'accepted' }),
    talk('withdrawn', { status: 'withdrawn' }),
    talk('no-format', { format: undefined }),
    talk('elsewhere', { conference: { _type: 'reference', _ref: 'conf-b' } }),
    // Every other field of a listed workshop: only its type tells.
    talk('a-sponsor', { _type: 'sponsor' }),
    talk('drafts.unpublished'),
    talk('drafts.listed-120', { status: 'confirmed' }),
  ])
})

describe('a workshop an attendee can sign up for', () => {
  it.each(['listed-120', 'listed-240'])(
    'a confirmed workshop of the conference (%s) is one',
    async (id) => {
      expect(await isListedWorkshopOf(id, CONF)).toBe(true)
    },
  )

  it.each([
    ['a talk of another format', 'a-talk'],
    ['a lightning talk', 'a-lightning-talk'],
    ['a talk with no format', 'no-format'],
    ['a submitted workshop proposal', 'submitted'],
    ['an accepted workshop the speaker has not confirmed', 'accepted'],
    ['a withdrawn workshop', 'withdrawn'],
    ['a workshop of another conference', 'elsewhere'],
    ['a document that is not a talk', 'a-sponsor'],
    ['an id that does not exist', 'nothing-here'],
    ['a draft that was never published', 'drafts.unpublished'],
    ['the draft of a listed workshop', 'drafts.listed-120'],
  ])('%s is not', async (_, id) => {
    expect(await isListedWorkshopOf(id, CONF)).toBe(false)
  })
})

describe('the portal listing', () => {
  it('lists exactly the workshops an attendee can sign up for', async () => {
    const { workshops, workshopsError } = await getWorkshops({
      conferenceId: CONF,
    })

    expect(workshopsError).toBeNull()
    expect(workshops.map((w) => w._id).sort()).toEqual([
      'listed-120',
      'listed-240',
    ])
  })
})
