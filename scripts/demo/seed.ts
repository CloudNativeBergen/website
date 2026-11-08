#!/usr/bin/env tsx
/**
 * `pnpm demo:seed [--dry-run] [--host <host>]` (#2150): seeds the Sanity
 * side of the demo tenant from the deterministic fixtures, then hands the
 * same fixtures to website-001's `seedDemoD1` for the D1 side.
 *
 * Order matters and is tested:
 *   1. Ask the gateway (operator lane, tenant = --host) for the org's kind.
 *      Anything but `demo` exits before a Sanity client exists.
 *   2. Build every document; refuse if any `_id` is outside DEMO_PREFIX.
 *   3. --dry-run: print counts per type and stop. No write client.
 *   4. createOrReplace in transactions. Deterministic ids, so a re-run on
 *      the same UTC day sends identical mutations.
 *
 * Env: KONF_OPERATOR_TOKEN (identity JWT of a platform operator, origin
 * claim = KONF_OPERATOR_ORIGIN, default https://my.konf.app), KONF_API_URL
 * (default production gateway), NEXT_PUBLIC_SANITY_PROJECT_ID,
 * NEXT_PUBLIC_SANITY_DATASET, SANITY_API_TOKEN_WRITE.
 */
import { generateDemoFixtures } from './fixtures/generate'
import type { DemoFixtures } from './fixtures/types'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import { ORGANIZERS_GROUP } from '@/lib/messaging/types'

