/**
 * @vitest-environment node
 *
 * Tests for the load-boundary converters (src/lib/schedule/types.ts): `toSlot`,
 * `toEditorTrack`, and `toEditorSchedule`. These construct the discriminated
 * `Slot` union ONCE at the server boundary and perform the SINGLE editor-side
 * ghost-strip, so the editor never carries an unremovable/unsavable slot.
 */
import { describe, it, expect } from 'vitest'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { toSlot, toEditorSchedule } from '@/lib/schedule/types'

const proposal = (id: string): ProposalExisting =>
  ({ _id: id, format: 'talk_25' }) as unknown as ProposalExisting

describe('toSlot', () => {
  it('tags a resolved talk reference as a TalkSlot', () => {
    const slot = toSlot({
      talk: proposal('t1'),
      startTime: '09:00',
      endTime: '09:25',
    })
    expect(slot).toEqual({
      kind: 'talk',
      talk: proposal('t1'),
      startTime: '09:00',
      endTime: '09:25',
    })
  })

  it('tags a placeholder as a ServiceSlot', () => {
    const slot = toSlot({
      placeholder: 'Lunch',
      startTime: '12:00',
      endTime: '13:00',
    })
    expect(slot).toEqual({
      kind: 'service',
      placeholder: 'Lunch',
      startTime: '12:00',
      endTime: '13:00',
    })
  })

  it('returns null for a ghost (dangling talk ref, no placeholder)', () => {
    // The proposal was deleted after being scheduled: `talk` no longer resolves
    // and there is no placeholder.
    const ghost = {
      talk: null,
      startTime: '10:00',
      endTime: '10:25',
    } as unknown as TrackTalk
    expect(toSlot(ghost)).toBeNull()
  })

  it('prefers the resolved talk when both are present', () => {
    const slot = toSlot({
      talk: proposal('t2'),
      placeholder: 'ignored',
      startTime: '09:00',
      endTime: '09:25',
    })
    expect(slot?.kind).toBe('talk')
  })
})

describe('toEditorSchedule', () => {
  it('drops ghost slots while preserving order and fields of the rest', () => {
    const persisted: ConferenceSchedule = {
      _id: 'sched-1',
      _rev: 'rev-1',
      date: '2026-03-10',
      tracks: [
        {
          trackTitle: 'A',
          trackDescription: 'first',
          talks: [
            { talk: proposal('t1'), startTime: '09:00', endTime: '09:25' },
            // ghost between two real slots — must be dropped without shifting
            // the surrounding order.
            {
              talk: null,
              startTime: '10:00',
              endTime: '10:25',
            } as unknown as TrackTalk,
            { placeholder: 'Lunch', startTime: '12:00', endTime: '13:00' },
          ],
        },
        {
          trackTitle: 'B',
          trackDescription: 'second',
          talks: [],
        },
      ],
    }

    const editor = toEditorSchedule(persisted)

    // Top-level day fields are preserved.
    expect(editor._id).toBe('sched-1')
    expect(editor._rev).toBe('rev-1')
    expect(editor.date).toBe('2026-03-10')

    // Track fields and order preserved.
    expect(editor.tracks.map((t) => t.trackTitle)).toEqual(['A', 'B'])
    expect(editor.tracks[0].trackDescription).toBe('first')

    // Ghost dropped; the two real slots keep their order and are tagged.
    const talks = editor.tracks[0].talks
    expect(talks).toHaveLength(2)
    expect(talks.map((s) => s.kind)).toEqual(['talk', 'service'])
    expect(talks[0].talk?._id).toBe('t1')
    expect(talks[1].placeholder).toBe('Lunch')

    // Empty track converts trivially.
    expect(editor.tracks[1].talks).toEqual([])
  })
})
