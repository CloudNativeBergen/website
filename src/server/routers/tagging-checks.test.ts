/**
 * @vitest-environment node
 *
 * The Bluesky tag checks through the tRPC caller (#1151, tagging spec §4.3,
 * §4.4 Save and Approval): the save that rebuilds `mentions[]`, the three
 * approval paths (approving the Task, scheduling the variant, saving a
 * scheduled variant) and the tag button's `resolveTag`.
 *
 * What runs for REAL: the tenancy guard (against a stubbed tenant read), the
 * tagging reads (GROQ executed by groq-js against an in-memory dataset), the
 * checks, and the resolver (only `fetch` is stubbed, at Bluesky's endpoint).
 * Persistence of the Task and variant documents is mocked.
 */

vi.mock('@/lib/auth', () => ({
  getAuthSession: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/events/registry', () => ({}))
vi.mock('@/lib/marketing/ceiling-check', () => ({
  ceilingWarningsFor: vi.fn(async (): Promise<string[]> => []),
}))
vi.mock('next/cache', () => ({
  revalidateTag: vi.fn(),
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}))

const h = vi.hoisted(() => ({
  getConference: vi.fn(),
  read: vi.fn(),
  getTaskEditorData: vi.fn(),
  getTaskLinkInputs: vi.fn(),
  getTaskForVariant: vi.fn(),
  approveTask: vi.fn(),
  getSocialVariantEditorData: vi.fn(),
  getSocialPostVariant: vi.fn(),
  getSocialPostDefaultTime: vi.fn(),
  getSocialPostEditorInputs: vi.fn(),
  updateSocialVariantContent: vi.fn(),
  transition: vi.fn(),
}))

vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: h.getConference,
}))
vi.mock('@/lib/sanity/client', () => ({
  clientWrite: { patch: vi.fn(), fetch: vi.fn(), transaction: vi.fn() },
  clientReadUncached: { fetch: h.read },
}))
vi.mock('@/lib/marketing/sanity', () => ({
  getTaskEditorData: h.getTaskEditorData,
  getTaskLinkInputs: h.getTaskLinkInputs,
  getTaskForVariant: h.getTaskForVariant,
  approveTask: h.approveTask,
}))
vi.mock('@/lib/social/sanity', () => ({
  getConferenceDomainsForRule: vi.fn(async () => []),
  getSocialVariantEditorData: h.getSocialVariantEditorData,
  getSocialPostVariant: h.getSocialPostVariant,
  getSocialPostDefaultTime: h.getSocialPostDefaultTime,
  getSocialPostEditorInputs: h.getSocialPostEditorInputs,
  updateSocialVariantContent: h.updateSocialVariantContent,
  sanitySocialVariantStore: { transition: h.transition },
}))
vi.mock('@/lib/social/provider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/social/provider')>()),
  resolveSocialPublishAdapter: vi.fn(async () => null),
}))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'
import { initTRPC } from '@trpc/server'
import type { Context } from '@/server/trpc'
import type { StoredTaskEditorData } from '@/lib/marketing/types'
import type { SocialVariantEditorData } from '@/lib/social/types'
import { TagIssuesError } from '@/server/errors'
import { marketingRouter } from './marketing'
import { socialRouter } from './social'

const t = initTRPC.context<Context>().create()
const ORG_A = 'org-A'
const CONF_A = 'conf-A'
const CONF_B = 'conf-B'
const DID_ALICE = 'did:plc:alicealicealicealicealic'
const DID_OTHER = 'did:plc:someoneelsesomeoneelsesom'

const TENANTS: Record<string, { _type: string; conferenceId: string }> = {
  'task-ours': { _type: 'marketingTask', conferenceId: CONF_A },
  'task-theirs': { _type: 'marketingTask', conferenceId: CONF_B },
  'variant-ours': { _type: 'socialPostVariant', conferenceId: CONF_A },
  'variant-theirs': { _type: 'socialPostVariant', conferenceId: CONF_B },
}

function ctx(): Context {
  const speaker = { _id: 'sp-admin', name: 'Admin', organizerOrgIds: [ORG_A] }
  const user = { email: 'a@example.com', name: 'Admin', picture: '' }
  return {
    req: {
      headers: new Headers(),
      url: 'http://localhost:3000',
    } as unknown as Context['req'],
    session: {
      expires: new Date(Date.now() + 86_400_000).toISOString(),
      user,
      speaker,
    } as unknown as Context['session'],
    speaker: speaker as unknown as Context['speaker'],
    user,
    workosUser: null,
    ipAddress: '127.0.0.1',
  } as unknown as Context
}
const marketing = () => t.createCallerFactory(marketingRouter)(ctx())
const social = () => t.createCallerFactory(socialRouter)(ctx())

