#!/usr/bin/env tsx
/**
 * `pnpm demo:seed [--dry-run] [--host <host>]` (#2150): seeds the Sanity
 * side of the demo tenant from the deterministic fixtures, then hands the
 * same fixtures to website-001's `seedDemoD1` for the D1 side.
 *
 * Order matters and is tested:
 *   0. Decode KONF_OPERATOR_TOKEN locally: missing, malformed or expired exits.
 *   1. Ask the gateway (operator lane, tenant = --host) for the org's kind.
 *      Anything but `demo` exits before a Sanity client exists.
 *   2. seedDemoD1 (#2164) creates the D1 editions; without it a real run stops.
 *   3. Read `conferenceEditions` and map past/upcoming by title. The live
 *      edition is `kkdemo.conference`, patched (set/setIfMissing), never replaced.
 *   4. --dry-run: print counts per type and stop. No write client.
 *   5. createOrReplace everything else under DEMO_PREFIX, in transactions.
 *      Same UTC day gives identical mutations, except invite tokens.
 *
 * Env: KONF_OPERATOR_TOKEN (identity JWT of a platform operator, origin
 * claim = KONF_OPERATOR_ORIGIN, required; both from Kontroll), KONF_API_URL
 * (default production gateway), NEXT_PUBLIC_SANITY_PROJECT_ID,
 * NEXT_PUBLIC_SANITY_DATASET, SANITY_API_TOKEN_WRITE.
 */
import { createHmac, randomBytes } from 'node:crypto'
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
    patch(
      id: string,
      ops: {
        set?: Record<string, unknown>
        setIfMissing?: Record<string, unknown>
      },
    ): unknown
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
export class OperatorTokenError extends Error {}

/**
 * Local sanity check of the operator JWT before anything else runs. No
 * signature check: the gateway verifies it. Never logs the token.
 */
export function checkOperatorToken(token: string | undefined, nowMs: number) {
  if (!token) throw new OperatorTokenError('KONF_OPERATOR_TOKEN is not set')
  let exp: unknown
  try {
    const [, payload, sig, ...rest] = token.split('.')
    if (!payload || !sig || rest.length) throw new Error()
    exp = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp
  } catch {
    throw new OperatorTokenError('KONF_OPERATOR_TOKEN is not a JWT')
  }
  if (typeof exp !== 'number')
    throw new OperatorTokenError('KONF_OPERATOR_TOKEN has no exp')
  // Tokens live 5 minutes: stop cleanly rather than fail mid-seed.
  if (exp * 1000 - nowMs < TOKEN_MARGIN_MS)
    throw new OperatorTokenError(
      'KONF_OPERATOR_TOKEN expires in under 30 s; copy a fresh one from Kontroll',
    )
}
const TOKEN_MARGIN_MS = 30_000

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
/**
 * Co-speaker invite tokens grant access, so they must not follow from the
 * source: HMAC-SHA256 of the key with DEMO_SEED_TOKEN_SECRET (stable across
 * runs), else random per run.
 */
export function inviteToken(
  key: string,
  secret = process.env.DEMO_SEED_TOKEN_SECRET,
): string {
  return secret
    ? createHmac('sha256', secret).update(key).digest('hex')
    : randomBytes(32).toString('hex')
}

/** The live edition's Sanity document; patched, never replaced. */
export const LIVE_CONFERENCE_ID = 'kkdemo.conference'
const LIVE_KEY = 'edition-live'

export interface ConferencePatch {
  id: string
  /** Seed-owned fields, always written. */
  set: Record<string, unknown>
  /** Written only where the document has no value (operator edits survive). */
  setIfMissing: Record<string, unknown>
}

/**
 * `editionIds` maps fixture edition keys to conference ids from D1; the live
 * edition is always LIVE_CONFERENCE_ID.
 */
