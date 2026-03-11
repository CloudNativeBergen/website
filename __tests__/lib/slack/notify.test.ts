/**
 * @vitest-environment node
 */
import type { MockedFunction } from 'vitest'
import { Format, Level, Language, Status, Action } from '@/lib/proposal/types'
import type { ProposalExisting } from '@/lib/proposal/types'
import type { Conference } from '@/lib/conference/types'

const mockPostSlackMessage = vi.fn() as MockedFunction<
  typeof import('@/lib/slack/client').postSlackMessage
>

vi.mock('@/lib/slack/client', () => ({
  postSlackMessage: (
    ...args: Parameters<typeof import('@/lib/slack/client').postSlackMessage>
  ) => mockPostSlackMessage(...args),
}))

vi.mock('@/lib/speaker/sanity', () => ({
  getSpeaker: vi
    .fn<() => Promise<{ speaker: { name: string }; err: null }>>()
    .mockResolvedValue({
      speaker: { name: 'Resolved Speaker' },
      err: null,
    }),
}))

function createMockProposal(
  overrides: Partial<ProposalExisting> = {},
): ProposalExisting {
  return {
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
          {
            _type: 'span',
            _key: 'span1',
            text: 'Test description',
            marks: [],
          },
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
    ...overrides,
  }
}

function createMockConference(overrides: Partial<Conference> = {}): Conference {
  return {
    _id: 'conference-id',
    title: 'Test Conference',
    organizer: 'Test Organizer',
    city: 'Test City',
    country: 'Test Country',
    startDate: '2024-06-01',
    endDate: '2024-06-02',
    cfpStartDate: '2024-03-01',
    cfpEndDate: '2024-05-01',
    cfpNotifyDate: '2024-05-15',
    cfpEmail: 'cfp@example.com',
    sponsorEmail: 'sponsors@example.com',
    programDate: '2024-05-20',
    registrationEnabled: true,
    contactEmail: 'test@example.com',
    organizers: [],
    domains: ['test.cloudnativebergen.no'],
    formats: [Format.presentation_25],
    topics: [],
    cfpNotificationChannel: '#cfp-notifications',
    ...overrides,
  }
}

type BlockWithElements = {
  type: string
  elements?: Array<{ url?: string }>
}

describe('Slack notifications', () => {
  beforeEach(() => {
    mockPostSlackMessage.mockReset()
    mockPostSlackMessage.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('notifyNewProposal', () => {
    it('should send notification with proposal details', async () => {
      const { notifyNewProposal } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference()

      await notifyNewProposal(proposal, conference, 'Test Speaker')

      expect(mockPostSlackMessage).toHaveBeenCalledTimes(1)
      const [message, options] = mockPostSlackMessage.mock.calls[0]
      expect(options).toEqual({ channel: '#cfp-notifications' })

      const header = message.blocks[0]
      expect(header.text?.text).toContain('New Talk Proposal')

      const fields = message.blocks[1].fields!
      expect(fields[0].text).toContain('Test Proposal')
      expect(fields[1].text).toContain('Test Speaker')
    })

    it('should include admin link with correct domain', async () => {
      const { notifyNewProposal } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference()

      await notifyNewProposal(proposal, conference, 'Test Speaker')

      const [message] = mockPostSlackMessage.mock.calls[0]
      const actionBlock = message.blocks.find(
        (b) => b.type === 'actions',
      ) as BlockWithElements
      expect(actionBlock).toBeDefined()
      expect(actionBlock.elements![0].url).toBe(
        'https://test.cloudnativebergen.no/admin/proposals/test-proposal-id',
      )
    })

    it('should omit admin button when no domains configured', async () => {
      const { notifyNewProposal } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference({ domains: [] })

      await notifyNewProposal(proposal, conference, 'Test Speaker')

      const [message] = mockPostSlackMessage.mock.calls[0]
      const actionBlock = message.blocks.find((b) => b.type === 'actions')
      expect(actionBlock).toBeUndefined()
    })

    it('should use cfp_notification_channel from conference', async () => {
      const { notifyNewProposal } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference({
        cfpNotificationChannel: '#my-cfp',
      })

      await notifyNewProposal(proposal, conference, 'Speaker')

      const [, options] = mockPostSlackMessage.mock.calls[0]
      expect(options).toEqual({ channel: '#my-cfp' })
    })

    it('should pass no channel when cfp_notification_channel not set', async () => {
      const { notifyNewProposal } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference({
        cfpNotificationChannel: undefined,
      })

      await notifyNewProposal(proposal, conference, 'Speaker')

      const [, options] = mockPostSlackMessage.mock.calls[0]
      expect(options).toEqual({ channel: undefined })
    })
  })

  describe('notifyProposalStatusChange', () => {
    it('should send confirm notification', async () => {
      const { notifyProposalStatusChange } = await import('@/lib/slack/notify')
      const proposal = createMockProposal()
      const conference = createMockConference()

      await notifyProposalStatusChange(
        proposal,
        Action.confirm,
        conference,
        'Test Speaker',
      )

      expect(mockPostSlackMessage).toHaveBeenCalledTimes(1)
      const [message] = mockPostSlackMessage.mock.calls[0]
      expect(message.blocks[0].text?.text).toContain('Confirmed')
    })

    it('should send withdraw notification', async () => {
      const { notifyProposalStatusChange } = await import('@/lib/slack/notify')

      await notifyProposalStatusChange(
        createMockProposal(),
        Action.withdraw,
        createMockConference(),
        'Speaker',
      )

      const [message] = mockPostSlackMessage.mock.calls[0]
      expect(message.blocks[0].text?.text).toContain('Withdrawn')
    })

    it('should include admin link with correct domain', async () => {
      const { notifyProposalStatusChange } = await import('@/lib/slack/notify')

      await notifyProposalStatusChange(
        createMockProposal(),
        Action.confirm,
        createMockConference(),
        'Speaker',
      )

      const [message] = mockPostSlackMessage.mock.calls[0]
      const actionBlock = message.blocks.find(
        (b) => b.type === 'actions',
      ) as BlockWithElements
      expect(actionBlock.elements![0].url).toBe(
        'https://test.cloudnativebergen.no/admin/proposals/test-proposal-id',
      )
    })

    it('should catch and log errors from postSlackMessage', async () => {
      mockPostSlackMessage.mockRejectedValue(new Error('Slack API failed'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { notifyProposalStatusChange } = await import('@/lib/slack/notify')

      await notifyProposalStatusChange(
        createMockProposal(),
        Action.confirm,
        createMockConference(),
        'Speaker',
      )

      expect(errorSpy).toHaveBeenCalledWith(
        'Error sending Slack notification:',
        expect.any(Error),
      )
    })
  })
})
