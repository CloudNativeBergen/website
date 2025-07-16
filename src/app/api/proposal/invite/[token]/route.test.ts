/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, it, describe, expect, beforeAll, afterEach } from '@jest/globals'
import { testApiHandler } from 'next-test-api-route-handler'
import * as appHandler from './route'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  speaker1,
  speaker2,
} from '../../../../../../__tests__/testdata/speakers'
import { draftProposal } from '../../../../../../__tests__/testdata/proposals'
import { CoSpeakerInvitationStatus, Format, Status } from '@/lib/proposal/types'
import sgMail from '@sendgrid/mail'
import { ClientResponse } from '@sendgrid/mail'

// Create test data
const validToken = 'valid-test-token'
const expiredToken = 'expired-test-token'
const workshopProposal = {
  ...draftProposal,
  _id: 'workshop-proposal-id',
  format: Format.workshop_120,
  status: Status.submitted,
  speaker: speaker1,
  coSpeakers: [],
  coSpeakerInvitations: [
    {
      email: 'invited@example.com',
      name: 'Invited Speaker',
      status: CoSpeakerInvitationStatus.pending,
      invitedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      token: validToken,
    },
    {
      email: 'expired@example.com',
      name: 'Expired Invitation',
      status: CoSpeakerInvitationStatus.pending,
      invitedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      token: expiredToken,
    },
  ],
}

beforeAll(async () => {
  try {
    await Promise.all([
      clientWrite.createOrReplace({
        ...speaker1,
        _type: 'speaker',
        _id: speaker1._id!,
      }),
      clientWrite.createOrReplace({
        ...speaker2,
        _type: 'speaker',
        _id: speaker2._id!,  
      }),
    ])
  } catch (error) {
    expect(error).toBeNull()
  }
})

afterEach(async () => {
  jest.restoreAllMocks()
})

describe('GET /api/proposal/invite/[token]', () => {
  it('should return invitation details for valid token', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([workshopProposal])

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.proposal).toBeDefined()
        expect(body.proposal.title).toBe(workshopProposal.title)
        expect(body.invitation).toBeDefined()
        expect(body.invitation.email).toBe('invited@example.com')
        expect(body.invitation.status).toBe(CoSpeakerInvitationStatus.pending)
        expect(body.primarySpeaker).toBeDefined()
        expect(body.primarySpeaker.name).toBe(speaker1.name)
      },
    })
  })

  it('should return 404 for invalid token', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([])

    await testApiHandler({
      appHandler,
      params: { token: 'invalid-token' },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(404)

        const body = await res.json()
        expect(body.error).toBe('Invitation not found')
      },
    })
  })

  it('should return error for expired invitation', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([{
        ...workshopProposal,
        coSpeakerInvitations: [workshopProposal.coSpeakerInvitations![1]], // Only expired invitation
      }])

    await testApiHandler({
      appHandler,
      params: { token: expiredToken },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.invitation.status).toBe(CoSpeakerInvitationStatus.expired)
      },
    })
  })
})

describe('POST /api/proposal/invite/[token]', () => {
  it('should accept invitation and create new speaker', async () => {
    const sendMock = jest
      .spyOn(sgMail, 'send')
      .mockImplementation((emailMsg): any => {
        expect(emailMsg).toBeDefined()
        return Promise.resolve([
          {
            statusCode: 202,
            body: 'Accepted',
            headers: {},
          } as unknown as ClientResponse,
          {},
        ])
      })

    // Mock fetch calls
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValueOnce([workshopProposal]) // First call to get proposal
      .mockResolvedValueOnce([]) // No existing speaker with email

    // Mock create for new speaker
    const createMock = jest.fn<(doc: any) => Promise<any>>().mockResolvedValue({
      _id: 'new-speaker-id',
      name: 'Invited Speaker',
      email: 'invited@example.com',
    })
    clientWrite.create = createMock as any

    // Mock patch for updating proposal
    const patchMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(), 
      commit: patchMock,
    })

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'accept',
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Invitation accepted successfully')

        // Verify speaker was created
        expect(createMock).toHaveBeenCalledWith({
          _type: 'speaker',
          name: 'Invited Speaker',
          email: 'invited@example.com',
        })

        // Verify email was sent
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            to: [speaker1.email, 'invited@example.com'],
            from: process.env.SENDGRID_FROM_EMAIL,
            templateId: process.env.SENDGRID_TEMPALTE_ID_CO_SPEAKER_ACCEPTED,
          }),
        )
      },
    })
  })

  it('should accept invitation for existing speaker', async () => {
    const sendMock = jest
      .spyOn(sgMail, 'send')
      .mockImplementation((emailMsg): any => {
        expect(emailMsg).toBeDefined()
        return Promise.resolve([
          {
            statusCode: 202,
            body: 'Accepted',
            headers: {},
          } as unknown as ClientResponse,
          {},
        ])
      })

    // Mock fetch calls
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValueOnce([workshopProposal]) // First call to get proposal
      .mockResolvedValueOnce([speaker2]) // Existing speaker with email

    // Mock patch for updating proposal
    const patchMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      commit: patchMock,
    })

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'accept',
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Invitation accepted successfully')

        // Verify speaker was NOT created
        expect(clientWrite.create).not.toHaveBeenCalled()

        // Verify co-speaker reference was added
        expect(patchMock).toHaveBeenCalled()
      },
    })
  })

  it('should reject invitation', async () => {
    const sendMock = jest
      .spyOn(sgMail, 'send')
      .mockImplementation((emailMsg): any => {
        expect(emailMsg).toBeDefined()
        return Promise.resolve([
          {
            statusCode: 202,
            body: 'Accepted',
            headers: {},
          } as unknown as ClientResponse,
          {},
        ])
      })

    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([workshopProposal])

    // Mock patch for updating invitation status
    const patchMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      set: jest.fn().mockReturnThis(),
      commit: patchMock,
    })

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'reject',
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Invitation rejected')

        // Verify email was sent
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            to: speaker1.email,
            from: process.env.SENDGRID_FROM_EMAIL,
            templateId: process.env.SENDGRID_TEMPALTE_ID_CO_SPEAKER_REJECTED,
          }),
        )
      },
    })
  })

  it('should return 400 for invalid action', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([workshopProposal])

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'invalid-action',
          }),
        })
        expect(res.status).toBe(400)

        const body = await res.json()
        expect(body.error).toBe('Invalid action')
      },
    })
  })

  it('should return 400 for already responded invitation', async () => {
    const respondedProposal = {
      ...workshopProposal,
      coSpeakerInvitations: [{
        ...workshopProposal.coSpeakerInvitations![0],
        status: CoSpeakerInvitationStatus.accepted,
        respondedAt: new Date().toISOString(),
      }],
    }

    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([respondedProposal])

    await testApiHandler({
      appHandler,
      params: { token: validToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'accept',
          }),
        })
        expect(res.status).toBe(400)

        const body = await res.json()
        expect(body.error).toBe('This invitation has already been responded to')
      },
    })
  })

  it('should return 400 for expired invitation', async () => {
    const expiredProposal = {
      ...workshopProposal,
      coSpeakerInvitations: [workshopProposal.coSpeakerInvitations![1]], // Only expired invitation
    }

    clientReadUncached.fetch = jest.fn<() => Promise<any>>()
      .mockResolvedValue([expiredProposal])

    await testApiHandler({
      appHandler,
      params: { token: expiredToken },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            action: 'accept',
          }),
        })
        expect(res.status).toBe(400)

        const body = await res.json()
        expect(body.error).toBe('This invitation has expired')
      },
    })
  })
})