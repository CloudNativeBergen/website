import { describe, it, expect } from 'vitest'
import { REMINDER_REGISTRY } from '../registry'
import type { ReminderConference, ReminderSpeaker } from '../types'

const reminder = (key: string) => {
  const found = REMINDER_REGISTRY.find((r) => r.key === key)
  if (!found) throw new Error(`no reminder ${key}`)
  return found
}

const CONF: ReminderConference = {
  _id: 'conf-1',
  title: 'CloudNative Days',
  startDate: '2026-09-10',
  endDate: '2026-09-11',
  travelSupportPaymentDate: '2026-09-11',
}

const speaker = (over: Partial<ReminderSpeaker>): ReminderSpeaker => ({
  speakerId: 's1',
  talks: [],
  travelSupportStatus: null,
  ...over,
})

const accepted = {
  _id: 't1',
  title: 'My Talk',
  status: 'accepted',
  hasSlides: false,
}
const confirmedNoSlides = {
  _id: 't1',
  title: 'My Talk',
  status: 'confirmed',
  hasSlides: false,
}
const confirmedWithSlides = {
  _id: 't1',
  title: 'My Talk',
  status: 'confirmed',
  hasSlides: true,
}

describe('confirm-talk', () => {
  const r = reminder('confirm-talk')
  it('is due for an accepted talk before the conference ends', () => {
    const copy = r.evaluate(speaker({ talks: [accepted] }), CONF, '2026-08-01')
    expect(copy).not.toBeNull()
    expect(copy!.link).toBe('/cfp/proposal/t1')
  })
  it('is not due once the conference has ended', () => {
    expect(
      r.evaluate(speaker({ talks: [accepted] }), CONF, '2026-09-12'),
    ).toBeNull()
  })
  it('is not due for a confirmed talk', () => {
    expect(
      r.evaluate(speaker({ talks: [confirmedWithSlides] }), CONF, '2026-08-01'),
    ).toBeNull()
  })
})

describe('upload-slides', () => {
  const r = reminder('upload-slides')
  it('is due inside the T-7d window for a confirmed talk without slides', () => {
    const copy = r.evaluate(
      speaker({ talks: [confirmedNoSlides] }),
      CONF,
      '2026-09-05',
    )
    expect(copy).not.toBeNull()
    expect(copy!.link).toBe('/cfp/proposal/t1')
  })
  it('is not due before the window opens', () => {
    expect(
      r.evaluate(speaker({ talks: [confirmedNoSlides] }), CONF, '2026-08-20'),
    ).toBeNull()
  })
  it('is not due when slides are already uploaded', () => {
    expect(
      r.evaluate(speaker({ talks: [confirmedWithSlides] }), CONF, '2026-09-05'),
    ).toBeNull()
  })
  it('is not due for a merely accepted (unconfirmed) talk', () => {
    expect(
      r.evaluate(speaker({ talks: [accepted] }), CONF, '2026-09-05'),
    ).toBeNull()
  })
})

describe('travel-reminder', () => {
  const r = reminder('travel-reminder')
  it('is due for a draft travel-support request', () => {
    const copy = r.evaluate(
      speaker({ talks: [confirmedWithSlides], travelSupportStatus: 'draft' }),
      CONF,
      '2026-08-01',
    )
    expect(copy).not.toBeNull()
    expect(copy!.link).toBe('/cfp/expense')
  })
  it('is due for an approved request near the payment date', () => {
    // 09-08 is 3 days before the 09-11 payout window.
    const copy = r.evaluate(
      speaker({
        talks: [confirmedWithSlides],
        travelSupportStatus: 'approved',
      }),
      CONF,
      '2026-09-08',
    )
    expect(copy).not.toBeNull()
  })
  it('is not due for an approved request far from the payment date', () => {
    expect(
      r.evaluate(
        speaker({
          talks: [confirmedWithSlides],
          travelSupportStatus: 'approved',
        }),
        CONF,
        '2026-08-01',
      ),
    ).toBeNull()
  })
  it('is not due when there is no travel support at all', () => {
    expect(
      r.evaluate(speaker({ talks: [confirmedWithSlides] }), CONF, '2026-08-01'),
    ).toBeNull()
  })
  it('is not due for a paid request', () => {
    expect(
      r.evaluate(
        speaker({ talks: [confirmedWithSlides], travelSupportStatus: 'paid' }),
        CONF,
        '2026-08-01',
      ),
    ).toBeNull()
  })
})

// N3: non-decision prep reminders must NOT ride the `proposalDecisions` push
// category (mapped from 'proposal_status_changed'). `system` and
// 'travel_support_update' both map to `otherUpdates` in
// `pushCategoryForNotificationType`, so a speaker who mutes proposal decisions
// still receives them. Only confirm-talk (decision-adjacent) stays on
// 'proposal_status_changed'.
describe('reminder push categories (N3)', () => {
  it('keeps confirm-talk on the decision category', () => {
    expect(reminder('confirm-talk').notificationType).toBe(
      'proposal_status_changed',
    )
  })
  it('routes upload-slides off the decision category', () => {
    expect(reminder('upload-slides').notificationType).toBe('system')
  })
  it('routes logistics off the decision category', () => {
    expect(reminder('logistics').notificationType).toBe('system')
  })
  it('keeps travel-reminder on its own (non-decision) category', () => {
    expect(reminder('travel-reminder').notificationType).toBe(
      'travel_support_update',
    )
  })
})

describe('logistics', () => {
  const r = reminder('logistics')
  it('is due within T-2d for a confirmed speaker', () => {
    const copy = r.evaluate(
      speaker({ talks: [confirmedWithSlides] }),
      CONF,
      '2026-09-09',
    )
    expect(copy).not.toBeNull()
    expect(copy!.link).toBe('/program')
  })
  it('is not due 3 days out', () => {
    expect(
      r.evaluate(speaker({ talks: [confirmedWithSlides] }), CONF, '2026-09-07'),
    ).toBeNull()
  })
  it('is not due for an accepted-only speaker', () => {
    expect(
      r.evaluate(speaker({ talks: [accepted] }), CONF, '2026-09-09'),
    ).toBeNull()
  })
})
