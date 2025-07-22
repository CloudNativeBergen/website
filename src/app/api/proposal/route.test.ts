/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, it, jest, beforeEach } from '@jest/globals'
import * as appHandler from './route'
import { clientReadUncached } from '@/lib/sanity/client'
import proposals from '../../../../__tests__/testdata/proposals'
import { describe } from 'node:test'
import { testApiHandler } from 'next-test-api-route-handler'
import { Speaker } from '@/lib/speaker/types'
import { ProposalInput, Language, Format, Level } from '@/lib/proposal/types'

const speaker = proposals[0].speakers![0] as Speaker

const mockConference = {
  _id: 'test-conference-id',
  title: 'Test Conference 2024',
  cfp_start_date: '2024-01-01',
  cfp_end_date: '2024-12-31',
  formats: [Format.lightning_10, Format.presentation_20],
}

const mockCreateProposal = jest.fn()
const mockCountProposals = jest.fn()
const mockGetConference = jest.fn()

// Mock the required modules
jest.mock('@/lib/proposal/sanity', () => ({
  getProposals: jest.fn(),
  createProposal: (...args: any[]) => mockCreateProposal(...args),
  countProposalsForSpeakerInConference: (...args: any[]) =>
    mockCountProposals(...args),
}))

jest.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: () => mockGetConference(),
}))

jest.mock('@/lib/slack/notify', () => ({
  notifyNewProposal: jest.fn(),
}))

beforeEach(() => {
  jest.clearAllMocks()

  clientReadUncached.fetch = jest
    .fn<() => Promise<any>>()
    .mockResolvedValue(
      proposals.filter(
        (p) =>
          p.speakers &&
          p.speakers.length > 0 &&
          '_id' in p.speakers[0] &&
          p.speakers[0]._id === speaker._id,
      ),
    )

  mockGetConference.mockImplementation(() =>
    Promise.resolve({
      conference: mockConference,
      error: null,
    }),
  )
})

describe('GET /api/proposal', () => {
  it('should return 200 for authenticated user', async () => {
    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({ method: 'GET' })
        expect(res.status).toBe(200)

        const body = await res.json()
        expect(body.proposals).toHaveLength(4)
        expect(
          body.proposals.every((p: any) => p.speaker._id === speaker._id),
        ).toBe(true)
      },
    })
  })
})

describe('POST /api/proposal', () => {
  const validProposal: ProposalInput = {
    title: 'Test Proposal',
    description: [
      {
        _type: 'block',
        _key: 'test',
        children: [{ _type: 'span', text: 'Test content' }],
      },
    ],
    language: Language.english,
    format: Format.lightning_10,
    level: Level.beginner,
    audiences: [],
    topics: [],
    outline: 'Test outline',
    tos: true,
  }

  it('should allow proposal creation when under limit', async () => {
    mockCountProposals.mockImplementation(() =>
      Promise.resolve({ count: 2, error: null }),
    )
    mockCreateProposal.mockImplementation(() =>
      Promise.resolve({
        proposal: { ...validProposal, _id: 'new-proposal-id' },
        err: null,
      }),
    )

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validProposal),
        })

        expect(res.status).toBe(200)
        expect(mockCountProposals).toHaveBeenCalledWith({
          speakerId: speaker._id,
          conferenceId: mockConference._id,
        })
        expect(mockCreateProposal).toHaveBeenCalled()
      },
    })
  })

  it('should reject proposal creation when at limit', async () => {
    mockCountProposals.mockImplementation(() =>
      Promise.resolve({ count: 3, error: null }),
    )

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validProposal),
        })

        expect(res.status).toBe(429)
        const body = await res.json()
        expect(body.error.type).toBe('proposal_limit_exceeded')
        expect(body.error.message).toContain('maximum limit of 3 proposals')
        expect(mockCreateProposal).not.toHaveBeenCalled()
      },
    })
  })

  it('should handle count error gracefully', async () => {
    mockCountProposals.mockImplementation(() =>
      Promise.resolve({ count: 0, error: new Error('Database error') }),
    )

    await testApiHandler({
      appHandler,
      requestPatcher(request) {
        request.headers.set('x-test-auth-user', speaker._id!)
      },
      async test({ fetch }) {
        const res = await fetch({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(validProposal),
        })

        expect(res.status).toBe(500)
        const body = await res.json()
        expect(body.error.message).toContain('Failed to check proposal limit')
        expect(mockCreateProposal).not.toHaveBeenCalled()
      },
    })
  })
})