const ref = (id: string) => ({ _type: 'reference', _ref: id })
const ALICE_TAG = {
  _key: 'spk-alice',
  _type: 'socialPostMention',
  handle: 'alice.dev',
  did: DID_ALICE,
  speaker: { ...ref('spk-alice'), _weak: true },
  name: 'Alice Anderson',
  status: 'tagged',
}

let dataset: Record<string, unknown>[] = []
function seed(mentions: unknown[] = [], olgaOptedOut = true) {
  dataset = [
    {
      _id: 'spk-alice',
      _type: 'speaker',
      name: 'Alice Anderson',
      links: ['https://bsky.app/profile/alice.dev'],
    },
    {
      _id: 'spk-olga',
      _type: 'speaker',
      name: 'Olga',
      links: ['https://bsky.app/profile/olga.dev'],
      socialTagOptOut: olgaOptedOut,
    },
    {
      _id: 'spk-mallory',
      _type: 'speaker',
      name: 'Mallory',
      links: ['https://bsky.app/profile/mallory.dev'],
    },
    {
      _id: 'talk-A',
      _type: 'talk',
      conference: ref(CONF_A),
      speakers: [ref('spk-alice'), ref('spk-olga')],
    },
    {
      _id: 'talk-B',
      _type: 'talk',
      conference: ref(CONF_B),
      speakers: [ref('spk-mallory')],
    },
    {
      _id: 'variant-ours',
      _type: 'socialPostVariant',
      conference: ref(CONF_A),
      mentions,
    },
    {
      _id: 'task-ours',
      _type: 'marketingTask',
      conference: ref(CONF_A),
      kind: 'publishing',
      channel: 'bluesky',
      subject: ref('talk-A'),
    },
  ]
}

/** Every non-guard read, by the GROQ it ran. */
const tagReads = () =>
  h.read.mock.calls
    .filter(([, params]) => !(params as { id?: string })?.id)
    .map(([q]) => q as string)

/** What Bluesky answers, by handle; absent = the network fails. */
let bluesky: Record<string, string | 'not-found'> = {}
const blueskyFetch = vi.fn(async (url: string | URL) => {
  const handle = new URL(String(url)).searchParams.get('handle') ?? ''
  const answer = bluesky[handle]
  if (answer === undefined) throw new TypeError('fetch failed')
  if (answer === 'not-found')
    return new Response(
      JSON.stringify({
        error: 'InvalidRequest',
        message: 'Unable to resolve handle',
      }),
      { status: 400 },
    )
  return new Response(JSON.stringify({ did: answer }), { status: 200 })
})
/** The conference's own Bluesky link, as the live by-id read finds it. */
function ownAccount(link: string) {
  dataset.push({ _id: CONF_A, _type: 'conference', socialLinks: [link] })
}
const askedBluesky = () =>
  blueskyFetch.mock.calls.map(([url]) =>
    new URL(String(url)).searchParams.get('handle'),
  )

function variantData(
  overrides: Partial<SocialVariantEditorData['variant']> = {},
): SocialVariantEditorData {
  return {
    variant: {
      _id: 'variant-ours',
      _rev: 'rev-v',
      postId: 'post-ours',
      conferenceId: CONF_A,
      orgId: ORG_A,
      platform: 'bluesky',
      body: 'Catch @alice.dev at 10',
      status: 'draft',
      scheduledAt: '2027-01-10T07:00:00.000Z',
      usesCustomTime: false,
      claimedAt: null,
      submission: null,
      shortCode: null,
      link: null,
      attachments: [],
      publishResult: null,
      attempts: [],
      attemptCount: 0,
      ...overrides,
    },
    post: { attachments: [], defaultScheduledAt: '2027-01-10T07:00:00.000Z' },
    conferenceDomains: [],
  }
}

function stored(): StoredTaskEditorData {
  return {
    task: {
      _id: 'task-ours',
      campaignId: 'camp-A',
      key: 'talk:bluesky',
      title: 'Talk teaser',
      kind: 'publishing',
      channel: 'bluesky',
      date: '2027-01-10T07:00:00.000Z',
      provisional: false,
      milestone: 'CFP_OPEN',
      status: 'draft',
      complete: false,
      prerequisiteIds: [],
      variantId: 'variant-ours',
      assigneeId: 'sp-1',
      approvedAt: null,
      _rev: 'rev-task',
      approvedByName: null,
      assigneeName: 'Ada',
      targetPage: '/program',
      shortCode: null,
      instructions: null,
      verbatimCopy: false,
      externalUrl: null,
      skipReason: null,
      subject: null,
      assetUrl: null,
      messageId: null,
      origin: 'template',
    },
    campaign: { _id: 'camp-A', key: 'talks', title: 'Talks' },
    planOwnerId: 'sp-1',
    siblings: [],
    variant: null,
    tagByHand: [],
    tagPeople: [],
    tagMentions: [],
  }
}

