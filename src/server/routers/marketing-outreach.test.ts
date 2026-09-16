/** @vitest-environment node
 * Router contracts with real tenancy and real editor/completion projection.
 * Messaging persistence/notification boundaries are mocked. Atomic persistence
 * itself is covered separately by the messaging transaction tests.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { Conference } from '@/lib/conference/types'
import type { SponsorFanoutContext } from '@/lib/messaging/sponsor'
import type { ConversationWithContext, Message } from '@/lib/messaging/types'
import { marketingRouter } from './marketing'

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  read: vi.fn(),
  editorRead: vi.fn(),
  update: vi.fn(),
  createTask: vi.fn(),
  campaign: vi.fn(),
  sponsor: vi.fn(),
  standing: vi.fn(),
  addMessage: vi.fn(),
  general: vi.fn(),
  sponsorConversation: vi.fn(),
  conversation: vi.fn(),
  notify: vi.fn(),
  notifySponsor: vi.fn(),
  fanout: vi.fn(),
  throttle: vi.fn(),
  after: vi.fn(),
  organizers: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn() },
  clientReadUncached: { fetch: h.read },
}))
vi.mock('@/lib/marketing/sanity', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/marketing/sanity')>()
  h.editorRead.mockImplementation(actual.getTaskEditorData)
  return {
    ...actual,
    getTaskEditorData: h.editorRead,
    updateTaskFields: h.update,
  }
})
vi.mock('@/lib/marketing/outreach/sanity', () => ({
  createOutreachTask: h.createTask,
  getOutreachCampaign: h.campaign,
  resolveOutreachSponsor: h.sponsor,
}))
vi.mock('@/lib/messaging/sanity', () => ({
  addMessage: h.addMessage,
  createGeneralConversation: h.general,
  ensureSponsorConversation: h.sponsorConversation,
  getConversationById: h.conversation,
}))
vi.mock('@/lib/messaging/standing', () => ({
  speakerHasStandingInConference: h.standing,
}))
vi.mock('@/lib/messaging/sponsor', () => ({
  getSponsorFanoutContext: h.fanout,
}))
vi.mock('@/lib/messaging/notify', () => ({
  notifyNewMessage: h.notify,
  notifySponsorMessage: h.notifySponsor,
}))
vi.mock('@/lib/messaging/send-rate', () => ({ claimSendSlot: h.throttle }))
vi.mock('@/server/runAfterResponse', () => ({ runAfterResponse: h.after }))
vi.mock('@/lib/speaker/sanity', () => ({
  getOrganizersByConference: h.organizers,
}))

const conference = {
  _id: 'conf-A',
  organization: { _ref: 'org-A' },
  title: 'Cloud Native Bergen',
  domains: ['cloudnativebergen.dev'],
  organizer: 'Cloud Native Bergen',
  city: 'Bergen',
  country: 'Norway',
  startDate: '2027-06-10',
  endDate: '2027-06-11',
  cfpStartDate: '2027-01-10',
  cfpEndDate: '2027-03-01',
  cfpNotifyDate: '2027-04-01',
  programDate: '2027-04-20',
  cfpEmail: 'cfp@example.com',
  sponsorEmail: 'sponsors@example.com',
  contactEmail: 'hello@example.com',
  registrationEnabled: true,
  organizers: [],
  formats: [],
  topics: [],
} satisfies Conference
const conversation = {
  _id: 'conversation-1',
  conferenceId: 'conf-A',
  subjectSpeakerId: 'speaker-1',
  conversationType: 'general',
  proposalSpeakerIds: [],
  createdById: 'admin-1',
  subject: 'Invite Ada to share',
  createdAt: '2027-01-01T00:00:00Z',
  lastMessageAt: '2027-01-01T00:00:00Z',
} satisfies ConversationWithContext
const message = {
  _id: 'message-1',
  body: 'Edited outreach',
  authorId: 'admin-1',
  conversationId: 'conversation-1',
  createdAt: '2027-01-01T00:00:00Z',
} satisfies Message
const sfc = {
  sfcId: 'sfc-1',
  sponsorName: 'Acme',
  registrationToken: 'sponsor-token',
  contactPersons: [{ name: 'Contact', email: 'contact@example.com' }],
  conference,
} satisfies SponsorFanoutContext
const send = { taskId: 'task-ours', rev: 'rev-1', body: 'Edited outreach' }
const creation = {
  campaignId: 'campaign-ours',
  kind: 'speakerOutreach' as const,
  subjectId: 'speaker-1',
  title: 'Invite Ada to share',
  targetPage: '/tickets',
  dueAt: '2027-01-10T07:00:00.000Z',
}
function rawTask() {
  return {
    _id: 'task-ours',
    _rev: 'rev-1',
    campaignId: 'campaign-ours',
    key: 'invite-ada',
    title: 'Invite Ada to share',
    kind: 'speakerOutreach',
    status: 'open',
    targetPage: '/tickets',
    subject: { _id: 'speaker-1', _type: 'speaker', name: 'Ada', slug: 'ada' },
    messageId: null as string | null,
    campaign: { _id: 'campaign-ours', key: 'tickets', title: 'Tickets' },
    siblings: [],
    variant: null,
  }
}
let task = rawTask()
let callbacks: (() => Promise<void>)[] = []
const t = initTRPC.context<Context>().create()
function caller() {
  const speaker = { _id: 'admin-1', name: 'Admin', organizerOrgIds: ['org-A'] }
  const user = { email: 'admin@example.com', name: 'Admin', picture: '' }
  return t.createCallerFactory(marketingRouter)({
    req: { headers: new Headers(), url: 'http://localhost:3000' },
    session: { expires: '2099-01-01T00:00:00Z', user, speaker },
    speaker,
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context)
}
async function flushNotifications() {
  for (const cb of callbacks) await cb()
}
beforeEach(() => {
  vi.clearAllMocks()
  task = rawTask()
  callbacks = []
  h.getConference.mockResolvedValue({
    conference,
    domain: conference.domains[0],
    error: null,
  })
  h.read.mockImplementation(
    async (_query: string, params: { id?: string; taskId?: string }) => {
      if (params.id)
        return {
          _type: params.id.startsWith('campaign')
            ? 'marketingCampaign'
            : 'marketingTask',
          conferenceId: params.id.endsWith('foreign') ? 'conf-B' : 'conf-A',
          conferenceOrgId: 'org-A',
          memberOrgIds: [],
        }
      if (params.taskId) return structuredClone(task)
      throw new Error('Unexpected persistence read')
    },
  )
  h.standing.mockResolvedValue(true)
  h.sponsor.mockResolvedValue({ _id: 'sfc-1', name: 'Acme' })
  h.campaign.mockResolvedValue({
    _id: 'campaign-ours',
    key: 'tickets',
    planId: 'plan-1',
    ownerId: 'owner-1',
  })
  h.throttle.mockReturnValue(true)
  h.general.mockResolvedValue(conversation._id)
  h.sponsorConversation.mockResolvedValue(conversation._id)
  h.conversation.mockResolvedValue(conversation)
  h.fanout.mockResolvedValue(sfc)
  h.addMessage.mockImplementation(async () => {
    task.messageId = message._id
    task._rev = 'rev-sent'
    return message
  })
  h.after.mockImplementation((cb: () => Promise<void>) => {
    callbacks.push(cb)
  })
  h.organizers.mockResolvedValue({ speakers: [] })
  h.update.mockResolvedValue(true)
})

describe('marketing outreach delivery', () => {
  it('sends the submitted speaker body, atomically requests completion, and reads real derived completion', async () => {
    expect(
      (await caller().task.get({ taskId: send.taskId })).task.complete,
    ).toBe(false)
    expect(await caller().task.sendOutreach(send)).toEqual({
      messageId: message._id,
    })
    expect(h.standing).toHaveBeenCalledWith('speaker-1', 'conf-A')
    expect(h.general).toHaveBeenCalledWith({
      id: expect.stringMatching(/^conversation\.marketing\.[a-f0-9]{64}$/),
      conferenceId: 'conf-A',
      createdById: 'admin-1',
      subject: task.title,
      subjectSpeakerId: 'speaker-1',
    })
    expect(h.conversation).toHaveBeenCalledWith(conversation._id)
    expect(h.addMessage).toHaveBeenCalledWith({
      conversationId: conversation._id,
      authorId: 'admin-1',
      body: send.body,
      marketingTask: { id: send.taskId, rev: send.rev },
    })
    await flushNotifications()
    expect(h.notify).toHaveBeenCalledWith({
      conversation,
      message,
      conference,
      authorId: 'admin-1',
    })
    const read = await caller().task.get({ taskId: send.taskId })
    expect(read.task).toMatchObject({
      complete: true,
      messageId: message._id,
      status: 'done',
    })
    expect(task.status).toBe('open')
    expect(h.update).not.toHaveBeenCalled()
  })
  it('resolves the sponsor relationship and fans out with the organizer author and loaded context', async () => {
    task.kind = 'sponsorOutreach'
    task.subject = {
      _id: 'sponsor-1',
      _type: 'sponsor',
      name: 'Acme',
      slug: 'acme',
    }
    const sponsorConversation = {
      ...conversation,
      conversationType: 'sponsor' as const,
      participants: [
        { partyType: 'sponsor' as const, sponsorForConferenceId: 'sfc-1' },
      ],
    }
    h.conversation.mockResolvedValue(sponsorConversation)
    await caller().task.sendOutreach(send)
    expect(h.sponsor).toHaveBeenCalledWith('sponsor-1', 'conf-A')
    expect(h.sponsorConversation).toHaveBeenCalledWith({
      conferenceId: 'conf-A',
      sponsorForConferenceId: 'sfc-1',
      sponsorName: 'Acme',
      createdById: 'admin-1',
    })
    await flushNotifications()
    expect(h.fanout).toHaveBeenCalledWith('sfc-1')
    expect(h.notifySponsor).toHaveBeenCalledWith({
      conversation: sponsorConversation,
      message,
      sfc,
      authorOrganizerId: 'admin-1',
    })
  })
  it('refuses a second send before addMessage', async () => {
    await caller().task.sendOutreach(send)
    h.addMessage.mockClear()
    await expect(
      caller().task.sendOutreach({ ...send, rev: task._rev }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This outreach message has already been sent.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('refuses a stale revision before addMessage even when no message has landed', async () => {
    task._rev = 'rev-winner'
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The Task changed while you were editing. Reload and retry.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('translates a transaction revision race into a conflict', async () => {
    h.addMessage.mockRejectedValueOnce({ statusCode: 409 })
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The Task changed while you were editing. Reload and retry.',
    })
  })
  it('retries a failed atomic persistence call and reads the recovered sent state', async () => {
    h.addMessage.mockRejectedValueOnce(new Error('Transaction unavailable'))
    await expect(caller().task.sendOutreach(send)).rejects.toThrow(
      'Transaction unavailable',
    )
    expect(await caller().task.sendOutreach(send)).toEqual({
      messageId: message._id,
    })
    expect(
      (await caller().task.get({ taskId: send.taskId })).task,
    ).toMatchObject({ complete: true, messageId: message._id, status: 'done' })
    await flushNotifications()
    expect(h.notify).toHaveBeenCalledTimes(1)
    expect(h.general.mock.calls[0][0].id).toBe(h.general.mock.calls[1][0].id)
  })
  it('recovers after the recipient changes without reusing the previous recipient thread', async () => {
    h.addMessage.mockRejectedValueOnce(new Error('Transaction unavailable'))
    await expect(caller().task.sendOutreach(send)).rejects.toThrow(
      'Transaction unavailable',
    )
    task.subject._id = 'speaker-2'
    task._rev = 'rev-new-recipient'
    h.conversation.mockResolvedValue({
      ...conversation,
      _id: 'conversation-2',
      subjectSpeakerId: 'speaker-2',
    })
    h.general.mockResolvedValue('conversation-2')
    expect(
      await caller().task.sendOutreach({ ...send, rev: task._rev }),
    ).toEqual({
      messageId: message._id,
    })
    expect(new Set(h.general.mock.calls.map(([input]) => input.id)).size).toBe(
      2,
    )
    expect(h.general.mock.calls[1][0].subjectSpeakerId).toBe('speaker-2')
    expect(h.addMessage.mock.calls[1][0].conversationId).toBe('conversation-2')
    expect(
      (await caller().task.get({ taskId: send.taskId })).task.complete,
    ).toBe(true)
  })
  it.each([
    { conferenceId: 'conf-B' },
    { conversationType: 'proposal' },
    { subjectSpeakerId: 'speaker-old' },
  ])('refuses a mismatched speaker conversation: %j', async (mismatch) => {
    h.conversation.mockResolvedValue({ ...conversation, ...mismatch })
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The conversation no longer matches this outreach recipient.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it.each([
    {
      conversationType: 'general',
      participants: [{ partyType: 'sponsor', sponsorForConferenceId: 'sfc-1' }],
    },
    {
      conversationType: 'sponsor',
      participants: [
        { partyType: 'sponsor', sponsorForConferenceId: 'sfc-other' },
      ],
    },
  ])('refuses a mismatched sponsor conversation: %j', async (mismatch) => {
    task.kind = 'sponsorOutreach'
    task.subject._type = 'sponsor'
    h.conversation.mockResolvedValue({ ...conversation, ...mismatch })
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'The conversation no longer matches this outreach recipient.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('recovers a lost commit response by reading completion and refusing another delivery', async () => {
    h.addMessage.mockImplementationOnce(async () => {
      task.messageId = message._id
      task._rev = 'rev-sent'
      throw new Error('Response lost after transaction commit')
    })
    await expect(caller().task.sendOutreach(send)).rejects.toThrow(
      'Response lost after transaction commit',
    )
    const recovered = await caller().task.get({ taskId: send.taskId })
    expect(recovered.task).toMatchObject({
      messageId: message._id,
      complete: true,
      status: 'done',
      _rev: 'rev-sent',
    })
    expect(task.status).toBe('open')
    h.addMessage.mockClear()
    await expect(
      caller().task.sendOutreach({ ...send, rev: recovered.task._rev }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'This outreach message has already been sent.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it.each([
    ['kind', 'checklist', 'This Task is not outreach.'],
    ['status', 'skipped', 'Only open outreach Tasks can send.'],
    ['targetPage', '', 'Pick a destination before sending outreach.'],
    [
      'targetPage',
      '//foreign.example/path',
      'The outreach destination must be on this conference site.',
    ],
  ])(
    'refuses invalid %s=%s before creating a conversation',
    async (field, value, error) => {
      Object.assign(task, { [field]: value })
      await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: error,
      })
      expect(h.general).not.toHaveBeenCalled()
      expect(h.addMessage).not.toHaveBeenCalled()
    },
  )
  it.each(['sponsor', 'talk'])(
    'refuses speaker outreach with a %s subject',
    async (type) => {
      task.subject._type = type
      await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'This outreach Task requires a speaker subject.',
      })
      expect(h.general).not.toHaveBeenCalled()
      expect(h.addMessage).not.toHaveBeenCalled()
    },
  )
  it('refuses a speaker without conference standing before creation', async () => {
    h.standing.mockResolvedValue(false)
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'The speaker has no standing in this conference.',
    })
    expect(h.general).not.toHaveBeenCalled()
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it.each(['speakerOutreach', 'sponsorOutreach'])(
    'refuses %s without a subject with its own error',
    async (kind) => {
      Object.assign(task, { kind, subject: null })
      await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: `This outreach Task requires a ${kind === 'speakerOutreach' ? 'speaker' : 'sponsor'} subject.`,
      })
      expect(h.addMessage).not.toHaveBeenCalled()
    },
  )
  it('refuses sponsor outreach addressed to a speaker', async () => {
    task.kind = 'sponsorOutreach'
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'This outreach Task requires a sponsor subject.',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('gives a sponsor without an edition relationship its distinct refusal', async () => {
    task.kind = 'sponsorOutreach'
    task.subject._type = 'sponsor'
    h.sponsor.mockResolvedValue(null)
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'This sponsor has no sponsorForConference relationship in this conference.',
    })
    expect(h.sponsorConversation).not.toHaveBeenCalled()
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('refuses a foreign task before reading its editor data', async () => {
    await expect(
      caller().task.sendOutreach({ ...send, taskId: 'task-foreign' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No marketingTask with that id for this request',
    })
    expect(h.editorRead).not.toHaveBeenCalled()
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('preserves per-author throttling before creating anything', async () => {
    h.throttle.mockReturnValue(false)
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'TOO_MANY_REQUESTS',
      message:
        'You are sending messages too quickly. Please wait a moment and try again.',
    })
    expect(h.throttle).toHaveBeenCalledWith('admin-1')
    expect(h.general).not.toHaveBeenCalled()
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it.each([
    { label: 'whitespace-only', body: ' ' },
    { label: 'over 5000 characters', body: 'x'.repeat(5001) },
  ])('preserves the messaging body validation: $label', async ({ body }) => {
    await expect(
      caller().task.sendOutreach({ ...send, body }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it('accepts the exact body cap and trims outer whitespace', async () => {
    await caller().task.sendOutreach({
      ...send,
      body: `  ${'x'.repeat(5000)}  `,
    })
    expect(h.addMessage.mock.calls[0][0].body).toBe('x'.repeat(5000))
  })
  it.each(['{event}', '{recipient}', '{unknownCampaign}'])(
    'refuses an edited outreach body with unresolved token %s',
    async (token) => {
      await expect(
        caller().task.sendOutreach({
          ...send,
          body: `Hi Ada, please share ${token} with your community.`,
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        cause: {
          issues: [
            {
              code: 'custom',
              path: ['body'],
              message: 'Replace all {placeholders} before sending outreach.',
            },
          ],
        },
      })
      expect(h.read).not.toHaveBeenCalled()
      expect(h.addMessage).not.toHaveBeenCalled()
    },
  )
  it.each(['{up to 500 NOK}', '{1,2,3}', 'a { b } c'])(
    'still sends prose containing braces: %s',
    async (prose) => {
      await expect(
        caller().task.sendOutreach({
          ...send,
          body: `Hi Ada, we can cover ${prose} for your travel.`,
        }),
      ).resolves.toMatchObject({ messageId: expect.any(String) })
      expect(h.addMessage).toHaveBeenCalledTimes(1)
    },
  )
  it('refuses a conversation that could not be loaded', async () => {
    h.conversation.mockResolvedValue(null)
    await expect(caller().task.sendOutreach(send)).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to load conversation',
    })
    expect(h.addMessage).not.toHaveBeenCalled()
  })
  it.each(['speakerOutreach', 'sponsorOutreach'])(
    'fully resolves the default %s body from the subject and tagged link',
    async (kind) => {
      task.kind = kind
      task.subject._type = kind === 'speakerOutreach' ? 'speaker' : 'sponsor'
      const data = await caller().task.get({ taskId: send.taskId })
      expect(data.taggedLink).toBe(
        'https://cloudnativebergen.dev/tickets?utm_source=outreach&utm_medium=social&utm_campaign=tickets&utm_content=invite-ada',
      )
      expect(data.outreachBody).toContain(data.taggedLink)
      expect(data.outreachBody).toContain('Hi Ada,')
      expect(data.outreachBody).toContain(conference.title)
      // Scan every brace-delimited token, including names unknown to the resolver.
      expect(data.outreachBody).not.toMatch(/\{[^{}]*\}/)
    },
  )
  it.each([
    { kind: 'speakerOutreach', recipientToken: '{name}' },
    { kind: 'sponsorOutreach', recipientToken: '{company}' },
  ])(
    'delivers only token-free default bodies for $kind, including when a single token is unresolved',
    async ({ kind, recipientToken }) => {
      task.kind = kind
      task.subject._type = kind === 'speakerOutreach' ? 'speaker' : 'sponsor'
      if (kind === 'sponsorOutreach') {
        h.conversation.mockResolvedValue({
          ...conversation,
          conversationType: 'sponsor',
          participants: [
            { partyType: 'sponsor', sponsorForConferenceId: 'sfc-1' },
          ],
        })
      }
      const openTask = structuredClone(task)
      const data = await caller().task.get({ taskId: send.taskId })
      const defaultBody = data.outreachBody!

      // Try each built-in token independently: another unresolved token must not
      // conceal an exemption in the send guard.
      for (const [value, token] of [
        [task.subject.name, recipientToken],
        [conference.title, '{event}'],
        [data.taggedLink!, '{url}'],
      ]) {
        task = structuredClone(openTask)
        await caller()
          .task.sendOutreach({
            ...send,
            body: defaultBody.replace(value, token),
          })
          .catch((error) => {
            expect(error).toMatchObject({
              code: 'BAD_REQUEST',
              cause: {
                issues: [
                  {
                    path: ['body'],
                    message:
                      'Replace all {placeholders} before sending outreach.',
                  },
                ],
              },
            })
          })
      }

      task = structuredClone(openTask)
      await caller().task.sendOutreach({ ...send, body: defaultBody })
      const deliveredBodies = h.addMessage.mock.calls.map(
        ([input]) => input.body,
      )
      expect(deliveredBodies).toContain(defaultBody)
      for (const body of deliveredBodies) expect(body).not.toMatch(/\{[^{}]*\}/)
    },
  )
})

describe('outreach creation and destination editing', () => {
  it.each([
    ['https://foreign.example/path', 'The path must start with "/".'],
    ['//foreign.example/path', 'The path must stay on this site.'],
    ['/tickets with spaces', 'The path must not contain whitespace.'],
  ])(
    'refuses malformed creation destination %s',
    async (targetPage, message) => {
      await expect(
        caller().task.create({ ...creation, targetPage }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        cause: { issues: [{ code: 'custom', path: ['targetPage'], message }] },
      })
      expect(h.createTask).not.toHaveBeenCalled()
    },
  )
  it.each([
    ['https://foreign.example/path', 'The path must start with "/".'],
    ['//foreign.example/path', 'The path must stay on this site.'],
    ['/tickets with spaces', 'The path must not contain whitespace.'],
  ])('refuses malformed update destination %s', async (targetPage, message) => {
    await expect(
      caller().task.update({ taskId: send.taskId, rev: send.rev, targetPage }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      cause: { issues: [{ code: 'custom', path: ['targetPage'], message }] },
    })
    expect(h.update).not.toHaveBeenCalled()
  })

  it('creates a manually addressed task with its destination and campaign owner', async () => {
    const result = await caller().task.create(creation)
    expect(result.taskId).toMatch(/^marketingTask\./)
    expect(h.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: result.taskId,
        kind: 'speakerOutreach',
        targetPage: '/tickets',
        subject: { _id: 'speaker-1', type: 'speaker' },
        assigneeId: 'owner-1',
        origin: 'manual',
        conferenceId: 'conf-A',
        status: 'open',
      }),
    )
  })
  it('creates sponsor outreach after resolving its edition relationship', async () => {
    await caller().task.create({
      ...creation,
      kind: 'sponsorOutreach',
      subjectId: 'sponsor-1',
    })
    expect(h.sponsor).toHaveBeenCalledWith('sponsor-1', 'conf-A')
    expect(h.createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'sponsorOutreach',
        subject: { _id: 'sponsor-1', type: 'sponsor' },
      }),
    )
  })
  it('refuses a foreign campaign before reading it', async () => {
    await expect(
      caller().task.create({ ...creation, campaignId: 'campaign-foreign' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'No marketingCampaign with that id for this request',
    })
    expect(h.campaign).not.toHaveBeenCalled()
    expect(h.createTask).not.toHaveBeenCalled()
  })
  it('refuses a missing campaign with its own error', async () => {
    h.campaign.mockResolvedValue(null)
    await expect(caller().task.create(creation)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Campaign not found',
    })
  })
  it('requires speaker standing on creation', async () => {
    h.standing.mockResolvedValue(false)
    await expect(caller().task.create(creation)).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'The speaker has no standing in this conference.',
    })
    expect(h.createTask).not.toHaveBeenCalled()
  })
  it('requires a sponsor relationship on creation', async () => {
    h.sponsor.mockResolvedValue(null)
    await expect(
      caller().task.create({ ...creation, kind: 'sponsorOutreach' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        'This sponsor has no sponsorForConference relationship in this conference.',
    })
    expect(h.createTask).not.toHaveBeenCalled()
  })
  it('updates the outreach destination with the loaded revision', async () => {
    await caller().task.update({
      taskId: send.taskId,
      rev: send.rev,
      targetPage: '/cfp',
    })
    expect(h.update).toHaveBeenCalledWith(
      send.taskId,
      send.rev,
      { targetPage: '/cfp' },
      [],
    )
  })
  it('refuses destination edits on other kinds', async () => {
    task.kind = 'checklist'
    await expect(
      caller().task.update({
        taskId: send.taskId,
        rev: send.rev,
        targetPage: '/cfp',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Only outreach destinations are edited here.',
    })
    expect(h.update).not.toHaveBeenCalled()
  })
  it.each(['sent', 'skipped'])(
    'refuses destination edits on %s outreach',
    async (state) => {
      if (state === 'sent') task.messageId = message._id
      else task.status = 'skipped'
      await expect(
        caller().task.update({
          taskId: send.taskId,
          rev: send.rev,
          targetPage: '/cfp',
        }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Only unsent, open outreach Tasks can change destination.',
      })
      expect(h.update).not.toHaveBeenCalled()
    },
  )
  it('keeps manual completion forbidden for outreach', async () => {
    await expect(
      caller().task.complete({ taskId: send.taskId }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    expect(h.update).not.toHaveBeenCalled()
  })
})