/** Every document this script writes has this id prefix; nothing else is touched. */
export const DEMO_PREFIX = 'kkdemo.seed.'
export const DEMO_SEED = 2150
const DEFAULT_HOST = 'kontainerkonf.konf.run'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** Operator-lane GraphQL client; same shape as seedDemoD1's DemoGraphQLClient. */
export interface GraphQLClient {
  request<T>(
    host: string | null,
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T>
}

export interface SanityWriter {
  transaction(): {
    createOrReplace(doc: Doc): unknown
    createIfNotExists(doc: Doc): unknown
    commit(): Promise<unknown>
  }
}

export interface Deps {
  api: GraphQLClient
  createSanityClient: () => Promise<SanityWriter>
  /** website-001's step; undefined until #2164 lands. */
  loadSeedDemoD1: () => Promise<
    | ((
        f: DemoFixtures,
        c: GraphQLClient,
        o: { host: string; dryRun: boolean },
      ) => Promise<unknown>)
    | undefined
  >
  log: (line: string) => void
}

export class NotDemoOrgError extends Error {}

// ------------------------------------------------------------ documents

const id = (type: string, key: string) => `${DEMO_PREFIX}${type}.${key}`
const ref = (type: string, key: string) => ({
  _type: 'reference',
  _ref: id(type, key),
})
const keyed = <T extends Record<string, unknown>>(items: T[], prefix: string) =>
  prepareArrayWithKeys(
    items.map((x, i) => ({ ...x, _key: `${prefix}${i}` })),
    prefix,
  )!
const pt = (text: string) =>
  keyed(
    text.split('\n\n').map((p, i) => ({
      _type: 'block',
      style: 'normal',
      markDefs: [],
      children: [{ _type: 'span', _key: `s${i}`, text: p, marks: [] }],
    })),
    'b',
  )
const refs = (type: string, keys: string[], prefix: string) =>
  keyed(
    keys.map((k) => ref(type, k)),
    prefix,
  )

export const ORG_ID = id('organization', 'kontainerkonf')

/**
 * Sanity documents for the fixtures. Conference documents carry only what
 * lives in Sanity (title, dates for references and branding); D1 settings
 * come from seedDemoD1 and win via d1_override.
 */
export function buildDocuments(f: DemoFixtures): {
  upsert: Doc[]
  ifMissing: Doc[]
} {
  const s = f.sanity
  const conf = (key: string) => ref('conference', key)
  const members = f.d1.members
  const talkEdition = new Map(s.proposals.map((p) => [p.key, p.editionKey]))
  const speakersOf = new Map(s.proposals.map((p) => [p.key, p.speakerKeys]))
  const topics = [...new Set(s.proposals.flatMap((p) => p.topics))]

  const upsert: Doc[] = [
    ...f.d1.editions.map((e) => ({
      _id: id('conference', e.key),
      _type: 'conference',
      title: e.title,
      tagline: e.tagline,
      organization: { _type: 'reference', _ref: ORG_ID },
      city: e.city,
      country: e.country,
      startDate: e.startDate,
      endDate: e.endDate,
      visibility: 'unlisted',
      theme: {
        primaryColor: s.branding.primaryColor,
        accentColor: s.branding.accentColor,
      },
      organizers: refs(
        'speaker',
        members.filter((m) => m.role !== 'member').map((m) => m.key),
        'og',
      ),
    })),
    ...topics.map((t) => ({
      _id: id('topic', t),
      _type: 'topic',
      title:
        ({ ai: 'AI', finops: 'FinOps' } as Record<string, string>)[t] ??
        t[0].toUpperCase() + t.slice(1),
      slug: { _type: 'slug', current: t },
      organization: { _type: 'reference', _ref: ORG_ID },
    })),
    // Members are speakers too: reviewers, assignees and notification recipients.
    ...[...members, ...s.speakers].map((p) => ({
      _id: id('speaker', p.key),
      _type: 'speaker',
      name: p.name,
      email: p.email,
      slug: { _type: 'slug', current: 'slug' in p ? p.slug : p.key },
      ...('title' in p
        ? {
            title: p.title,
            bio: p.bio,
            country: p.country,
            links: p.links,
          }
        : {}),
      organizations: [{ _type: 'reference', _ref: ORG_ID, _key: 'org0' }],
    })),
    ...s.proposals.map((p) => ({
      _id: id('talk', p.key),
      _type: 'talk',
      title: p.title,
      description: pt(p.description),
      language: p.language,
      format: p.format,
      level: p.level,
      status: p.status,
      tos: true,
      conference: conf(p.editionKey),
      speakers: refs('speaker', p.speakerKeys, 'sp'),
      topics: refs('topic', p.topics, 'tp'),
    })),
    ...s.reviews.map((r) => ({
      _id: id('review', r.key),
      _type: 'review',
      reviewer: ref('speaker', r.reviewerKey),
      proposal: ref('talk', r.proposalKey),
      conference: conf(talkEdition.get(r.proposalKey)!),
      comment: r.comment,
      score: r.score,
    })),
    ...s.coSpeakerInvitations.map((c) => ({
      _id: id('coSpeakerInvitation', c.key),
      _type: 'coSpeakerInvitation',
      proposal: ref('talk', c.proposalKey),
      conference: conf(talkEdition.get(c.proposalKey)!),
      invitedBy: ref('speaker', c.invitedByKey),
      invitedEmail: c.invitedEmail,
      invitedName: c.invitedName,
      status: c.status,
      // ponytail: deterministic token, so anyone reading this file can answer a
      // demo co-speaker invite; harmless on sample data, random if that changes.
      token: `demo-${c.key}`,
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    })),
    ...s.schedules.map((sc) => ({
      _id: id('schedule', sc.key),
      _type: 'schedule',
      conference: conf(sc.editionKey),
      status: 'official',
      version: 1,
      date: sc.date,
      tracks: keyed(
        sc.tracks.map((t, ti) => ({
          trackTitle: t.trackTitle,
          trackDescription: t.trackDescription,
          talks: keyed(
            t.talks.map(({ startTime, endTime, talkKey, placeholder }) => ({
              startTime,
              endTime,
              ...(talkKey ? { talk: ref('talk', talkKey) } : { placeholder }),
            })),
            `t${ti}-`,
          ),
        })),
        'track',
      ),
    })),
    ...s.sponsors.map((sp) => ({
      _id: id('sponsor', sp.key),
      _type: 'sponsor',
      name: sp.name,
      website: sp.website,
      logo: sp.logo,
      organization: { _type: 'reference', _ref: ORG_ID },
    })),
    ...s.sponsorTiers.map((t) => ({
      _id: id('sponsorTier', t.key),
      _type: 'sponsorTier',
      title: t.title,
      tagline: t.tagline,
      tierType: t.tierType,
      price: keyed(
        [{ amount: t.price.amount / 100, currency: t.price.currency }],
        'price',
      ),
      ...(t.maxQuantity ? { maxQuantity: t.maxQuantity } : {}),
      soldOut: false,
      conference: conf(t.editionKey),
    })),
    ...s.sponsorsForConference.map((x) => {
      const tier = s.sponsorTiers.find((t) => t.key === x.tierKey)!
      return {
        _id: id('sponsorForConference', x.key),
        _type: 'sponsorForConference',
        sponsor: ref('sponsor', x.sponsorKey),
        conference: conf(x.editionKey),
        tier: ref('sponsorTier', x.tierKey),
        status: x.status,
        contractStatus: x.contractStatus,
        signatureStatus: x.signatureStatus,
        invoiceStatus: x.invoiceStatus,
        contractValue: tier.price.amount / 100,
        contractCurrency: tier.price.currency,
        ...(x.invoiceSentAt ? { invoiceSentAt: x.invoiceSentAt } : {}),
        ...(x.invoiceDueAt ? { invoiceDueAt: x.invoiceDueAt } : {}),
        ...(x.invoicePaidAt ? { invoicePaidAt: x.invoicePaidAt } : {}),
        ...(x.assignedToKey
          ? { assignedTo: ref('speaker', x.assignedToKey) }
          : {}),
        ...(x.contactInitiatedAt
          ? { contactInitiatedAt: x.contactInitiatedAt }
          : {}),
      }
    }),
    ...s.volunteers.map((v) => ({
      _id: id('volunteer', v.key),
      _type: 'volunteer',
      name: v.name,
      email: v.email,
      phone: v.phone,
      occupation: v.occupation,
      tshirtSize: v.tshirtSize,
      status: v.status,
      submittedAt: v.submittedAt,
      conference: conf(v.editionKey),
    })),
    ...s.workshopSignups.map((w) => ({
      _id: id('workshopSignup', w.key),
      _type: 'workshopSignup',
      userEmail: w.user.email,
      userName: w.user.name,
      experienceLevel: w.experienceLevel,
      operatingSystem: w.operatingSystem,
      workshop: ref('talk', w.workshopKey),
      conference: conf(talkEdition.get(w.workshopKey)!),
      status: w.status,
      signedUpAt: w.signedUpAt,
    })),
    ...s.travelSupport.map((t) => ({
      _id: id('travelSupport', t.key),
      _type: 'travelSupport',
      speaker: ref('speaker', t.speakerKey),
      conference: conf(t.editionKey),
      status: t.status,
      preferredCurrency: t.totalAmount.currency,
      totalAmount: t.totalAmount.amount / 100,
      ...(t.approvedAmount
        ? { approvedAmount: t.approvedAmount.amount / 100 }
        : {}),
      ...(t.submittedAt ? { submittedAt: t.submittedAt } : {}),
    })),
    ...s.feedback.map((fb) => ({
      _id: id('feedbackResponse', fb.key),
      _type: 'feedbackResponse',
      talk: ref('talk', fb.talkKey),
      conference: conf(talkEdition.get(fb.talkKey)!),
      colour: fb.colour,
      ...(fb.comment ? { comment: fb.comment } : {}),
      submittedAt: fb.submittedAt,
    })),
    ...s.conversations.flatMap((c) => {
      const last = c.messages[c.messages.length - 1]
      return [
        {
          _id: id('conversation', c.key),
          _type: 'conversation',
          conference: conf(c.editionKey),
          conversationType: c.conversationType,
          ...(c.proposalKey ? { proposal: ref('talk', c.proposalKey) } : {}),
          participants: keyed(
            [
              ...(c.sponsorForConferenceKey
                ? [
                    {
                      _type: 'conversationParticipant',
                      partyType: 'sponsor',
                      sponsorForConference: ref(
                        'sponsorForConference',
                        c.sponsorForConferenceKey,
                      ),
                    },
                  ]
                : []),
              ...(c.proposalKey
                ? speakersOf.get(c.proposalKey)!.map((k) => ({
                    _type: 'conversationParticipant',
                    partyType: 'speaker',
                    speaker: ref('speaker', k),
                  }))
                : []),
              {
                _type: 'conversationParticipant',
                partyType: 'group',
                group: ORGANIZERS_GROUP,
              },
            ],
            'p',
          ),
          status: 'open',
          createdAt: c.messages[0].createdAt,
          lastMessageAt: last.createdAt,
        },
        ...c.messages.map((m, i) => ({
          _id: id('message', `${c.key}-${i}`),
          _type: 'message',
          conversation: ref('conversation', c.key),
          ...(m.authorKey ? { author: ref('speaker', m.authorKey) } : {}),
          authorName: m.authorName,
          body: m.body,
          origin: m.origin,
          createdAt: m.createdAt,
          organization: { _type: 'reference', _ref: ORG_ID },
        })),
      ]
    }),
    ...s.notifications.map((n) => ({
      _id: id('notification', n.key),
      _type: 'notification',
      recipient: ref('speaker', n.recipientKey),
      conference: conf(n.editionKey),
      notificationType: n.notificationType,
      title: n.title,
      message: n.message,
      link: n.link,
      ...(n.readAt ? { readAt: n.readAt } : {}),
      createdAt: n.createdAt,
    })),
  ]
  // The org document may already carry operator-set fields: never replace it.
  const ifMissing: Doc[] = [
    {
      _id: ORG_ID,
      _type: 'organization',
      name: 'KontainerKonf',
      slug: { _type: 'slug', current: 'kontainerkonf-demo' },
    },
  ]
  return { upsert, ifMissing }
}

export function assertDemoIds(docs: Doc[]) {
  const bad = docs.filter((d) => !d._id.startsWith(DEMO_PREFIX))
  if (bad.length)
    throw new Error(`refusing: ids outside ${DEMO_PREFIX}: ${bad[0]._id}`)
}

export function countByType(docs: Doc[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of docs) out[d._type] = (out[d._type] ?? 0) + 1
  return out
}

/** Midnight UTC: a re-run the same day produces identical documents. */
export const today = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))

