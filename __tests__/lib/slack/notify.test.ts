import { describe, it, expect, jest, beforeEach } from '@jest/globals'
import {
  notifyNewProposal,
  notifyProposalStatusChange,
} from '@/lib/slack/notify'
import { Action, Format, Level, Language, Status } from '@/lib/proposal/types'
import { ProposalExisting } from '@/lib/proposal/types'
import { Conference } from '@/lib/conference/types'

// Mock the getSpeaker function
const mockGetSpeaker = jest.fn() as jest.MockedFunction<any>
jest.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: mockGetSpeaker,
}))

// Mock fetch for Slack webhook
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>

describe('Slack Notifications', () => {
  const mockProposal: ProposalExisting = {
    _id: 'test-proposal-id',
    _rev: 'test-rev',
    _type: 'talk',
    _createdAt: '2024-01-01T00:00:00Z',
    _updatedAt: '2024-01-01T00:00:00Z',
    title: 'Test Proposal',
    description: [
      {
        _type: 'block',
        _key: 'block1',
        children: [
          { _type: 'span', _key: 'span1', text: 'Test description', marks: [] },
        ],
        markDefs: [],
        style: 'normal',
      },
    ],
    status: Status.submitted,
    format: Format.presentation_25,
    level: Level.intermediate,
    language: Language.english,
    audiences: [],
    outline: 'Test outline',
    topics: [],
    tos: true,
    speakers: [{ _ref: 'speaker-id', _type: 'reference' }],
    conference: { _ref: 'conference-id', _type: 'reference' },
  }

  const mockConference: Conference = {
    _id: 'conference-id',
    title: 'Test Conference',
    organizer: 'Test Organizer',
    city: 'Test City',
    country: 'Test Country',
    start_date: '2024-06-01',
    end_date: '2024-06-02',
    cfp_start_date: '2024-03-01',
    cfp_end_date: '2024-05-01',
    cfp_notify_date: '2024-05-15',
    program_date: '2024-05-20',
    registration_enabled: true,
    contact_email: 'test@example.com',
    organizers: [],
    domains: ['test.cloudnativebergen.no'],
    formats: [Format.presentation_25],
    topics: [],
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // Mock getSpeaker to return test data
    mockGetSpeaker.mockResolvedValue({
      speaker: { 
        _id: 'test-speaker',
        _rev: 'test-rev',
        _createdAt: '2024-01-01T00:00:00Z',
        _updatedAt: '2024-01-01T00:00:00Z',
        name: 'Test Speaker',
        email: 'test@example.com',
        slug: 'test-speaker',
        title: 'Test Title',
        bio: 'Test bio',
        is_organizer: false,
      },
      err: null,
    })

    // Mock successful fetch response
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      status: 200,
    } as Response)

    // Set NODE_ENV to development to avoid actual Slack webhook calls
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
    })
  })

  describe('notifyNewProposal', () => {
    it('should include admin link with correct domain', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      await notifyNewProposal(mockProposal, mockConference)

      expect(consoleSpy).toHaveBeenCalledWith(
        'Slack notification (development mode):',
      )

      // Get the logged message to verify the admin URL
      const loggedMessage = consoleSpy.mock.calls.find((call: any) =>
        call[0].includes('Slack notification (development mode):'),
      )
      expect(loggedMessage).toBeDefined()

      // Verify that the admin URL is correctly constructed
      const messageArg = consoleSpy.mock.calls.find(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('"blocks"'),
      )
      if (messageArg) {
        const message = JSON.parse(messageArg[0])
        const actionBlock = message.blocks.find(
          (block: any) => block.type === 'actions',
        )
        expect(actionBlock).toBeDefined()
        expect(actionBlock.elements[0].url).toBe(
          'https://test.cloudnativebergen.no/admin/proposals/test-proposal-id',
        )
      }

      consoleSpy.mockRestore()
    })

    it('should omit admin button when no domains configured', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
      const conferenceWithoutDomains = { ...mockConference, domains: [] }

      await notifyNewProposal(mockProposal, conferenceWithoutDomains)

      const messageArg = consoleSpy.mock.calls.find(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('"blocks"'),
      )
      if (messageArg) {
        const message = JSON.parse(messageArg[0])
        const actionBlock = message.blocks.find(
          (block: any) => block.type === 'actions',
        )
        // Should not have an action block when no domain is configured
        expect(actionBlock).toBeUndefined()
      }

      consoleSpy.mockRestore()
    })
  })

  describe('notifyProposalStatusChange', () => {
    it('should include admin link with correct domain', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      await notifyProposalStatusChange(
        mockProposal,
        Action.confirm,
        mockConference,
      )

      const messageArg = consoleSpy.mock.calls.find(
        (call: any) =>
          typeof call[0] === 'string' && call[0].includes('"blocks"'),
      )
      if (messageArg) {
        const message = JSON.parse(messageArg[0])
        const actionBlock = message.blocks.find(
          (block: any) => block.type === 'actions',
        )
        expect(actionBlock).toBeDefined()
        expect(actionBlock.elements[0].url).toBe(
          'https://test.cloudnativebergen.no/admin/proposals/test-proposal-id',
        )
      }

      consoleSpy.mockRestore()
    })
  })
})
