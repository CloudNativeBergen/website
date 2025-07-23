/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// All mocks must be declared before any imports that use them
const mockSendAcceptRejectNotification = jest.fn() as jest.MockedFunction<
  typeof import('@/lib/proposal/notification').sendAcceptRejectNotification
>
const mockGetConferenceForCurrentDomain = jest.fn() as jest.MockedFunction<
  typeof import('@/lib/conference/sanity').getConferenceForCurrentDomain
>

jest.mock('@/lib/proposal/notification', () => ({
  sendAcceptRejectNotification: mockSendAcceptRejectNotification,
}))
jest.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: mockGetConferenceForCurrentDomain,
}))
jest.mock('resend')

import { jest, it, describe, expect, beforeAll, afterEach } from '@jest/globals'
import { testApiHandler } from 'next-test-api-route-handler'
import { actionStateMachine } from '@/lib/proposal/states'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import {
  draftProposal,
  submittedProposal,
} from '../../../../../../__tests__/testdata/proposals'
import {
  speaker1 as speaker,
  organizer,
} from '../../../../../../__tests__/testdata/speakers'
import { Action, Status } from '@/lib/proposal/types'

// Import the route handler after mocks are set up
import * as appHandler from './route'

// Import mocked functions - they should now be properly mocked
import { sendAcceptRejectNotification } from '@/lib/proposal/notification'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'

// Debug: Let's see what the imported functions are
console.log('sendAcceptRejectNotification:', sendAcceptRejectNotification)
console.log(
  'sendAcceptRejectNotification type:',
  typeof sendAcceptRejectNotification,
)
console.log('getConferenceForCurrentDomain:', getConferenceForCurrentDomain)
console.log(
  'getConferenceForCurrentDomain type:',
  typeof getConferenceForCurrentDomain,
)

// These should now be the mock functions we created above
console.log(
  'mockSendAcceptRejectNotification:',
  mockSendAcceptRejectNotification,
)
console.log(
  'mockSendAcceptRejectNotification type:',
  typeof mockSendAcceptRejectNotification,
)
console.log(
  'mockSendAcceptRejectNotification.mockClear:',
  mockSendAcceptRejectNotification.mockClear,
)
console.log(
  'mockGetConferenceForCurrentDomain:',
  mockGetConferenceForCurrentDomain,
)
console.log(
  'mockGetConferenceForCurrentDomain type:',
  typeof mockGetConferenceForCurrentDomain,
)
console.log(
  'mockGetConferenceForCurrentDomain.mockResolvedValue:',
  mockGetConferenceForCurrentDomain.mockResolvedValue,
)

beforeAll(async () => {
  try {
    await Promise.all([
      clientWrite.createOrReplace({
        ...speaker,
        _type: 'speaker',
        _id: speaker._id!,
      }),
      clientWrite.createOrReplace({
        ...draftProposal,
        _type: 'talk',
        _id: draftProposal._id!,
        speaker: { _type: 'reference', _ref: speaker._id! },
      }),
      clientWrite.createOrReplace({
        ...submittedProposal,
        _type: 'talk',
        _id: submittedProposal._id!,
        speaker: { _type: 'reference', _ref: speaker._id! },
      }),
    ])
  } catch (error) {
    expect(error).toBeNull()
  }
})

afterEach(async () => {
  jest.restoreAllMocks()
  mockSendAcceptRejectNotification.mockClear()
  mockGetConferenceForCurrentDomain.mockClear()
})

