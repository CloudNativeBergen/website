/**
 * @vitest-environment node
 *
 * A talk that is not confirmed (canceled, withdrawn, or not yet accepted by
 * the speaker) keeps its slot on the public programme, but the programme read
 * never carries its title, description or speakers.
 * Executed against stored documents through groq-js.
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

import { CONFERENCE_QUERY_FULL } from '@/lib/conference/query'
import { clientReadCached } from '@/lib/sanity/client'

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const talk = (id: string, status: string) => ({
  _id: id,
  _type: 'talk',
  _rev: 'r0',
  title: `Title of ${id}`,
  conference: ref('conf-a'),
  status,
  speakers: [ref('speaker-1')],
})
const slot = (id: string, startTime: string) => ({
  _key: id,
  talk: ref(id),
  startTime,
  endTime: '23:00',
})

beforeEach(() => {
  h.store!.reset([
    { _id: 'speaker-1', _type: 'speaker', _rev: 'r0', name: 'Wanda Withdrawn' },
    talk('live', 'confirmed'),
    talk('canceled', 'canceled'),
    talk('withdrawn', 'withdrawn'),
    talk('accepted', 'accepted'),
    talk('submitted', 'submitted'),
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
            slot('live', '09:00'),
            slot('canceled', '10:00'),
            slot('withdrawn', '11:00'),
            slot('accepted', '12:00'),
            slot('submitted', '13:00'),
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

describe('the programme read of a talk that is not confirmed', () => {
  it('keeps id, status and timing but drops title and speakers', async () => {
    const conference = await clientReadCached.fetch<{
      __expanded: {
        schedules: {
          tracks: {
            talks: {
              startTime: string
              talk: Record<string, unknown>
            }[]
          }[]
        }[]
      }
    }>(CONFERENCE_QUERY_FULL, {
      domain: 'conf-a.example',
      wildcardSubdomain: 'conf-a.example',
    })

    const [live, canceled, withdrawn, accepted, submitted] =
      conference.__expanded.schedules[0].tracks[0].talks

    expect(live.talk.title).toBe('Title of live')
    for (const [s, status] of [
      [canceled, 'canceled'],
      [withdrawn, 'withdrawn'],
      [accepted, 'accepted'],
      [submitted, 'submitted'],
    ] as const) {
      expect(s.startTime).toBeDefined()
      expect(s.talk._id).toBe(status)
      expect(s.talk.status).toBe(status)
      expect(s.talk).not.toHaveProperty('title')
      expect(s.talk).not.toHaveProperty('speakers')
    }
    expect(
      JSON.stringify([canceled, withdrawn, accepted, submitted]),
    ).not.toContain('Wanda')
  })
})
