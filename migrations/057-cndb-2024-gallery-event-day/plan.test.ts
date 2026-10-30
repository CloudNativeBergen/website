import { describe, expect, it } from 'vitest'
import { planDoc } from './plan'

const doc = (date: string, extra = {}) => ({
  _id: 'img-1',
  _rev: 'r1',
  date,
  ...extra,
})

describe('057 planDoc', () => {
  it('keeps the Oslo clock time and moves the date to 30 Oct 2024', () => {
    // 2024-11-06T23:25:05Z is 00:25:05 on 7 Nov in Oslo
    expect(planDoc(doc('2024-11-06T23:25:05.000Z'))).toEqual({
      action: 'move',
      oldValue: '2024-11-06T23:25:05.000Z',
      newValue: '2024-10-29T23:25:05.000Z',
    })
  })

  it('keeps a late-evening photo late in the evening of the event day', () => {
    // 2024-11-06T22:40:00Z is 23:40 on 6 Nov in Oslo
    expect(planDoc(doc('2024-11-06T22:40:00.000Z'))).toMatchObject({
      action: 'move',
      newValue: '2024-10-30T22:40:00.000Z',
    })
  })

  it('skips photos already on the event day, already moved, drafts and missing dates', () => {
    expect(planDoc(doc('2024-10-30T10:00:00.000Z')).action).toBe('skip')
    expect(
      planDoc(doc('2024-11-06T23:25:05.000Z', { dateBeforeEventDayFix: 'x' }))
        .action,
    ).toBe('skip')
    expect(
      planDoc({ _id: 'drafts.a', _rev: 'r', date: '2024-11-06T23:00:00.000Z' })
        .action,
    ).toBe('skip')
    expect(planDoc({ _id: 'a', _rev: 'r' }).action).toBe('skip')
  })
})
