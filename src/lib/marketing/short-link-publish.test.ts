/**
 * @vitest-environment node
 *
 * #1143 end to end, on ONE executed-GROQ dataset (groq-js, no hand-rolled
 * query stand-ins): a Task's variant is published through the real publish
 * engine, what it POSTED is the `/go/<code>` short link, and the document it
 * leaves behind still feeds the three readers that parse the stored long link
 * — the regeneration dedupe, the orphaned-publication ledger, and the
 * redirect a click on the posted link goes through. Each is asserted on the
 * VALUE it returns.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { evaluate, parse } from 'groq-js'

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}))
const h = vi.hoisted(() => ({ dataset: [] as Record<string, unknown>[] }))
vi.mock('@/lib/sanity/client', () => ({
  clientReadUncached: {
    fetch: async (query: string, params: Record<string, unknown>) =>
      (
        await evaluate(
          // groq-js only slices by constants; Sanity binds `$cap` (the
          // route's code-index read) the same way this inlines it.
          parse(
            query.replace(
              /\[0\.\.\.\$(\w+)\]/g,
              (_, p: string) => `[0...${Number(params[p])}]`,
            ),
          ),
          { dataset: h.dataset, params },
        )
      ).get(),
  },
}))
vi.mock('@/lib/conference/sanity', () => ({
  getConferenceForCurrentDomain: async () => ({
    conference: { _id: CONF, title: 'CNB', domains: [DOMAIN] },
    domain: DOMAIN,
    error: null,
    status: 'resolved',
  }),
}))

import { runPublishTick } from '@/lib/social/publish-engine'
import type {
  PublishInput,
  SocialPublishAdapter,
} from '@/lib/social/provider/types'
import { PLATFORM_CONSTRAINTS } from '@/lib/social/provider/constraints'
import {
  MemoryVariantStore,
  makeVariant,
} from '@/lib/social/__tests__/memory-store'
import { GET } from '@/app/go/[code]/route'
import { publishedTaskKeys } from './generation-sanity'
import { readSnapshotPlan } from './snapshots/sanity'
import { taggedUrl } from './link'
import { publishedPair } from './recipes'

const CONF = 'conf-A'
const DOMAIN = 'cloudnativebergen.dev'
const CAMPAIGN = 'cfp'
const TASK_KEY = 'speakerCard:sp-1:bluesky'
const CODE = 'abc234'
const LONG = taggedUrl({
  baseUrl: `https://${DOMAIN}`,
  targetPage: '/program',
  channel: 'bluesky',
  campaignKey: CAMPAIGN,
  taskKey: TASK_KEY,
})
const NOW = new Date('2026-09-13T10:00:00.000Z')

/** Publish ONE Task variant through the real engine; return what was posted and the stored doc. */
async function publishTaskVariant() {
  const store = new MemoryVariantStore(
    [
      makeVariant({
        _id: 'variant-task',
        conferenceId: CONF,
        link: LONG,
        shortCode: CODE,
      }),
    ],
    {},
    { [CONF]: [DOMAIN] },
  )
  const posted: PublishInput[] = []
  const adapter: SocialPublishAdapter = {
    platform: 'bluesky',
    constraints: PLATFORM_CONSTRAINTS.bluesky,
    validate: () => [],
    publish: async (input) => {
      posted.push(input)
      return { ok: true, externalId: 'at://did:plc:x/app.bsky.feed.post/1' }
    },
  }
  await runPublishTick({ store, resolveAdapter: async () => adapter, now: NOW })
  return { posted, doc: store.get('variant-task') }
}

/** The stored variant as a Sanity document. */
function asSanityDocument(
  doc: Awaited<ReturnType<typeof publishTaskVariant>>['doc'],
) {
  return {
    _id: doc._id,
    _type: 'socialPostVariant',
    conference: { _ref: CONF },
    platform: doc.platform,
    status: doc.status,
    link: doc.link,
    shortCode: doc.shortCode,
    publishResult: doc.publishResult,
    attempts: doc.attempts,
  }
}

beforeEach(() => {
  h.dataset = []
})

describe('a published Task post carries the short link (#1143)', () => {
  it('posts /go/<code> and leaves the stored link LONG', async () => {
    const { posted, doc } = await publishTaskVariant()
    expect(posted.map((p) => p.link)).toEqual([`https://${DOMAIN}/go/${CODE}`])
    expect(posted[0].linkDestination).toBe(LONG)
    expect(doc.status).toBe('published')
    expect(doc.link).toBe(LONG)
  })

  it('the regeneration dedupe still recovers the Campaign and Task keys from the published variant', async () => {
    const { doc } = await publishTaskVariant()
    h.dataset = [asSanityDocument(doc)]
    expect([...(await publishedTaskKeys(CONF))]).toEqual([
      publishedPair(CAMPAIGN, TASK_KEY),
    ])
  })

  it('the Snapshot ledger still attributes the orphaned publication to its Campaign and Task', async () => {
    const { doc } = await publishTaskVariant()
    // The plan was deleted and reseeded: no Task references the variant.
    h.dataset = [
      asSanityDocument(doc),
      {
        _id: 'plan-1',
        _type: 'marketingPlan',
        conference: { _ref: CONF },
      },
      {
        _id: 'camp-1',
        _type: 'marketingCampaign',
        conference: { _ref: CONF },
        plan: { _ref: 'plan-1' },
        key: CAMPAIGN,
        title: 'CFP',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      },
    ]
    const plan = await readSnapshotPlan(CONF)
    expect(plan?.tasks).toEqual([
      expect.objectContaining({
        _id: 'variant-task',
        campaignId: 'camp-1',
        key: TASK_KEY,
        orphanedPublication: true,
        publishedAt: NOW.toISOString(),
      }),
    ])
  })

  it('a click on the posted link lands on the page with the Campaign and Task UTMs PostHog reads', async () => {
    const { posted, doc } = await publishTaskVariant()
    h.dataset = [asSanityDocument(doc)]
    const clicked = posted[0].link!
    const response = await GET(new Request(clicked) as never, {
      params: Promise.resolve({
        code: new URL(clicked).pathname.split('/')[2],
      }),
    })
    expect(response.status).toBe(302)
    const landing = new URL(response.headers.get('location')!)
    expect(landing.host).toBe(DOMAIN)
    expect(landing.pathname).toBe('/program')
    expect(Object.fromEntries(landing.searchParams)).toEqual({
      utm_source: 'bluesky',
      utm_medium: 'social',
      utm_campaign: CAMPAIGN,
      utm_content: TASK_KEY,
    })
  })
})
