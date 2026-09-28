/**
 * @vitest-environment node
 *
 * A signed sponsor's announcement tags the company on Bluesky (tagging spec
 * §3.3, #1154), through the same generation path as speakers. Bluesky is
 * faked at the FETCH boundary; handle resolution runs for real.
 */

const store = vi.hoisted(() => ({
  context: null as null | import('../generation-sanity').GenerationContext,
  commits: [] as import('../materialize').TaskRecords[],
  sponsorSources: [] as { _id: string; blueskyHandle: string | null }[],
  sponsorError: null as Error | null,
  sponsorOptedOut: false,
}))

vi.mock('../generation-sanity', () => ({
  publishedTaskKeys: vi.fn(async () => new Set<string>()),
  getGenerationContext: vi.fn(async () =>
    store.context ? structuredClone(store.context) : null,
  ),
  getSpeakerTagSources: vi.fn(async () => [
    {
      _id: 'spk-alice',
      links: ['https://bsky.app/profile/alice.dev'],
      socialTagOptOut: null,
    },
  ]),
  getSponsorTagSources: vi.fn(async () => {
    if (store.sponsorError) throw store.sponsorError
    return store.sponsorSources.map((s) => ({
      _id: s._id,
      links: null,
      socialTagOptOut: store.sponsorOptedOut,
      blueskyHandle: s.blueskyHandle,
    }))
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
import { runGeneration } from '../generation'
import { speakerSubject, sponsorSubject } from '../expansion'
import { getSpeakerTagSources } from '../generation-sanity'
import { BUILTIN_TEMPLATE } from '../template'
import { mentionDocuments } from './records'

const DID = 'did:plc:acmeacmeacmeacmeacmeacme'
const NOW = '2027-03-20T12:00:00.000Z'
const RESOLVE =
  'https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle'
const fetchMock = vi.fn<typeof fetch>()

function reset() {
  store.commits = []
  store.sponsorError = null
  store.sponsorOptedOut = false
  store.sponsorSources = [{ _id: 'sp-acme', blueskyHandle: 'acme.example' }]
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
      sponsorDeadlineDate: '2027-05-01',
      startDate: '2027-06-10',
      endDate: '2027-06-11',
    } as never,
    campaigns: [
      {
        _id: 'camp-sponsors',
        _rev: 'r1',
        key: 'sponsorAcquisition',
        triggers: [
          { event: 'sponsorSigned', taskRecipeKey: 'sponsorCardRender' },
        ],
        recipes: structuredClone(
          BUILTIN_TEMPLATE.campaigns.find(
            (c) => c.key === 'sponsorAcquisition',
          )!.recipes,
        ),
        generatedKeys: [],
      },
    ],
    tasks: [],
  }
}

const signed = () =>
  runGeneration(
    'conf-A',
    [
      {
        kind: 'trigger',
        event: 'sponsorSigned',
        subjects: [sponsorSubject({ _id: 'sp-acme', name: 'Acme AS' }, 'Gold')],
      },
    ],
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
afterEach(() => vi.unstubAllGlobals())

describe('the SHIPPED built-in sponsor card, for a sponsor with a Bluesky handle', () => {
  it('tags the company on Bluesky; the LinkedIn sibling and the alt text keep the plain name', async () => {
    expect((await signed()).created).toBeGreaterThan(0)
    expect(resolveCalls().map(([u]) => String(u))).toEqual([
      `${RESOLVE}?handle=acme.example`,
    ])
    expect(variant('bluesky').body).toContain(
      '🥇 Gold sponsor: @acme.example\n',
    )
    expect(variant('linkedin').body).toContain('Thank you to Acme AS for')
    expect(variant('linkedin').body).not.toContain('@')
    const alts = store.commits
      .flatMap((c) => c.tasks)
      .flatMap((t) => t.alt ?? [])
    expect(alts.length).toBeGreaterThan(0)
    expect(
      alts.every(
        (a) => a.startsWith('Sponsor card: Acme AS') && !a.includes('@'),
      ),
    ).toBe(true)
  })

  it('records the mention against the SPONSOR — stored as a weak sponsor reference, never a speaker one', async () => {
    await signed()
    const mentions = variant('bluesky').mentions!
    expect(mentions).toEqual([
      expect.objectContaining({
        handle: 'acme.example',
        did: DID,
        speakerId: 'sp-acme',
        sponsor: true,
        name: 'Acme AS',
        status: 'tagged',
      }),
    ])
    const [doc] = mentionDocuments(mentions)
    expect(doc.sponsor).toEqual({
      _type: 'reference',
      _ref: 'sp-acme',
      _weak: true,
    })
    expect(doc).not.toHaveProperty('speaker')
  })

  it('never reads speaker sources for a sponsor', async () => {
    await signed()
    expect(getSpeakerTagSources).not.toHaveBeenCalled()
  })

  it('a handle Bluesky does not know: the plain name, and an unresolved note', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        { error: 'InvalidRequest', message: 'Unable to resolve handle' },
        { status: 400 },
      ),
    )
    await signed()
    expect(variant('bluesky').body).toContain('🥇 Gold sponsor: Acme AS\n')
    expect(variant('bluesky').mentions).toEqual([
      expect.objectContaining({ handle: 'acme.example', status: 'unresolved' }),
    ])
  })

  it('a sponsor whose handle an opted-out speaker lists: the plain name, and Bluesky is NEVER asked', async () => {
    store.sponsorOptedOut = true
    await signed()
    expect(resolveCalls()).toHaveLength(0)
    expect(variant('bluesky').body).toContain('🥇 Gold sponsor: Acme AS\n')
    expect(variant('bluesky').mentions).toBeUndefined()
  })

  it('a sponsor with no handle: the plain name, and Bluesky is never asked', async () => {
    store.sponsorSources = [{ _id: 'sp-acme', blueskyHandle: null }]
    await signed()
    expect(resolveCalls()).toHaveLength(0)
    expect(variant('bluesky').body).toContain('🥇 Gold sponsor: Acme AS\n')
    expect(variant('bluesky').mentions).toBeUndefined()
  })
})

describe('a sponsor source that fails in a mixed batch', () => {
  it('leaves only the sponsor untagged: a speaker of the same batch is still tagged', async () => {
    store.sponsorError = new Error('Sanity is down')
    await runGeneration(
      'conf-A',
      [
        {
          kind: 'trigger',
          event: 'sponsorSigned',
          subjects: [
            sponsorSubject({ _id: 'sp-acme', name: 'Acme AS' }, 'Gold'),
            speakerSubject({ _id: 'spk-alice', name: 'Alice Liddell' }),
          ],
        },
      ],
      NOW,
    )
    const bodies = store.commits
      .flatMap((c) => c.variants)
      .filter((v) => v.platform === 'bluesky')
      .map((v) => v.body)
    expect(bodies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sponsor: Acme AS\n'),
        expect.stringContaining('sponsor: @alice.dev\n'),
      ]),
    )
  })
})
