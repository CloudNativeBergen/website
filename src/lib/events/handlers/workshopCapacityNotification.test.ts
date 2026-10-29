/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TITLE_MAX } from '@/lib/notification/sanity'
import { workshopCapacityNotifications } from './workshopCapacityNotification'

const event = {
  conferenceId: 'conf-a',
  workshopId: 'talk-1',
  workshopTitle: 'Intro to K8s',
  threshold: 'eighty-percent' as const,
  seatsTaken: 24,
  capacity: 30,
}

describe('workshopCapacityNotifications', () => {
  it('writes one notification per organizer, with counts and a link', () => {
    const [anna, arne] = workshopCapacityNotifications({
      event,
      organizerIds: ['sp-anna', 'sp-arne', 'sp-anna'],
    })
    expect(arne.recipientId).toBe('sp-arne')
    expect(anna).toMatchObject({
      recipientId: 'sp-anna',
      conferenceId: 'conf-a',
      notificationType: 'workshop_capacity',
      title: '“Intro to K8s” is 80% full',
      message: '24 of 30 seats taken.',
      link: '/admin/workshops',
    })
    expect(
      workshopCapacityNotifications({
        event: { ...event, threshold: 'waitlist' },
        organizerIds: ['sp-anna'],
      })[0].title,
    ).toBe('“Intro to K8s” has a waitlist')
  })

  it('gives the same id for the same workshop, threshold and organizer, whatever the counts', () => {
    const id = (e: typeof event | Record<string, unknown>) =>
      workshopCapacityNotifications({
        event: { ...event, ...e },
        organizerIds: ['sp-anna'],
      })[0].id
    expect(id({ seatsTaken: 27 })).toBe(id(event))
    expect(id(event)).toMatch(
      /^notification\.workshop-capacity\.[0-9a-f]{32}\.sp-anna$/,
    )
    expect(id({ threshold: 'waitlist' })).not.toBe(id(event))
    expect(id({ workshopId: 'talk-2' })).not.toBe(id(event))
    expect(id({ conferenceId: 'conf-b' })).not.toBe(id(event))
  })

  it('keeps a hostile or long title on one line, in its quotes and the limit', () => {
    const [n] = workshopCapacityNotifications({
      event: { ...event, workshopTitle: `A ”\n‮${'x'.repeat(400)}` },
      organizerIds: ['sp-anna'],
    })
    expect(n.title.length).toBeLessThanOrEqual(NOTIFICATION_TITLE_MAX)
    expect(n.title).not.toMatch(/[\n‮]|A ”/)
    expect(n.title.endsWith('…” is 80% full')).toBe(true)
  })
})