// ------------------------------------------------------------------ run

const TX_SIZE = 200

export async function run(
  opts: { host: string; dryRun: boolean; now: Date },
  deps: Deps,
) {
  // 1. Guard first: nothing below runs for a non-demo org.
  const { organization } = await deps.api.request<{
    organization: { id: string; kind: string | null } | null
  }>(opts.host, '{ organization { id kind } }')
  if (organization?.kind !== 'demo')
    throw new NotDemoOrgError(
      `refusing to seed ${opts.host}: org kind is ${organization?.kind ?? 'unknown'}, not demo`,
    )

  const fixtures = generateDemoFixtures({ seed: DEMO_SEED, now: opts.now })
  const { upsert, ifMissing } = buildDocuments(fixtures)
  assertDemoIds([...upsert, ...ifMissing])

  deps.log(`${opts.dryRun ? 'Planned' : 'Writing'} Sanity documents:`)
  for (const [type, n] of Object.entries(
    countByType([...ifMissing, ...upsert]),
  ))
    deps.log(`  ${type.padEnd(22)} ${n}`)

  if (!opts.dryRun) {
    const client = await deps.createSanityClient()
    for (let i = 0; i < upsert.length; i += TX_SIZE) {
      const tx = client.transaction()
      if (i === 0) ifMissing.forEach((d) => tx.createIfNotExists(d))
      upsert.slice(i, i + TX_SIZE).forEach((d) => tx.createOrReplace(d))
      await tx.commit()
    }
  }

  // ---- D1: website-001's seedDemoD1 (#2164). Do not write D1 here.
  const seedDemoD1 = await deps.loadSeedDemoD1()
  if (!seedDemoD1)
    deps.log('D1: seedDemoD1 not available yet (#2164), skipped.')
  else
    deps.log(
      `D1: ${JSON.stringify(await seedDemoD1(fixtures, deps.api, { host: opts.host, dryRun: opts.dryRun }))}`,
    )
}

