/**
 * @vitest-environment node
 *
 * Generation resolves the handles a tagging Bluesky body needs (tagging spec
 * §4.4, Generation) — against Bluesky's public endpoint, mocked here at the
 * FETCH boundary — and a resolve that fails, hangs or never gets its data
 * can never fail generation or hold up the Trigger that asked for it.
 */

const store = vi.hoisted(() => ({
  context: null as null | import('../generation-sanity').GenerationContext,
  commits: [] as import('../materialize').TaskRecords[],
  sources: [] as {
    _id: string
    links: string[] | null
    socialTagOptOut: boolean | null
  }[],
  sourcesError: null as Error | null,
}))

vi.mock('../generation-sanity', () => ({
  publishedTaskKeys: vi.fn(async () => new Set<string>()),
  getGenerationContext: vi.fn(async () =>
    store.context ? structuredClone(store.context) : null,
  ),
  getSpeakerTagSources: vi.fn(async () => {
    if (store.sourcesError) throw store.sourcesError
    return structuredClone(store.sources)
  }),
  commitGeneratedTasks: vi.fn(
    async (input: { records: import('../materialize').TaskRecords }) => {
      const campaign = store.context!.campaigns[0]
      campaign._rev = `${campaign._rev}+`
      campaign.generatedKeys.push(...input.records.tasks.map((t) => t.key))
      store.commits.push(input.records)
      return true
    },
  ),
}))
vi.mock('../ceiling-check', () => ({
  ceilingWarningsFor: vi.fn(async () => []),
}))
vi.mock('../short-code-sanity', () => ({
  shortCodeMinterFor: vi.fn(async () => {
    let n = 0
    return () => `code${++n}`
  }),
}))

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Action, Status } from '@/lib/proposal/types'
import { handleMarketingSpeakerConfirmed } from '@/lib/events/handlers/marketingTriggers'
import type { ProposalStatusChangeEvent } from '@/lib/events/types'
import { runGeneration } from '../generation'
import { speakerSubject } from '../expansion'
import { getSpeakerTagSources } from '../generation-sanity'
import { BUILTIN_TEMPLATE } from '../template'
import { RESOLVE_TIMEOUT_MS } from '.'

const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa'
const NOW = '2027-03-20T12:00:00.000Z'
const RESOLVE =
  'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'

const fetchMock = vi.fn<typeof fetch>()

function reset({ tagSubject = true } = {}) {
  store.commits = []
  store.sourcesError = null
  store.sources = [
    {
      _id: 'spk-alice',
      links: ['https://bsky.app/profile/alice.dev'],
      socialTagOptOut: null,
    },
  ]
  const recipes = structuredClone(
    BUILTIN_TEMPLATE.campaigns.find((c) => c.key === 'speakers')!.recipes,
  ).map((r) =>
    r.channel === 'bluesky' && r.beat === 'speakerCard' && tagSubject
      ? { ...r, tagSubject: true }
      : r,
  )
  store.context = {
    plan: { _id: 'plan', ownerId: 'owner' },
    conference: {
      _id: 'conf-A',
      title: 'Cloud Native Bergen 2027',
      city: 'Bergen',
      venueName: 'Grieghallen',
      domains: ['cloudnativebergen.dev'],
      socialLinks: ['https://bsky.app/profile/cloudnativebergen.dev'],
      cfpStartDate: '2027-01-10',
      cfpEndDate: '2027-03-01',
      cfpNotifyDate: '2027-04-01',
      programDate: '2027-04-20',
      startDate: '2027-06-10',
      endDate: '2027-06-11',
    } as never,
    campaigns: [
      {
        _id: 'camp-speakers',
        _rev: 'r1',
        key: 'speakers',
        triggers: [
          { event: 'speakerConfirmed', taskRecipeKey: 'speakerCardRender' },
        ],
        recipes,
        generatedKeys: [],
      },
    ],
    tasks: [],
  }
}

const alice = speakerSubject(
  { _id: 'spk-alice', name: 'Alice Liddell', title: 'SRE' },
  'Pods',
)
const confirm = () =>
  runGeneration(
    'conf-A',
    [{ kind: 'trigger', event: 'speakerConfirmed', subjects: [alice] }],
    NOW,
  )
const variant = (platform: 'bluesky' | 'linkedin') =>
  store.commits.flatMap((c) => c.variants).find((v) => v.platform === platform)!
const resolveCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url).startsWith(RESOLVE))

