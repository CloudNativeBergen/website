/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, it, describe, expect, beforeAll, afterEach } from '@jest/globals'
import { testApiHandler } from 'next-test-api-route-handler'
import * as appHandler from './route'
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
import sgMail from '@sendgrid/mail'
import { ClientResponse } from '@sendgrid/mail'

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

        expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
          to: speaker.email,
          from: process.env.SENDGRID_FROM_EMAIL,
          templateId: process.env.SENDGRID_TEMPALTE_ID_CFP_ACCEPT,
          dynamicTemplateData: expect.objectContaining({
            speaker: expect.objectContaining({
              name: speaker.name,
            }),
            proposal: expect.objectContaining({
              title: submittedProposal.title,
              confirmUrl: `${process.env.NEXT_PUBLIC_URL}/cfp/list?confirm=${submittedProposal._id}`,
              comment: 'this is the comment',
            }),
            event: expect.objectContaining({
              location: 'Kvarteret, Bergen, Norway',
              date: '30 October 2024',
              name: 'Cloud Native Day Bergen 2024',
            }),
          }),
        }))
      },
    })
  })

  it('sends an email notification when the action is reject', async () => {
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

        expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({
          to: speaker.email,
          from: process.env.SENDGRID_FROM_EMAIL,
          templateId: process.env.SENDGRID_TEMPALTE_ID_CFP_REJECT,
          dynamicTemplateData: expect.objectContaining({
            speaker: expect.objectContaining({
              name: speaker.name,
            }),
            proposal: expect.objectContaining({
              title: submittedProposal.title,
              confirmUrl: `${process.env.NEXT_PUBLIC_URL}/cfp/list?confirm=${submittedProposal._id}`,
              comment: 'this is the comment',
            }),
            event: expect.objectContaining({
              location: 'Kvarteret, Bergen, Norway',
              date: '30 October 2024',
              name: 'Cloud Native Day Bergen 2024',
            }),
          }),
        }))
      },
    })
  })
})
