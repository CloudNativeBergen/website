import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))

const getVolunteersMock = vi.fn()
const recordMock = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: (...a: unknown[]) => getVolunteersMock(...a),
  recordVolunteerTicketReminderSent: (...a: unknown[]) => recordMock(...a),
}))

const sendMock = vi.fn()
vi.mock('@/lib/email/volunteer', () => ({
  sendVolunteerApprovalEmail: (...a: unknown[]) => sendMock(...a),
}))

const redeemedMock = vi.fn()
vi.mock('@/lib/tickets/volunteerStatus', async (orig) => ({
  ...(await orig<typeof import('@/lib/tickets/volunteerStatus')>()),
  fetchRedeemedVolunteerEmails: (...a: unknown[]) => redeemedMock(...a),
}))

import { volunteerRouter } from './volunteer'

const ORG_ID = 'org-A'
const LINK = 'https://tickets.example/volunteer'
const conference = {
  _id: 'conf-1',
  title: 'CND',
  contactEmail: 'hi@cnd.no',
  organization: { _ref: ORG_ID },
  volunteerRegistrationLink: LINK,
}
const ALL = ['approved', 'confirmed', 'redeemed', 'pending', 'recent']
const vol = (
  id: string,
  email: string,
  status: string,
  extra: Record<string, unknown> = {},
) => ({ _id: id, name: id, email, status, conference, ...extra })

function caller() {
  const speaker = { _id: 'sp-1', name: 'S', organizerOrgIds: [ORG_ID] }
  return volunteerRouter.createCaller({
    session: { speaker, user: { name: 'S' } },
    speaker,
  } as unknown as Context)
}

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({ conference, error: null })
  getVolunteersMock.mockResolvedValue({
    volunteers: [
      vol('approved', 'a@x.no', 'approved'),
      vol('confirmed', 'c@x.no', 'confirmed'),
      vol('redeemed', 'r@x.no', 'confirmed'),
      vol('pending', 'p@x.no', 'pending'),
      vol('recent', 'n@x.no', 'approved', {
        ticketReminderSentAt: new Date().toISOString(),
      }),
    ],
    error: null,
  })
  redeemedMock.mockResolvedValue(
    new Map([['r@x.no', { email: 'r@x.no', orderId: 1, ticketId: 1 }]]),
  )
  sendMock.mockResolvedValue({ data: { emailId: 'e' } })
  recordMock.mockResolvedValue({ success: true, error: null })
})

describe('volunteer.admin.sendTicketReminder', () => {
  it('mails only unredeemed approved/confirmed volunteers and records sentAt', async () => {
    const res = await caller().admin.sendTicketReminder({ volunteerIds: ALL })
    expect(sendMock.mock.calls.map((c) => c[0]._id)).toEqual([
      'approved',
      'confirmed',
    ])
    expect(sendMock.mock.calls[0][2]).toBe(
      'Reminder: register your volunteer ticket for CND',
    )
    expect(sendMock.mock.calls[0][4]).toEqual({
      template: 'message',
      title: 'Reminder: register your volunteer ticket for CND',
      registrationUrl: LINK,
      slackInviteUrl: null,
      confirmUrl: null,
    })
    expect(recordMock).toHaveBeenCalledWith('approved', res.sentAt)
    expect(recordMock).toHaveBeenCalledWith('confirmed', res.sentAt)
    expect(res).toMatchObject({ sent: 2, failed: [], skipped: 3 })
  })

  it('lists failed sends and records only the sent ones', async () => {
    sendMock
      .mockResolvedValueOnce({ error: { error: 'bounced', status: 500 } })
      .mockResolvedValueOnce({ data: { emailId: 'e' } })
    const res = await caller().admin.sendTicketReminder({ volunteerIds: ALL })
    expect(res.failed).toEqual([
      { id: 'approved', email: 'a@x.no', error: 'bounced' },
    ])
    expect(recordMock).toHaveBeenCalledTimes(1)
    expect(recordMock).toHaveBeenCalledWith('confirmed', res.sentAt)
  })

  it('rejects ids outside the current conference and sends nothing', async () => {
    await expect(
      caller().admin.sendTicketReminder({ volunteerIds: ['approved', 'x'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('ignores a client-picked id that is not eligible', async () => {
    const res = await caller().admin.sendTicketReminder({
      volunteerIds: ['redeemed', 'pending'],
    })
    expect(res.sent).toBe(0)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('refuses when ticket status is unavailable', async () => {
    redeemedMock.mockResolvedValue(null)
    await expect(
      caller().admin.sendTicketReminder({ volunteerIds: ALL }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    })
    expect(sendMock).not.toHaveBeenCalled()
  })
})