beforeEach(() => {
  reset()
  vi.clearAllMocks()
  fetchMock.mockImplementation(async () =>
    Response.json({ did: DID }, { status: 200 }),
  )
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('generation with a Bluesky tagSubject recipe', () => {
  it('a resolvable handle: the Bluesky body tags, LinkedIn and alt keep the name, the DID is recorded', async () => {
    expect((await confirm()).created).toBe(3)
    expect(String(resolveCalls()[0][0])).toBe(`${RESOLVE}?handle=alice.dev`)
    expect(variant('bluesky').body).toContain('@alice.dev (SRE) is speaking')
    expect(variant('bluesky').mentions).toEqual([
      expect.objectContaining({
        handle: 'alice.dev',
        did: DID,
        status: 'tagged',
      }),
    ])
    expect(variant('linkedin').body).toContain('Alice Liddell is bringing')
    const alts = store.commits
      .flatMap((c) => c.tasks)
      .flatMap((t) => t.alt ?? [])
    expect(alts.length).toBeGreaterThan(0)
    expect(
      alts.every((a) => a.includes('Alice Liddell') && !a.includes('@')),
    ).toBe(true)
  })

  it('an opted-out speaker: plain name, no entry — and Bluesky is never asked', async () => {
    store.sources[0].socialTagOptOut = true
    await confirm()
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
    expect(variant('bluesky').mentions).toBeUndefined()
    expect(resolveCalls()).toHaveLength(0)
  })

  it('our own account is never tagged, and never asked about', async () => {
    store.sources[0].links = ['https://bsky.app/profile/CloudNativeBergen.dev']
    await confirm()
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
    expect(variant('bluesky').mentions).toBeUndefined()
    expect(resolveCalls()).toHaveLength(0)
  })

  it('a handle nobody holds: plain name, an unresolved entry', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        { status: 400 },
      ),
    )
    await confirm()
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
    expect(variant('bluesky').mentions).toEqual([
      expect.objectContaining({ handle: 'alice.dev', status: 'unresolved' }),
    ])
  })

  it('a resolve that hangs is cut off at the timeout: the Tasks land with the plain name', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    const run = confirm()
    await vi.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS)
    expect((await run).created).toBe(3)
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
    expect(variant('bluesky').mentions).toEqual([
      expect.objectContaining({ status: 'unresolved' }),
    ])
  })

  it('a failed read of the speakers’ links: the Tasks still land, untagged', async () => {
    store.sourcesError = new Error('Sanity is down')
    expect((await confirm()).created).toBe(3)
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
    expect(variant('bluesky').mentions).toBeUndefined()
  })

  it('without tagSubject nobody is looked up at all', async () => {
    reset({ tagSubject: false })
    await confirm()
    expect(getSpeakerTagSources).not.toHaveBeenCalled()
    expect(resolveCalls()).toHaveLength(0)
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
  })

  it('a subject whose beat is already generated is not looked up again', async () => {
    await confirm()
    vi.clearAllMocks()
    expect((await confirm()).created).toBe(0)
    expect(getSpeakerTagSources).not.toHaveBeenCalled()
    expect(resolveCalls()).toHaveLength(0)
  })
})

describe('the speakerConfirmed Trigger handler', () => {
  const event = (): ProposalStatusChangeEvent =>
    ({
      eventType: 'proposal.status.changed',
      timestamp: new Date(),
      proposal: { _id: 'talk-1', title: 'Pods' },
      previousStatus: Status.accepted,
      newStatus: Status.confirmed,
      action: Action.confirm,
      conference: { _id: 'conf-A' },
      speakers: [{ _id: 'spk-alice', name: 'Alice Liddell', title: 'SRE' }],
      metadata: {
        triggeredBy: { speakerId: 'spk-alice', isOrganizer: false },
        domain: 'x',
      },
    }) as unknown as ProposalStatusChangeEvent

  it('a resolve that throws: the handler settles, does not throw, and the Tasks land', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(
      handleMarketingSpeakerConfirmed(event()),
    ).resolves.toBeUndefined()
    expect(variant('bluesky').body).toContain('🎙️ Alice Liddell (SRE)')
  })

  it('a resolve that never answers holds the handler no longer than the timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))
    let settled = false
    const handled = handleMarketingSpeakerConfirmed(event()).then(
      () => (settled = true),
    )
    await vi.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS)
    await handled
    expect(settled).toBe(true)
    expect(store.commits).toHaveLength(1)
  })
})
