/**
 * @vitest-environment node
 *
 * A talk's Feedback Code is for its speakers (speaker feedback spec §9.2),
 * never for an anonymous visitor. `getProposals` spreads the whole talk
 * (`...`) and feeds the PUBLIC `workshop.list`, so it must not carry the
 * code. Executed against stored documents (`versionedSanityStore`: the real
 * client's reads through groq-js).
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

import { getProposals, getWorkshops } from '@/lib/proposal/data/sanity'

const ref = (id: string) => ({ _type: 'reference', _ref: id })

beforeEach(() => {
  h.store!.reset([
    {
      _id: 'workshop-1',
      _type: 'talk',
      _rev: 'r0',
      title: 'Hands-on',
      conference: ref('conf-a'),
      status: 'confirmed',
      format: 'workshop_120',
      feedbackCode: 'k7m2qx',
    },
  ])
})

describe('the Feedback Code stays out of whole-talk list reads', () => {
  it('the public workshop list carries the workshop but not its code', async () => {
    const { workshops } = await getWorkshops({ conferenceId: 'conf-a' })
    expect(workshops.map((w) => w.title)).toEqual(['Hands-on'])
    expect(workshops[0]).not.toHaveProperty('feedbackCode', 'k7m2qx')
    expect(JSON.stringify(workshops)).not.toContain('k7m2qx')
  })

  it('no getProposals list carries it either', async () => {
    const { proposals } = await getProposals({
      conferenceId: 'conf-a',
      returnAll: true,
    })
    expect(proposals).toHaveLength(1)
    expect(JSON.stringify(proposals)).not.toContain('k7m2qx')
  })
})
