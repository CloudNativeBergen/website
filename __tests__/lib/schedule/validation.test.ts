/**
 * @vitest-environment node
 *
 * Tests for the server-side SAVE payload validator
 * (src/lib/schedule/validation.ts). This is the last gate before a schedule is
 * persisted, so it must reject every shape that would corrupt the public
 * program: malformed/out-of-bounds/mis-ordered times, in-track overlaps,
 * ambiguous slots (both or neither talk+placeholder), and dangling/foreign
 * talk references.
 */
import { describe, it, expect } from 'vitest'
import type { ConferenceSchedule, TrackTalk } from '@/lib/conference/types'
import { validateSchedulePayload } from '@/lib/schedule/validation'

const VALID_IDS = new Set(['talk-1', 'talk-2'])

const talkSlot = (start: string, end: string, id = 'talk-1'): TrackTalk =>
  ({
    talk: { _id: id },
    startTime: start,
    endTime: end,
  }) as unknown as TrackTalk

const serviceSlot = (start: string, end: string): TrackTalk => ({
  placeholder: 'Lunch',
  startTime: start,
  endTime: end,
})

const schedule = (...slots: TrackTalk[]): ConferenceSchedule => ({
  _id: 'sched-1',
  date: '2026-06-15',
  tracks: [{ trackTitle: 'Track A', trackDescription: '', talks: slots }],
})

describe('validateSchedulePayload', () => {
  it('accepts a well-formed schedule (talks + service session, no overlap)', () => {
    const result = validateSchedulePayload(
      schedule(
        talkSlot('09:00', '09:30', 'talk-1'),
        serviceSlot('09:30', '10:00'),
        talkSlot('10:00', '10:30', 'talk-2'),
      ),
      VALID_IDS,
    )
    expect(result).toBeNull()
  })

  it('accepts an empty schedule with no tracks', () => {
    expect(
      validateSchedulePayload(
        { _id: 's', date: '2026-06-15', tracks: [] },
        VALID_IDS,
      ),
    ).toBeNull()
  })

  it('resolves talk refs via _ref as well as _id', () => {
    const slot = {
      talk: { _ref: 'talk-2' },
      startTime: '09:00',
      endTime: '09:30',
    } as unknown as TrackTalk
    expect(validateSchedulePayload(schedule(slot), VALID_IDS)).toBeNull()
  })

  describe('time format', () => {
    it('rejects a non HH:MM time', () => {
      expect(
        validateSchedulePayload(schedule(talkSlot('9:00', '09:30')), VALID_IDS),
      ).toMatch(/HH:MM/)
    })

    it('rejects an out-of-range hour', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('24:00', '24:30')),
          VALID_IDS,
        ),
      ).toMatch(/HH:MM/)
    })
  })

  describe('ordering and bounds', () => {
    it('rejects endTime equal to startTime', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('09:00', '09:00')),
          VALID_IDS,
        ),
      ).toMatch(/end after it starts/)
    })

    it('rejects endTime before startTime', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('10:00', '09:00')),
          VALID_IDS,
        ),
      ).toMatch(/end after it starts/)
    })

    it('rejects a slot starting before SCHEDULE_START', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('07:30', '08:30')),
          VALID_IDS,
        ),
      ).toMatch(/starts before 08:00/)
    })

    it('rejects a slot ending after SCHEDULE_END', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('20:30', '21:30')),
          VALID_IDS,
        ),
      ).toMatch(/ends after 21:00/)
    })

    it('accepts a slot exactly at the grid boundaries', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('08:00', '08:30'), talkSlot('20:30', '21:00')),
          VALID_IDS,
        ),
      ).toBeNull()
    })
  })

  describe('overlap within a track', () => {
    it('rejects two overlapping talks', () => {
      expect(
        validateSchedulePayload(
          schedule(
            talkSlot('09:00', '09:45', 'talk-1'),
            talkSlot('09:30', '10:00', 'talk-2'),
          ),
          VALID_IDS,
        ),
      ).toMatch(/overlap/)
    })

    it('rejects a talk overlapping a service session', () => {
      expect(
        validateSchedulePayload(
          schedule(serviceSlot('12:00', '13:00'), talkSlot('12:30', '13:00')),
          VALID_IDS,
        ),
      ).toMatch(/overlap/)
    })

    it('allows back-to-back slots that merely touch at a boundary', () => {
      expect(
        validateSchedulePayload(
          schedule(
            talkSlot('09:00', '09:30'),
            talkSlot('09:30', '10:00', 'talk-2'),
          ),
          VALID_IDS,
        ),
      ).toBeNull()
    })
  })

  describe('exactly one of talk / placeholder', () => {
    it('rejects a slot with both a talk and a placeholder', () => {
      const slot = {
        talk: { _id: 'talk-1' },
        placeholder: 'Lunch',
        startTime: '09:00',
        endTime: '09:30',
      } as unknown as TrackTalk
      expect(validateSchedulePayload(schedule(slot), VALID_IDS)).toMatch(
        /both a talk and a placeholder/,
      )
    })

    it('rejects a slot with neither a talk nor a placeholder', () => {
      const slot = {
        startTime: '09:00',
        endTime: '09:30',
      } as unknown as TrackTalk
      expect(validateSchedulePayload(schedule(slot), VALID_IDS)).toMatch(
        /neither a talk nor a placeholder/,
      )
    })
  })

  describe('talk reference validity', () => {
    it('rejects a talk id not belonging to this conference', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('09:00', '09:30', 'foreign-talk')),
          VALID_IDS,
        ),
      ).toMatch(/does not belong to this conference/)
    })

    it('rejects a dangling ref when the valid set is empty', () => {
      expect(
        validateSchedulePayload(
          schedule(talkSlot('09:00', '09:30', 'talk-1')),
          new Set<string>(),
        ),
      ).toMatch(/does not belong to this conference/)
    })
  })
})
