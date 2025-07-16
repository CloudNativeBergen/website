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
  organizer,
} from '../../../../../../__tests__/testdata/speakers'
import { draftProposal } from '../../../../../../__tests__/testdata/proposals'
import { CoSpeakerInvitationStatus, Format } from '@/lib/proposal/types'
import sgMail from '@sendgrid/mail'
import { ClientResponse } from '@sendgrid/mail'

// Create test data for a proposal that can have co-speakers (not lightning talk)
const workshopProposal = {
  ...draftProposal,
  _id: 'workshop-proposal-id',
  format: Format.workshop_120,
  coSpeakers: [],
  coSpeakerInvitations: [],
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
      clientWrite.createOrReplace({
        ...workshopProposal,
        _type: 'talk',
        _id: workshopProposal._id!,
        speaker: { _type: 'reference', _ref: speaker1._id! },
      }),
    ])
  } catch (error) {
    expect(error).toBeNull()
  }
})

afterEach(async () => {
  jest.restoreAllMocks()
})

describe('GET /api/proposal/[id]/co-speakers', () => {
  it('should return co-speakers for authenticated speaker', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: speaker1,
      coSpeakers: [speaker2],
      coSpeakerInvitations: [],
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.coSpeakers).toHaveLength(1)
        expect(body.coSpeakers[0]._id).toBe(speaker2._id)
        expect(body.coSpeakerInvitations).toHaveLength(0)
      },
    })
  })

  it('should return 401 for unauthenticated request', async () => {
    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(401)
      },
    })
  })

  it('should return 403 for unauthorized speaker', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: { _ref: 'other-speaker-id', _type: 'reference' },
      coSpeakers: [],
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker2._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(403)
      },
    })
  })
})

describe('POST /api/proposal/[id]/co-speakers', () => {
  it('should add co-speaker invitation with email notification', async () => {
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
      .mockResolvedValueOnce({
        ...workshopProposal,
        speaker: speaker1,
        coSpeakers: [],
        coSpeakerInvitations: [],
      })
      .mockResolvedValueOnce([]) // No existing speakers with email

    const patchMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      setIfMissing: jest.fn().mockReturnThis(),
      append: jest.fn().mockReturnThis(),
      commit: patchMock,
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            email: 'newcospeaker@example.com',
            name: 'New Co-Speaker',
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Co-speaker invitation sent successfully')

        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            to: 'newcospeaker@example.com',
            from: process.env.SENDGRID_FROM_EMAIL,
            templateId: process.env.SENDGRID_TEMPALTE_ID_CO_SPEAKER_INVITE,
            dynamicTemplateData: expect.objectContaining({
              invitee: expect.objectContaining({
                name: 'New Co-Speaker',
              }),
              speaker: expect.objectContaining({
                name: speaker1.name,
              }),
              proposal: expect.objectContaining({
                title: workshopProposal.title,
              }),
            }),
          }),
        )
      },
    })
  })

  it('should return 400 for lightning talk format', async () => {
    const lightningProposal = {
      ...draftProposal,
      format: Format.lightning_10,
      speaker: speaker1,
    }

    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue(lightningProposal)

    await testApiHandler({
      appHandler,
      params: { id: draftProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            name: 'Test Speaker',
          }),
        })
        expect(res.status).toBe(400)

        const body = await res.json()
        expect(body.error).toBe('Lightning talks cannot have co-speakers')
      },
    })
  })

  it('should return 403 for non-primary speaker', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: { _ref: 'other-speaker-id', _type: 'reference' },
      coSpeakers: [{ _ref: speaker1._id!, _type: 'reference' }],
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: JSON.stringify({
            email: 'test@example.com',
            name: 'Test Speaker',
          }),
        })
        expect(res.status).toBe(403)

        const body = await res.json()
        expect(body.error).toBe('Only the primary speaker can add co-speakers')
      },
    })
  })
})

describe('DELETE /api/proposal/[id]/co-speakers', () => {
  it('should remove co-speaker as primary speaker', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: speaker1,
      coSpeakers: [{ _ref: speaker2._id!, _type: 'reference' }],
    })

    const unsetMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      unset: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      commit: unsetMock,
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'DELETE',
          body: JSON.stringify({
            speakerId: speaker2._id,
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Co-speaker removed successfully')

        expect(unsetMock).toHaveBeenCalled()
      },
    })
  })

  it('should allow co-speaker to remove themselves', async () => {
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: speaker1,
      coSpeakers: [{ _ref: speaker2._id!, _type: 'reference' }],
    })

    const unsetMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      unset: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      commit: unsetMock,
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker2._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'DELETE',
          body: JSON.stringify({
            speakerId: speaker2._id,
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Co-speaker removed successfully')
      },
    })
  })

  it('should return 403 when trying to remove other co-speaker', async () => {
    const speaker3 = {
      _id: 'speaker3-id',
      name: 'Speaker 3',
      email: 'speaker3@example.com',
    }

    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: speaker1,
      coSpeakers: [
        { _ref: speaker2._id!, _type: 'reference' },
        { _ref: speaker3._id, _type: 'reference' },
      ],
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker2._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'DELETE',
          body: JSON.stringify({
            speakerId: speaker3._id,
          }),
        })
        expect(res.status).toBe(403)

        const body = await res.json()
        expect(body.error).toBe('You can only remove yourself or be removed by the primary speaker')
      },
    })
  })

  it('should cancel pending invitation', async () => {
    const invitationEmail = 'pending@example.com'
    
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...workshopProposal,
      speaker: speaker1,
      coSpeakers: [],
      coSpeakerInvitations: [{
        token: 'test-token',
        email: invitationEmail,
        name: 'Pending Speaker',
        status: CoSpeakerInvitationStatus.pending,
        invitedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }],
    })

    const unsetMock = jest.fn<() => Promise<any>>().mockResolvedValue({
      _id: workshopProposal._id,
    })
    clientWrite.patch = jest.fn<any>().mockReturnValue({
      unset: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      commit: unsetMock,
    })

    await testApiHandler({
      appHandler,
      params: { id: workshopProposal._id },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker1._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'DELETE',
          body: JSON.stringify({
            email: invitationEmail,
          }),
        })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.message).toBe('Invitation cancelled successfully')
      },
    })
  })
})