import { describe, expect, it } from 'vitest'
import { planDoc, type GalleryDoc } from './plan'

const CUTOFF = '2026-11-01T00:00:00.000Z'
const none = new Set<string>()
const doc = (date: string, extra: Partial<GalleryDoc> = {}): GalleryDoc => ({
  _id: 'img1',
  _rev: 'r1',
  _updatedAt: '2026-06-01T00:00:00Z',
  date,
  conference: { _ref: 'conf' },
  ...extra,
})

describe('planDoc', () => {
  it('shifts a summer EXIF time by 2 h', () => {
    expect(planDoc(doc('2025-06-12T14:30:00.000Z'), CUTOFF, none)).toEqual({
      action: 'shift',
      oldValue: '2025-06-12T14:30:00.000Z',
      newValue: '2025-06-12T12:30:00.000Z',
      offset: '-2h',
    })
  })

  it('shifts a winter manual time by 1 h, keeping seconds', () => {
    expect(
      planDoc(doc('2025-01-10T09:15:42.000Z'), CUTOFF, none),
    ).toMatchObject({ newValue: '2025-01-10T08:15:42.000Z', offset: '-1h' })
  })

  it('handles the spring-forward boundary (2025-03-30 02:00 Oslo)', () => {
    expect(
      planDoc(doc('2025-03-30T01:59:00.000Z'), CUTOFF, none),
    ).toMatchObject({ newValue: '2025-03-30T00:59:00.000Z', offset: '-1h' })
    expect(
      planDoc(doc('2025-03-30T03:00:00.000Z'), CUTOFF, none),
    ).toMatchObject({ newValue: '2025-03-30T01:00:00.000Z', offset: '-2h' })
  })

  it('handles the fall-back boundary (2025-10-26 03:00 Oslo)', () => {
    expect(
      planDoc(doc('2025-10-26T01:30:00.000Z'), CUTOFF, none),
    ).toMatchObject({ newValue: '2025-10-25T23:30:00.000Z', offset: '-2h' })
    expect(
      planDoc(doc('2025-10-26T03:30:00.000Z'), CUTOFF, none),
    ).toMatchObject({ newValue: '2025-10-26T02:30:00.000Z', offset: '-1h' })
  })

  it('skips file-timestamp values (ms precision)', () => {
    expect(planDoc(doc('2025-06-12T14:30:00.123Z'), CUTOFF, none)).toEqual({
      action: 'skip',
      reason: 'file timestamp (ms precision)',
    })
  })

  it('skips already migrated docs, so a re-run changes nothing', () => {
    const migrated = doc('2025-06-12T12:30:00.000Z', {
      dateBeforeTzFix: '2025-06-12T14:30:00.000Z',
    })
    expect(planDoc(migrated, CUTOFF, none).action).toBe('skip')
  })

  it('skips excluded ids and drafts', () => {
    const d = doc('2025-06-12T14:30:00.000Z')
    expect(planDoc(d, CUTOFF, new Set(['img1'])).action).toBe('skip')
    expect(planDoc({ ...d, _id: 'drafts.img1' }, CUTOFF, none).action).toBe(
      'skip',
    )
  })

  it('flags docs edited after the cutoff for review', () => {
    const d = doc('2025-06-12T14:30:00.000Z', {
      _updatedAt: '2026-11-02T00:00:00Z',
    })
    expect(planDoc(d, CUTOFF, none).action).toBe('review')
  })
})