describe('actionStateMachine', () => {
  const testCases = [
    {
      currentStatus: Status.draft,
      action: Action.submit,
      isOrganizer: false,
      expectedStatus: Status.submitted,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.submitted,
      action: Action.unsubmit,
      isOrganizer: false,
      expectedStatus: Status.draft,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.submitted,
      action: Action.accept,
      isOrganizer: true,
      expectedStatus: Status.accepted,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.submitted,
      action: Action.accept,
      isOrganizer: false,
      expectedStatus: Status.submitted,
      expectedValidAction: false,
    },
    {
      currentStatus: Status.submitted,
      action: Action.reject,
      isOrganizer: true,
      expectedStatus: Status.rejected,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.submitted,
      action: Action.reject,
      isOrganizer: false,
      expectedStatus: Status.submitted,
      expectedValidAction: false,
    },
    {
      currentStatus: Status.accepted,
      action: Action.confirm,
      isOrganizer: false,
      expectedStatus: Status.confirmed,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.accepted,
      action: Action.remind,
      isOrganizer: true,
      expectedStatus: Status.accepted,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.accepted,
      action: Action.withdraw,
      isOrganizer: false,
      expectedStatus: Status.withdrawn,
      expectedValidAction: true,
    },
    {
      currentStatus: Status.confirmed,
      action: Action.withdraw,
      isOrganizer: false,
      expectedStatus: Status.withdrawn,
      expectedValidAction: true,
    },
  ]

  testCases.forEach((testCase) => {
    it(`should transition from ${testCase.currentStatus} to ${testCase.expectedStatus} when action is ${testCase.action} and isOrganizer is ${testCase.isOrganizer}`, () => {
      const { status, isValidAction } = actionStateMachine(
        testCase.currentStatus,
        testCase.action,
        testCase.isOrganizer,
      )
      expect(status).toBe(testCase.expectedStatus)
      expect(isValidAction).toBe(testCase.expectedValidAction)
    })
  })
})