export function buildDocuments(
  f: DemoFixtures,
  editionIds: Record<string, string>,
): {
  upsert: Doc[]
  ifMissing: Doc[]
  conferences: ConferencePatch[]
} {
  const s = f.sanity
  const confId = (key: string) => {
    const v = key === LIVE_KEY ? LIVE_CONFERENCE_ID : editionIds[key]
    if (!v) throw new Error(`no D1 conference id for ${key}`)
    return v
  }
  const conf = (key: string) => ({ _type: 'reference', _ref: confId(key) })
  const members = f.d1.members
  const talkEdition = new Map(s.proposals.map((p) => [p.key, p.editionKey]))
  const speakersOf = new Map(s.proposals.map((p) => [p.key, p.speakerKeys]))
  const topics = [...new Set(s.proposals.flatMap((p) => p.topics))]

  const upsert: Doc[] = [
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
      token: inviteToken(c.key),
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
  const conferences: ConferencePatch[] = f.d1.editions.map((e) => ({
    id: confId(e.key),
    set: {
      theme: {
        primaryColor: s.branding.primaryColor,
        accentColor: s.branding.accentColor,
      },
    },
    setIfMissing: {
      title: e.title,
      tagline: e.tagline,
      organization: { _type: 'reference', _ref: ORG_ID },
      city: e.city,
      country: e.country,
      startDate: e.startDate,
      endDate: e.endDate,
      visibility: 'unlisted',
      organizers: refs(
        'speaker',
        members.filter((m) => m.role !== 'member').map((m) => m.key),
        'og',
      ),
    },
  }))
  return { upsert, ifMissing, conferences }
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
  opts: {
    host: string
    dryRun: boolean
    now: Date
    token: string | undefined
    origin: string | undefined
  },
  deps: Deps,
) {
  // 0. Token and origin up front, then the guard: nothing below runs for a
  //    non-demo org. Every API call re-checks expiry. All API calls happen
  //    before the Sanity writes, which need no token.
  if (!opts.origin)
    throw new OperatorTokenError('KONF_OPERATOR_ORIGIN is not set')
  checkOperatorToken(opts.token, Date.now())
  const api: GraphQLClient = {
    request: (host, query, variables) => {
      checkOperatorToken(opts.token, Date.now())
      return deps.api.request(host, query, variables)
    },
  }
  const { organization } = await api.request<{
    organization: { id: string; kind: string | null } | null
  }>(opts.host, '{ organization { id kind } }')
  if (organization?.kind !== 'demo')
    throw new NotDemoOrgError(
      `refusing to seed ${opts.host}: org kind is ${organization?.kind ?? 'unknown'}, not demo`,
    )

  const fixtures = generateDemoFixtures({ seed: DEMO_SEED, now: opts.now })

  // 1. D1 first: website-001's seedDemoD1 (#2164) creates the editions whose
  //    ids the Sanity documents reference. Do not write D1 here.
  const seedDemoD1 = await deps.loadSeedDemoD1()
  if (seedDemoD1)
    deps.log(
      `D1: ${JSON.stringify(await seedDemoD1(fixtures, api, { host: opts.host, dryRun: opts.dryRun }))}`,
    )
  else if (!opts.dryRun)
    throw new Error(
      'stopping: seedDemoD1 (#2164) is not available, so D1 has no demo editions to reference',
    )
  else deps.log('D1: seedDemoD1 not available yet (#2164), skipped.')

  // 2. Edition ids from D1, matched by title. The live edition is LIVE_CONFERENCE_ID.
  const { conferenceEditions } = await api.request<{
    conferenceEditions: { id: string; title: string | null }[] | null
  }>(opts.host, '{ conferenceEditions { id title primaryHost } }')
  const editionIds: Record<string, string> = {}
  const missing: string[] = []
  for (const e of fixtures.d1.editions) {
    if (e.key === LIVE_KEY) continue
    const hit = conferenceEditions?.find((c) => c.title === e.title)
    if (hit) editionIds[e.key] = hit.id
    else missing.push(`${e.key} (${e.title})`)
  }
  if (missing.length) {
    if (!opts.dryRun)
      throw new Error(
        `stopping: D1 has no edition for ${missing.join(', ')}; run seedDemoD1 first`,
      )
    deps.log(`Dry run: no D1 edition yet for ${missing.join(', ')}`)
    for (const e of fixtures.d1.editions)
      editionIds[e.key] ??= `(pending:${e.key})`
  }

  const { upsert, ifMissing, conferences } = buildDocuments(
    fixtures,
    editionIds,
  )
  assertDemoIds([...upsert, ...ifMissing])

  deps.log(`${opts.dryRun ? 'Planned' : 'Writing'} Sanity documents:`)
  deps.log(`  ${'conference (patched)'.padEnd(22)} ${conferences.length}`)
  for (const [type, n] of Object.entries(
    countByType([...ifMissing, ...upsert]),
  ))
    deps.log(`  ${type.padEnd(22)} ${n}`)
  if (opts.dryRun) return

  // 3. Write. Conference docs: create if absent, then patch seed-owned fields
  //    only; never createOrReplace (the live one carries operator settings).
  const client = await deps.createSanityClient()
  for (let i = 0; i < upsert.length; i += TX_SIZE) {
    const tx = client.transaction()
    if (i === 0) {
      ifMissing.forEach((d) => tx.createIfNotExists(d))
      for (const c of conferences) {
        tx.createIfNotExists({ _id: c.id, _type: 'conference' })
        tx.patch(c.id, { setIfMissing: c.setIfMissing, set: c.set })
      }
    }
    upsert.slice(i, i + TX_SIZE).forEach((d) => tx.createOrReplace(d))
    await tx.commit()
  }
}

// ------------------------------------------------------------------ CLI

function operatorClient(token: string, origin: string): GraphQLClient {
  const url = process.env.KONF_API_URL?.trim() || 'https://api.konf.app/graphql'
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
    {
      host,
      dryRun: args.includes('--dry-run'),
      now: today(),
      token: process.env.KONF_OPERATOR_TOKEN,
      origin: process.env.KONF_OPERATOR_ORIGIN,
    },
    {
      api: operatorClient(
        process.env.KONF_OPERATOR_TOKEN ?? '',
        process.env.KONF_OPERATOR_ORIGIN ?? '',
      ),
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