function serveVariant(v: SocialVariantEditorData) {
  lastServed = v
  h.getSocialVariantEditorData.mockResolvedValue(v)
  h.getSocialPostVariant.mockResolvedValue(v.variant)
}

beforeEach(() => {
  vi.clearAllMocks()
  seed([ALICE_TAG])
  bluesky = { 'alice.dev': DID_ALICE }
  vi.stubGlobal('fetch', blueskyFetch)
  h.getConference.mockResolvedValue({
    conference: {
      _id: CONF_A,
      organization: { _ref: ORG_A },
      title: 'CNB',
      domains: ['cloudnativebergen.dev'],
    },
    domain: 'cloudnativebergen.dev',
    error: null,
  })
  h.read.mockImplementation(
    async (query: string, params: Record<string, unknown> = {}) => {
      const id = params.id as string | undefined
      if (id) {
        const tenant = TENANTS[id]
        return tenant
          ? {
              _type: tenant._type,
              orgId: null,
              conferenceId: tenant.conferenceId,
              conferenceOrgId: tenant.conferenceId === CONF_A ? ORG_A : 'org-B',
              memberOrgIds: [],
            }
          : null
      }
      return await (await evaluate(parse(query), { dataset, params })).get()
    },
  )
  h.getTaskEditorData.mockResolvedValue(stored())
  serveVariant(variantData())
  h.getSocialPostDefaultTime.mockResolvedValue('2027-01-10T07:00:00.000Z')
  h.getSocialPostEditorInputs.mockResolvedValue({
    attachments: [],
    defaultScheduledAt: '2027-01-10T07:00:00.000Z',
    rev: 'rev-post',
  })
  h.approveTask.mockResolvedValue(true)
  h.transition.mockResolvedValue(true)
  h.updateSocialVariantContent.mockResolvedValue(true)
  h.getTaskForVariant.mockResolvedValue(null)
  h.getTaskLinkInputs.mockResolvedValue(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The structured issues a refusal carries, as `[code, mentionKey]`. */
async function refusal(p: Promise<unknown>): Promise<[string, unknown][]> {
  const error = await p.then(
    () => {
      throw new Error('expected a refusal')
    },
    (e: unknown) => e,
  )
  expect(error).toMatchObject({ code: 'BAD_REQUEST' })
  const cause = (error as { cause?: unknown }).cause
  expect(cause).toBeInstanceOf(TagIssuesError)
  return (cause as TagIssuesError).tagIssues.map((i) => [i.code, i.mentionKey])
}

/** What the mocked store serves right now. */
let lastServed: SocialVariantEditorData

const save = (body: string) =>
  social().updateVariant({
    variantId: 'variant-ours',
    rev: 'rev-v',
    body,
    link: null,
    attachments: [],
    timing: { mode: 'default' },
  })

// ---------------------------------------------------------------------------
// Save (§4.3, §4.4 Save)
// ---------------------------------------------------------------------------

describe('social.updateVariant on a Bluesky body', () => {
  it('records a typed speaker handle with the DID Bluesky gave', async () => {
    seed([])
    await save('Catch @Alice.dev at 10')
    expect(askedBluesky()).toEqual(['alice.dev'])
    expect(h.updateSocialVariantContent.mock.calls[0][1].mentions).toEqual([
      {
        _key: 'spk-alice',
        _type: 'socialPostMention',
        handle: 'alice.dev',
        did: DID_ALICE,
        speaker: { _type: 'reference', _ref: 'spk-alice', _weak: true },
        name: 'Alice Anderson',
        status: 'tagged',
      },
    ])
  })

  it('keeps the DID already checked, without asking Bluesky again', async () => {
    await save('Still @alice.dev')
    expect(askedBluesky()).toEqual([])
    expect(h.updateSocialVariantContent.mock.calls[0][1].mentions).toEqual([
      ALICE_TAG,
    ])
  })

  it('refuses an opted-out speaker typed by hand, and never asks Bluesky', async () => {
    expect(await refusal(save('With @olga.dev'))).toEqual([
      ['opted-out', 'spk-olga'],
    ])
    expect(askedBluesky()).toEqual([])
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('a stranger’s handle is not recorded and not refused', async () => {
    await save('Thanks @kubernetes.io')
    expect(askedBluesky()).toEqual([])
    // An empty list: the writer REMOVES the old record.
    expect(h.updateSocialVariantContent.mock.calls[0][1].mentions).toEqual([])
  })

  it('another conference’s speaker is a stranger here', async () => {
    await save('Hi @mallory.dev')
    expect(h.updateSocialVariantContent.mock.calls[0][1].mentions).toEqual([])
  })

  it('refuses a body that fits only in its tagged form', async () => {
    seed([{ ...ALICE_TAG, name: 'A'.repeat(200) }])
    dataset[0] = { ...dataset[0], name: 'A'.repeat(200) }
    expect(await refusal(save(`${'x'.repeat(280)} @alice.dev`))).toEqual([
      ['plain-too-long', null],
    ])
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('reads no roster when the body has no tag at all', async () => {
    seed([])
    await save('No tags here')
    expect(tagReads().some((q) => q.includes('"talk"'))).toBe(false)
  })

  it('refuses a speaker handle that is our own account (spec §4.1)', async () => {
    seed([])
    ownAccount('https://bsky.app/profile/alice.dev')
    expect(await refusal(save('Catch @alice.dev at 10'))).toEqual([
      ['own-account', 'spk-alice'],
    ])
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('refuses a speaker handle that resolves to our account named by DID', async () => {
    seed([])
    ownAccount(`https://bsky.app/profile/${DID_ALICE}`)
    expect(await refusal(save('Catch @alice.dev at 10'))).toEqual([
      ['own-account', 'spk-alice'],
    ])
    expect(h.updateSocialVariantContent).not.toHaveBeenCalled()
  })

  it('a LinkedIn body is never matched, read or rewritten', async () => {
    serveVariant(variantData({ platform: 'linkedin', body: 'x' }))
    await save('With @olga.dev')
    expect(tagReads()).toEqual([])
    expect(h.updateSocialVariantContent.mock.calls[0][1]).not.toHaveProperty(
      'mentions',
    )
  })

  it('guard before fetch: another conference’s variant reads no tags', async () => {
    await expect(
      social().updateVariant({
        variantId: 'variant-theirs',
        rev: 'rev-v',
        body: '@olga.dev',
        link: null,
        attachments: [],
        timing: { mode: 'default' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(tagReads()).toEqual([])
    expect(askedBluesky()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Approval (§4.4) on all three paths
// ---------------------------------------------------------------------------

const PATHS: {
  name: string
  run: () => Promise<{ tagWarnings?: string[] }>
  wrote: () => boolean
  prepare?: () => void
}[] = [
  {
    name: 'approving the Task',
    run: () => marketing().task.approve({ taskId: 'task-ours' }),
    wrote: () => h.approveTask.mock.calls.length > 0,
  },
  {
    name: 'scheduling the variant',
    run: () => social().scheduleVariant({ variantId: 'variant-ours' }),
    wrote: () => h.transition.mock.calls.length > 0,
  },
  {
    name: 'saving a scheduled variant',
    prepare: () => serveVariant(variantData({ status: 'scheduled' })),
    // The stored body, saved unchanged: what the check sees on every path.
    run: () => save(lastServed.variant.body),
    wrote: () => h.updateSocialVariantContent.mock.calls.length > 0,
  },
]

describe.each(PATHS)('approval check: $name', ({ run, wrote, prepare }) => {
  beforeEach(() => prepare?.())

  it('passes a tag that still resolves to its recorded DID', async () => {
    const result = await run()
    expect(wrote()).toBe(true)
    expect(result.tagWarnings).toEqual([])
    expect(askedBluesky()).toEqual(['alice.dev'])
  })

  it('refuses when the handle now resolves to another DID', async () => {
    bluesky['alice.dev'] = DID_OTHER
    expect(await refusal(run())).toEqual([['did-changed', 'spk-alice']])
    expect(wrote()).toBe(false)
  })

  it('refuses when the speaker opted out since, without asking Bluesky', async () => {
    dataset[0] = { ...dataset[0], socialTagOptOut: true }
    expect(await refusal(run())).toEqual([['opted-out', 'spk-alice']])
    expect(askedBluesky()).toEqual([])
    expect(wrote()).toBe(false)
  })

  it('refuses a handle Bluesky no longer knows', async () => {
    bluesky['alice.dev'] = 'not-found'
    expect(await refusal(run())).toEqual([['not-found', 'spk-alice']])
    expect(wrote()).toBe(false)
  })

  it('refuses a body that fits only in its tagged form (both forms, §4.4)', async () => {
    // Straight from generation: never saved, the tagged form fits, the
    // plain one does not.
    const long = 'A'.repeat(200)
    seed([{ ...ALICE_TAG, name: long }])
    dataset[0] = { ...dataset[0], name: long }
    serveVariant(
      variantData({
        body: `${'x'.repeat(280)} @alice.dev`,
        status: lastServed.variant.status,
      }),
    )
    expect(await refusal(run())).toEqual([['plain-too-long', null]])
    expect(wrote()).toBe(false)
  })

  it('does NOT refuse when Bluesky is unreachable: it warns', async () => {
    delete bluesky['alice.dev']
    const result = await run()
    expect(wrote()).toBe(true)
    expect(result.tagWarnings).toEqual([
      expect.stringContaining('could not be reached'),
    ])
  })
})

describe('approval check scope', () => {
  it('guard before fetch: scheduling another conference’s variant reads no tags', async () => {
    await expect(
      social().scheduleVariant({ variantId: 'variant-theirs' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(tagReads()).toEqual([])
    expect(askedBluesky()).toEqual([])
  })

  it('refuses to schedule a speaker handle no save ever recorded', async () => {
    seed([])
    await expect(
      refusal(social().scheduleVariant({ variantId: 'variant-ours' })),
    ).resolves.toEqual([['unchecked', 'spk-alice']])
    expect(h.transition).not.toHaveBeenCalled()
  })

  it('a LinkedIn variant is approved without a tag read', async () => {
    serveVariant(variantData({ platform: 'linkedin', body: 'plain' }))
    await social().scheduleVariant({ variantId: 'variant-ours' })
    expect(tagReads()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The tag button's resolve (§2)
// ---------------------------------------------------------------------------

describe('marketing.task.resolveTag', () => {
  it('resolves the handle of a person the Task is about', async () => {
    expect(
      await marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-alice',
      }),
    ).toEqual({ handle: 'alice.dev', result: 'resolved' })
  })

  it('reports a handle Bluesky does not know', async () => {
    bluesky['alice.dev'] = 'not-found'
    expect(
      await marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-alice',
      }),
    ).toEqual({ handle: 'alice.dev', result: 'not-found' })
  })

  it('refuses an opted-out speaker without asking Bluesky', async () => {
    await expect(
      marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-olga',
      }),
    ).rejects.toMatchObject({ message: /asked not to be tagged/ })
    expect(askedBluesky()).toEqual([])
  })

  it('refuses a speaker whose link is our own account', async () => {
    ownAccount('https://bsky.app/profile/alice.dev')
    await expect(
      marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-alice',
      }),
    ).rejects.toMatchObject({ message: /conference's own account/ })
    expect(askedBluesky()).toEqual([])
  })

  it('refuses when the handle resolves to our own account named by DID', async () => {
    ownAccount(`https://bsky.app/profile/${DID_ALICE}`)
    await expect(
      marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-alice',
      }),
    ).rejects.toMatchObject({ message: /own account/ })
  })

  it('the editor payload shows no Tag button for a speaker who links our account', async () => {
    ownAccount('https://bsky.app/profile/alice.dev')
    h.getTaskEditorData.mockResolvedValue({
      ...stored(),
      tagPeople: [
        {
          speakerId: 'spk-alice',
          name: 'Alice Anderson',
          handle: 'alice.dev',
          optedOut: false,
        },
      ],
    })
    const data = await marketing().task.get({ taskId: 'task-ours' })
    expect(data.tagPeople).toEqual([
      {
        speakerId: 'spk-alice',
        name: 'Alice Anderson',
        handle: null,
        optedOut: false,
        ownAccount: true,
      },
    ])
  })

  it('refuses someone the Task is not about', async () => {
    await expect(
      marketing().task.resolveTag({
        taskId: 'task-ours',
        speakerId: 'spk-mallory',
      }),
    ).rejects.toMatchObject({ message: /Only the people this Task is about/ })
    expect(askedBluesky()).toEqual([])
  })

  it('guard before fetch: another conference’s Task reads nothing', async () => {
    await expect(
      marketing().task.resolveTag({
        taskId: 'task-theirs',
        speakerId: 'spk-alice',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(tagReads()).toEqual([])
    expect(askedBluesky()).toEqual([])
  })
})