describe('POST /api/proposal/[id]/action', () => {
  it('requires authentication', async () => {
    await testApiHandler({
      appHandler,
      params: { id: draftProposal._id! },
      async test({ fetch }) {
        const res = await fetch({ method: 'POST', body: '{"action": "foo"}' })
        expect(res.status).toBe(401)
      },
    })
  })

  it('requires a valid action', async () => {
    // Mock conference response
    mockGetConferenceForCurrentDomain.mockResolvedValue({
      conference: {
        _id: 'conference-2024',
        title: 'Cloud Native Day Bergen 2024',
        organizer: 'Cloud Native Bergen',
        city: 'Bergen',
        country: 'Norway',
        venue_name: 'Kvarteret',
        venue_address: 'Kvarteret, Bergen, Norway',
        start_date: '2024-10-30',
        end_date: '2024-10-30',
        cfp_start_date: '2024-07-01',
        cfp_end_date: '2024-09-15',
        cfp_notify_date: '2024-09-30',
        program_date: '2024-10-15',
        registration_enabled: true,
        contact_email: 'contact@cloudnativebergen.dev',
        organizers: [],
        domains: ['cloudnativeday.no'],
        formats: [],
        topics: [],
      },
      domain: 'cloudnativeday.no',
      error: null,
    })

    // Sanity is caching stuff, so let's mock the fetch to return the proposal
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...draftProposal,
      _type: 'talk',
      _id: draftProposal._id!,
    })

    await testApiHandler({
      appHandler,
      params: { id: draftProposal._id! },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: `{"action": "${Action.submit}"}`,
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
          proposalStatus: Status.submitted,
          status: 200,
        })

        const doc = await clientWrite.getDocument(draftProposal._id!)
        expect(doc).not.toBeNull()
        expect(doc!.status).toBe(Status.submitted)
      },
    })
  })

  it('sends an email notification when the action is accept', async () => {
    // Mock conference response
    mockGetConferenceForCurrentDomain.mockResolvedValue({
      conference: {
        _id: 'conference-2024',
        title: 'Cloud Native Day Bergen 2024',
        organizer: 'Cloud Native Bergen',
        city: 'Bergen',
        country: 'Norway',
        venue_name: 'Kvarteret',
        venue_address: 'Kvarteret, Bergen, Norway',
        start_date: '2024-10-30',
        end_date: '2024-10-30',
        cfp_start_date: '2024-07-01',
        cfp_end_date: '2024-09-15',
        cfp_notify_date: '2024-09-30',
        program_date: '2024-10-15',
        registration_enabled: true,
        contact_email: 'contact@cloudnativebergen.dev',
        organizers: [],
        domains: ['cloudnativeday.no'],
        formats: [],
        topics: [],
      },
      domain: 'cloudnativeday.no',
      error: null,
    })

    mockSendAcceptRejectNotification.mockResolvedValue({
      id: 'test-email-id',
    })

    // Sanity is caching stuff, so let's mock the fetch to return the proposal
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...submittedProposal,
      _type: 'talk',
      _id: submittedProposal._id!,
    })

    await testApiHandler({
      appHandler,
      params: { id: submittedProposal._id! },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', organizer._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: `{"action": "${Action.accept}", "notify": true, "comment": "this is the comment"}`,
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
          proposalStatus: Status.accepted,
          status: 200,
        })

        const doc = await clientWrite.getDocument(submittedProposal._id!)
        expect(doc).not.toBeNull()
        expect(doc!.status).toBe(Status.accepted)

        expect(mockSendAcceptRejectNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            action: Action.accept,
            speaker: expect.objectContaining({
              name: speaker.name,
              email: speaker.email,
            }),
            proposal: expect.objectContaining({
              title: submittedProposal.title,
              _id: submittedProposal._id,
            }),
            event: expect.objectContaining({
              location: 'Kvarteret, Bergen, Norway',
              date: '30 October 2024',
              name: 'Cloud Native Day Bergen 2024',
            }),
            comment: 'this is the comment',
          }),
        )
      },
    })
  })

  it('sends an email notification when the action is reject', async () => {
    // Mock conference response
    mockGetConferenceForCurrentDomain.mockResolvedValue({
      conference: {
        _id: 'conference-2024',
        title: 'Cloud Native Day Bergen 2024',
        organizer: 'Cloud Native Bergen',
        city: 'Bergen',
        country: 'Norway',
        venue_name: 'Kvarteret',
        venue_address: 'Kvarteret, Bergen, Norway',
        start_date: '2024-10-30',
        end_date: '2024-10-30',
        cfp_start_date: '2024-07-01',
        cfp_end_date: '2024-09-15',
        cfp_notify_date: '2024-09-30',
        program_date: '2024-10-15',
        registration_enabled: true,
        contact_email: 'contact@cloudnativebergen.dev',
        organizers: [],
        domains: ['cloudnativeday.no'],
        formats: [],
        topics: [],
      },
      domain: 'cloudnativeday.no',
      error: null,
    })

    mockSendAcceptRejectNotification.mockResolvedValue({
      id: 'test-email-id',
    })

    // Sanity is caching stuff, so let's mock the fetch to return the proposal
    clientReadUncached.fetch = jest.fn<() => Promise<any>>().mockResolvedValue({
      ...submittedProposal,
      _type: 'talk',
      _id: submittedProposal._id!,
    })

    await testApiHandler({
      appHandler,
      params: { id: submittedProposal._id! },
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', organizer._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          body: `{"action": "${Action.reject}", "notify": true, "comment": "this is the comment"}`,
        })
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
          proposalStatus: Status.rejected,
          status: 200,
        })

        const doc = await clientWrite.getDocument(submittedProposal._id!)
        expect(doc).not.toBeNull()
        expect(doc!.status).toBe(Status.rejected)

        expect(mockSendAcceptRejectNotification).toHaveBeenCalledWith(
          expect.objectContaining({
            action: Action.reject,
            speaker: expect.objectContaining({
              name: speaker.name,
              email: speaker.email,
            }),
            proposal: expect.objectContaining({
              title: submittedProposal.title,
              _id: submittedProposal._id,
            }),
            event: expect.objectContaining({
              location: 'Kvarteret, Bergen, Norway',
              date: '30 October 2024',
              name: 'Cloud Native Day Bergen 2024',
            }),
            comment: 'this is the comment',
          }),
        )
      },
    })
  })
})
