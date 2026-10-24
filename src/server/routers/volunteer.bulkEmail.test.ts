import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Context } from '@/server/trpc'

const getConferenceMock = vi.fn()
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: (...a: unknown[]) => getConferenceMock(...a),
}))

const getVolunteersMock = vi.fn()
vi.mock('@/lib/volunteer/sanity', () => ({
  getVolunteersByConference: (...a: unknown[]) => getVolunteersMock(...a),
}))

const sendMock = vi.fn()
vi.mock('@/lib/email/volunteer', () => ({
  sendVolunteerApprovalEmail: (...a: unknown[]) => sendMock(...a),
}))

import { volunteerRouter } from './volunteer'
import { VOLUNTEER_EMAIL_CHUNK } from '@/lib/volunteer/chunkedSend'

const ORG_ID = 'org-A'
const conference = {
  _id: 'conf-1',
  title: 'CND',
  contactEmail: 'hi@cnd.no',
  organization: { _ref: ORG_ID },
}
const vol = (id: string, email: string, name = id) => ({
  _id: id,
  name,
  email,
  conference,
})

function caller() {
  const speaker = { _id: 'sp-1', name: 'S', organizerOrgIds: [ORG_ID] }
  return volunteerRouter.createCaller({
    session: { speaker, user: { name: 'S' } },
    speaker,
  } as unknown as Context)
}

const input = (volunteerIds: string[]) => ({
  volunteerIds,
  subject: 'Hi {{name}}',
  message: 'Hello {{name}}',
})

beforeEach(() => {
  vi.clearAllMocks()
  getConferenceMock.mockResolvedValue({ conference, error: null })
  getVolunteersMock.mockResolvedValue({
    volunteers: [
      vol('v1', 'a@x.no', 'Ada'),
      vol('v2', 'A@x.no '),
      vol('v3', 'c@x.no'),
    ],
    error: null,
  })
  sendMock.mockResolvedValue({ data: { emailId: 'e' } })
})

describe('volunteer.admin.sendBulkEmail', () => {
  it('rejects ids outside the current conference and sends nothing', async () => {
    await expect(
      caller().admin.sendBulkEmail(input(['v1', 'foreign'])),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(getVolunteersMock).toHaveBeenCalledWith('conf-1')
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('dedupes by email, fills {{name}} and uses the conference sender', async () => {
    sendMock
      .mockResolvedValueOnce({ data: { emailId: 'e' } })
      .mockResolvedValueOnce({ error: { error: 'boom' } })
    const res = await caller().admin.sendBulkEmail(input(['v1', 'v2', 'v3']))
    expect(res).toEqual({
      sent: 1,
      failed: [{ id: 'v3', email: 'c@x.no', error: 'boom' }],
      skipped: 1,
    })
    expect(sendMock).toHaveBeenCalledTimes(2)
    const [v, conf, subject, message, opts] = sendMock.mock.calls[0]
    expect(v._id).toBe('v1')
    expect(conf.organization._ref).toBe(ORG_ID)
    expect(subject).toBe('Hi Ada')
    expect(message).toBe('Hello Ada')
    expect(opts).toEqual({
      template: 'message',
      registrationUrl: null,
      slackInviteUrl: null,
      confirmUrl: null,
    })
  })

  it('fills portable text JSON with a name holding quotes, backslashes and newlines', async () => {
    getVolunteersMock.mockResolvedValue({
      volunteers: [vol('v1', 'a@x.no', 'Ola "O\\K"\r\nBcc: x')],
      error: null,
    })
    const message = JSON.stringify([
      {
        _type: 'block',
        children: [{ _type: 'span', text: 'Hello {{name}}' }],
      },
    ])
    await caller().admin.sendBulkEmail({
      volunteerIds: ['v1'],
      subject: 'Hi {{name}}',
      message,
    })
    const [, , subject, body] = sendMock.mock.calls[0]
    expect(subject).toBe('Hi Ola "O\\K" Bcc: x')
    expect(JSON.parse(body)[0].children[0].text).toBe('Hello Ola "O\\K" Bcc: x')
  })

  it('refuses before sending when the conference has no contact email', async () => {
    getVolunteersMock.mockResolvedValue({
      volunteers: [
        {
          ...vol('v1', 'a@x.no'),
          conference: { ...conference, contactEmail: undefined },
        },
      ],
      error: null,
    })
    await expect(
      caller().admin.sendBulkEmail(input(['v1'])),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' })
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('caps the recipient count per call', async () => {
    const ids = Array.from(
      { length: VOLUNTEER_EMAIL_CHUNK + 1 },
      (_, i) => `v${i}`,
    )
    await expect(caller().admin.sendBulkEmail(input(ids))).rejects.toThrow()
    expect(sendMock).not.toHaveBeenCalled()
  })
})
