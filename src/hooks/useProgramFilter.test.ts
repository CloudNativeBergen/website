/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { useProgramFilter } from './useProgramFilter'

const schedules = [
  {
    _id: 'day1',
    date: '2026-06-01',
    tracks: [
      {
        trackTitle: 'Main',
        talks: [
          {
            startTime: '09:00',
            endTime: '09:40',
            talk: {
              _id: 'confirmed',
              title: 'Kubernetes talk',
              status: 'confirmed',
              format: 'presentation_40',
              topics: [{ _id: 't1', title: 'K8s', slug: { current: 'k8s' } }],
            },
          },
          {
            startTime: '10:00',
            endTime: '10:40',
            // TBA: an unconfirmed talk ships no topics, level or audiences.
            talk: { status: 'accepted', format: 'presentation_40' },
          },
        ],
      },
    ],
  },
] as unknown as ConferenceSchedule[]

describe('useProgramFilter', () => {
  it('a topic filter keeps only talks with that topic, not TBA slots', () => {
    const { result } = renderHook(() => useProgramFilter(schedules))
    expect(result.current.filteredData.allTalks).toHaveLength(2)
    act(() => result.current.updateFilter('selectedTopic', 'k8s'))
    expect(
      result.current.filteredData.allTalks.map((t) => t.talk?._id ?? 'TBA'),
    ).toEqual(['confirmed'])
  })
})
