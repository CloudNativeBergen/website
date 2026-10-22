/**
 * @vitest-environment node
 *
 * A talk's Feedback Code is for its speakers (speaker feedback spec §9.2),
 * never for an anonymous visitor. `getProposals` spreads the whole talk
 * (`...`) and feeds the PUBLIC `workshop.list`, so it must not carry the
 * code. The programme read (#1472) says only WHETHER a talk holds one: its
 * "Give feedback" link goes through `/program/<talkId>/feedback`, which looks
 * the code up when it is followed. Executed against stored documents (`versionedSanityStore`: the real
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
import { CONFERENCE_QUERY_FULL } from '@/lib/conference/query'
import { clientReadCached } from '@/lib/sanity/client'

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
    {
      _id: 'talk-2',
      _type: 'talk',
      _rev: 'r0',
      title: 'No code yet',
      conference: ref('conf-a'),
      status: 'confirmed',
      format: 'presentation_25',
    },
    {
      _id: 'day-1',
      _type: 'schedule',
      _rev: 'r0',
      conference: ref('conf-a'),
      date: '2026-10-26',
      status: 'official',
      tracks: [
        {
          _key: 't1',
          trackTitle: 'Main',
          talks: [
            {
              _key: 's1',
              talk: ref('workshop-1'),
              startTime: '09:00',
              endTime: '11:00',
            },
            {
              _key: 's2',
              talk: ref('talk-2'),
              startTime: '11:00',
              endTime: '11:25',
            },
            {
              _key: 's3',
              placeholder: 'Lunch',
              startTime: '12:00',
              endTime: '13:00',
            },
          ],
        },
      ],
    },
    {
      _id: 'conf-a',
      _type: 'conference',
      _rev: 'r0',
      title: 'Conf A',
      domains: ['conf-a.example'],
      schedules: [ref('day-1')],
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
    expect(proposals).toHaveLength(2)
    expect(JSON.stringify(proposals)).not.toContain('k7m2qx')
  })
})

describe('the programme read says whether a talk holds a code, never which (#1472)', () => {
  it('carries hasFeedbackCode on each scheduled talk and no code anywhere', async () => {
    const conference = await clientReadCached.fetch<{
      __expanded: {
        schedules: {
          tracks: {
            talks: { talk?: { _id: string; hasFeedbackCode?: boolean } }[]
          }[]
        }[]
      }
    }>(CONFERENCE_QUERY_FULL, {
      domain: 'conf-a.example',
      wildcardSubdomain: 'conf-a.example',
    })

    const talks = conference.__expanded.schedules[0].tracks[0].talks
    expect(
      talks.map((slot) => [slot.talk?._id, slot.talk?.hasFeedbackCode]),
    ).toEqual([
      ['workshop-1', true],
      ['talk-2', false],
      [undefined, undefined],
    ])
    expect(JSON.stringify(conference)).not.toContain('k7m2qx')
  })
})