// ------------------------------------------------------------------ CLI

function operatorClient(): GraphQLClient {
  const url = process.env.KONF_API_URL?.trim() || 'https://api.konf.app/graphql'
  const token = process.env.KONF_OPERATOR_TOKEN
  if (!token) throw new Error('KONF_OPERATOR_TOKEN is required')
  const origin = process.env.KONF_OPERATOR_ORIGIN || 'https://my.konf.app'
  return {
    async request<T>(
      host: string | null,
      query: string,
      variables?: Record<string, unknown>,
    ) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          authorization: `Bearer ${token}`,
          ...(host ? { 'x-konf-operator-tenant': host } : {}),
        },
        body: JSON.stringify({ query, variables }),
      })
      const json = (await res.json()) as { data?: T; errors?: unknown[] }
      if (!res.ok || json.errors?.length)
        throw new Error(
          `gateway ${res.status}: ${JSON.stringify(json.errors ?? json)}`,
        )
      return json.data as T
    },
  }
}

async function main() {
  const args = process.argv.slice(2)
  const hostAt = args.indexOf('--host')
  const host = hostAt >= 0 ? args[hostAt + 1] : DEFAULT_HOST
  await run(
    { host, dryRun: args.includes('--dry-run'), now: today() },
    {
      api: operatorClient(),
      createSanityClient: async () => {
        // Imported lazily so a refused or dry run never loads a write client.
        const { createClient } = await import('next-sanity')
        return createClient({
          projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
          dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
          apiVersion: '2025-01-01',
          token: process.env.SANITY_API_TOKEN_WRITE,
          useCdn: false,
        }) as unknown as SanityWriter
      },
      loadSeedDemoD1: async () => {
        // A variable path keeps tsc from resolving a module that may not exist yet.
        const path = './seed-d1'
        try {
          return (await import(path)).seedDemoD1
        } catch (e) {
          const code = (e as { code?: string }).code
          if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND')
            return undefined
          throw e
        }
      },
      log: console.log,
    },
  )
}

if (process.argv[1]?.endsWith('seed.ts'))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
