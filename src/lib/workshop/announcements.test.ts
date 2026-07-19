import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- Email sender mock -----------------------------------------------------
const sendEmailMock = vi.fn()
vi.mock('@/lib/email/workshop', () => ({
  sendWorkshopAnnouncementEmail: (...args: unknown[]) => sendEmailMock(...args),
}))

// --- Sanity client mock ----------------------------------------------------
const fetchMock = vi.fn()
const createMock = vi.fn()
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: {
    fetch: (...args: unknown[]) => fetchMock(...args),
    create: (...args: unknown[]) => createMock(...args),
  },
}))

import {
  sendAnnouncementToConfirmedParticipants,
  getConfirmedAnnouncementRecipients,
  getWorkshopForAnnouncement,
  createWorkshopAnnouncement,
  isWorkshopFormat,
  type AnnouncementRecipient,
} from './announcements'

beforeEach(() => {
  vi.clearAllMocks()
})

function makeRecipients(n: number): AnnouncementRecipient[] {
  return Array.from({ length: n }, (_, i) => ({
    userEmail: `person${i}@example.com`,
    userName: `Person ${i}`,
  }))
}

describe('isWorkshopFormat', () => {
  it('accepts workshop formats and rejects others', () => {
    expect(isWorkshopFormat('workshop_120')).toBe(true)
    expect(isWorkshopFormat('workshop_240')).toBe(true)
    expect(isWorkshopFormat('presentation_25')).toBe(false)
    expect(isWorkshopFormat(undefined)).toBe(false)
  })
})

describe('getConfirmedAnnouncementRecipients', () => {
  it('queries only confirmed signups', async () => {
    fetchMock.mockResolvedValueOnce([
      { userEmail: 'a@example.com', userName: 'A' },
    ])

    const recipients = await getConfirmedAnnouncementRecipients('ws-1')

    expect(recipients).toHaveLength(1)
    const query = fetchMock.mock.calls[0][0] as string
    expect(query).toContain('status == "confirmed"')
    expect(query).toContain('workshop._ref == $workshopId')
  })

  it('returns [] when the query yields null', async () => {
    fetchMock.mockResolvedValueOnce(null)
    expect(await getConfirmedAnnouncementRecipients('ws-1')).toEqual([])
  })
})

describe('createWorkshopAnnouncement', () => {
  it('writes a doc with a WEAK author ref and returns the view', async () => {
    createMock.mockResolvedValueOnce({ _id: 'ann-1' })

    const result = await createWorkshopAnnouncement({
      workshopId: 'ws-1',
      conferenceId: 'conf-1',
      authorId: 'sp-1',
      body: 'Hello everyone',
    })

    const doc = createMock.mock.calls[0][0]
    expect(doc._type).toBe('workshopAnnouncement')
    expect(doc.author).toEqual({
      _type: 'reference',
      _ref: 'sp-1',
      _weak: true,
    })
    expect(doc.body).toBe('Hello everyone')
    expect(result._id).toBe('ann-1')
    expect(result.createdAt).toBeTruthy()
  })
})

describe('getWorkshopForAnnouncement', () => {
  it('normalizes missing speakers/conference to safe defaults', async () => {
    fetchMock.mockResolvedValueOnce({
      _id: 'ws-1',
      title: 'K8s Ops',
      format: 'workshop_120',
      conferenceId: null,
      speakerIds: null,
    })

    const workshop = await getWorkshopForAnnouncement('ws-1')
    expect(workshop).toMatchObject({
      _id: 'ws-1',
      conferenceId: null,
      speakerIds: [],
    })
  })

  it('returns null when the talk does not exist', async () => {
    fetchMock.mockResolvedValueOnce(null)
    expect(await getWorkshopForAnnouncement('nope')).toBeNull()
  })
})

describe('sendAnnouncementToConfirmedParticipants', () => {
  it('sends exactly one email per recipient and counts successes', async () => {
    sendEmailMock.mockResolvedValue({ data: { emailId: 'e' } })
    const recipients = makeRecipients(5)

    const result = await sendAnnouncementToConfirmedParticipants({
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'hi',
      recipients,
    })

    expect(sendEmailMock).toHaveBeenCalledTimes(5)
    expect(result).toEqual({ sent: 5, failed: 0 })
  })

  it('never fails the batch: tolerates per-recipient errors AND throws', async () => {
    const recipients = makeRecipients(4)
    sendEmailMock
      .mockResolvedValueOnce({ data: { emailId: 'e' } }) // ok
      .mockResolvedValueOnce({ error: { error: 'bad address', status: 400 } }) // soft-fail
      .mockRejectedValueOnce(new Error('network')) // hard-throw
      .mockResolvedValueOnce({ data: { emailId: 'e' } }) // ok

    const result = await sendAnnouncementToConfirmedParticipants({
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'hi',
      recipients,
    })

    // Every recipient is accounted for; nothing propagates out.
    expect(result.sent + result.failed).toBe(4)
    expect(result).toEqual({ sent: 2, failed: 2 })
  })

  it('bounds concurrency to 3 simultaneous sends', async () => {
    let inFlight = 0
    let maxInFlight = 0
    sendEmailMock.mockImplementation(async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return { data: { emailId: 'e' } }
    })

    await sendAnnouncementToConfirmedParticipants({
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'hi',
      recipients: makeRecipients(9),
    })

    expect(maxInFlight).toBeLessThanOrEqual(3)
    expect(sendEmailMock).toHaveBeenCalledTimes(9)
  })

  it('handles an empty recipient list without sending', async () => {
    const result = await sendAnnouncementToConfirmedParticipants({
      workshopTitle: 'W',
      authorName: 'Owner',
      body: 'hi',
      recipients: [],
    })
    expect(sendEmailMock).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: 0, failed: 0 })
  })
})
