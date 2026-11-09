#!/usr/bin/env tsx
/**
 * `pnpm demo:seed [--dry-run]` (#2150): seeds the Sanity
 * side of the demo tenant from the deterministic fixtures, then hands the
 * same fixtures to website-001's `seedDemoD1` for the D1 side.
 *
 * Order matters and is tested:
 *   0. Decode KONF_OPERATOR_TOKEN locally: missing, malformed or expired exits.
 *   1. Ask the gateway (operator lane, tenant = DEMO_HOST) for the org. It
 *      must be exactly DEMO_ORG_ID with kind `demo`, or the run exits before
 *      seedDemoD1 or a Sanity client is loaded.
 *   2. seedDemoD1 (#2164) creates the D1 editions.
 *   3. Read that org's `conferenceEditions`; map past/upcoming by title. The
 *      write allowlist is `kkdemo.conference` plus those ids; every target is
 *      checked against `kkdemo.seed.*` or the allowlist before any write.
 *      Conference docs must already exist; they get their dates set and
 *      everything else setIfMissing.
 *   4. --dry-run: print counts per type and stop. No write client.
 *   5. Upload missing speaker avatars (content-addressed, so unchanged ones
 *      are skipped), then createOrReplace everything else under DEMO_PREFIX,
 *      in transactions. kkdemo.conference also gets the KontainerKonf logos
 *      and theme, setIfMissing.
 *      Same UTC day gives identical mutations, except invite tokens.
 *
 * Env: KONF_OPERATOR_TOKEN (identity JWT of a platform operator, origin
 * claim = KONF_OPERATOR_ORIGIN, required; both from Kontroll), KONF_API_URL
 * (default production gateway), NEXT_PUBLIC_SANITY_PROJECT_ID,
 * SANITY_API_TOKEN_WRITE. The dataset is pinned to `production`.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { avatarAsset } from './assets'
import { generateDemoFixtures } from './fixtures/generate'
import type { DemoFixtures } from './fixtures/types'
import { prepareArrayWithKeys } from '@/lib/sanity/helpers'
import { ORGANIZERS_GROUP } from '@/lib/messaging/types'

/** Every document this script writes has this id prefix; nothing else is touched. */
export const DEMO_PREFIX = 'kkdemo.seed.'
export const DEMO_SEED = 2150
/** The only org and host this script will ever seed (tenant-directory 0010). */
export const DEMO_ORG_ID = 'kkdemo.org'
export const DEMO_HOST = 'kontainerkonf.konf.run'

type Doc = Record<string, unknown> & { _id: string; _type: string }

/** Operator-lane GraphQL client; same shape as seedDemoD1's DemoGraphQLClient. */
export interface GraphQLClient {
  request<T>(
    host: string | null,
    query: string,
    variables?: Record<string, unknown>,
    /** Another conference of the host's org (x-konf-operator-conference). */
    conferenceId?: string,
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
        setIfMissing: Record<string, unknown>
      },
    ): unknown
    commit(): Promise<unknown>
  }
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>
  assets: {
    upload(
      type: 'image',
      body: Buffer,
      opts: { filename: string },
    ): Promise<{ _id: string }>
  }
}

export interface Deps {
  api: GraphQLClient
  createSanityClient: () => Promise<SanityWriter>
  /** website-001's step (#2164); loaded only after the guard passes. */
  loadSeedDemoD1: () => Promise<
    (
      f: DemoFixtures,
      c: GraphQLClient,
      o: { host: string; dryRun: boolean },
    ) => Promise<unknown>
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
const TOPIC_COLORS = [
  '#326CE5',
  '#7C3AED',
  '#0EA5E9',
  '#DC2626',
  '#16A34A',
  '#EA580C',
  '#DB2777',
  '#CA8A04',
  '#0D9488',
  '#4F46E5',
  '#65A30D',
  '#9333EA',
  '#E11D48',
  '#0891B2',
]

export const LIVE_CONFERENCE_ID = 'kkdemo.conference'
const LIVE_KEY = 'edition-live'

export interface ConferencePatch {
  id: string
  /**
   * Dates are always set: the admin schedule editor drops schedules outside
   * them, and the seeded schedules follow the fixture dates.
   */
  set: { startDate: string; endDate: string }
  /** Existing values (theme, branding) are never overwritten. */
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
  conferences: ConferencePatch[]
  avatars: ReturnType<typeof avatarAsset>[]
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
  const people = [...members, ...s.speakers]
  const avatars = people.map((p) => avatarAsset(p.key, p.name))
  const topics = [...new Set(s.proposals.flatMap((p) => p.topics))]

  const upsert: Doc[] = [
    ...topics.map((t, i) => ({
      _id: id('topic', t),
      _type: 'topic',
      title:
        ({ ai: 'AI', finops: 'FinOps' } as Record<string, string>)[t] ??
        t[0].toUpperCase() + t.slice(1),
      slug: { _type: 'slug', current: t },
      // Required by the schema; the admin schedule editor crashes without it.
      color: TOPIC_COLORS[i % TOPIC_COLORS.length],
      organization: { _type: 'reference', _ref: DEMO_ORG_ID },
    })),
    // Members are speakers too: reviewers, assignees and notification recipients.
    ...people.map((p, i) => ({
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
      image: {
        _type: 'image',
        asset: { _type: 'reference', _ref: avatars[i].assetId },
      },
      organizations: [{ _type: 'reference', _ref: DEMO_ORG_ID, _key: 'org0' }],
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
      organization: { _type: 'reference', _ref: DEMO_ORG_ID },
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
          organization: { _type: 'reference', _ref: DEMO_ORG_ID },
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
  const conferences: ConferencePatch[] = f.d1.editions.map((e) => ({
    id: confId(e.key),
    set: { startDate: e.startDate, endDate: e.endDate },
    setIfMissing: {
      title: e.title,
      tagline: e.tagline,
      organization: { _type: 'reference', _ref: DEMO_ORG_ID },
      city: e.city,
      country: e.country,
      visibility: 'unlisted',
      organizers: refs(
        'speaker',
        members.filter((m) => m.role !== 'member').map((m) => m.key),
        'og',
      ),
      // Branding only on the live edition, the one DEMO_HOST renders.
      ...(e.key === LIVE_KEY
        ? {
            logoBright: s.branding.logoBright,
            logoDark: s.branding.logoDark,
            logomarkBright: s.branding.logomarkBright,
            logomarkDark: s.branding.logomarkDark,
            theme: {
              primaryColor: s.branding.primaryColor,
              accentColor: s.branding.accentColor,
            },
          }
        : {}),
    },
  }))
  return { upsert, conferences, avatars }
}

/** Every write target must be `kkdemo.seed.*` or an allowlisted conference id. */
export function assertDemoIds(ids: string[], allowlist: ReadonlySet<string>) {
  const bad = ids.filter(
    (id) => !id.startsWith(DEMO_PREFIX) && !allowlist.has(id),
  )
  if (bad.length)
    throw new Error(
      `refusing: id outside ${DEMO_PREFIX} and the edition allowlist: ${bad[0]}`,
    )
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
    dryRun: boolean
    now: Date
    token: string | undefined
    origin: string | undefined
  },
  deps: Deps,
) {
  // 0. Token and origin up front, then the guard: nothing below runs for any
  //    org but DEMO_ORG_ID. Every API call re-checks expiry. All API calls
  //    happen before the Sanity writes, which need no token.
  if (!opts.origin)
    throw new OperatorTokenError('KONF_OPERATOR_ORIGIN is not set')
  checkOperatorToken(opts.token, Date.now())
  const api: GraphQLClient = {
    request: (host, query, variables, conferenceId) => {
      checkOperatorToken(opts.token, Date.now())
      return deps.api.request(host, query, variables, conferenceId)
    },
  }
  const { organization } = await api.request<{
    organization: { id: string; kind: string | null } | null
  }>(DEMO_HOST, '{ organization { id kind } }')
  if (organization?.id !== DEMO_ORG_ID || organization.kind !== 'demo')
    throw new NotDemoOrgError(
      `refusing to seed ${DEMO_HOST}: org is ${organization?.id ?? 'unknown'} (kind ${organization?.kind ?? 'unknown'}), expected ${DEMO_ORG_ID} (demo)`,
    )

  const fixtures = generateDemoFixtures({ seed: DEMO_SEED, now: opts.now })

  // 1. D1 first: seedDemoD1 (#2164) creates the editions the Sanity documents
  //    reference. Do not write D1 here.
  const seedDemoD1 = await deps.loadSeedDemoD1()
  deps.log(
    `D1: ${JSON.stringify(await seedDemoD1(fixtures, api, { host: DEMO_HOST, dryRun: opts.dryRun }))}`,
  )

  // 2. The pinned org's editions (tenant = DEMO_HOST), matched by title.
  const { conferenceEditions } = await api.request<{
    conferenceEditions: { id: string; title: string | null }[] | null
  }>(DEMO_HOST, '{ conferenceEditions { id title primaryHost } }')
  const allowlist = new Set([
    LIVE_CONFERENCE_ID,
    ...(conferenceEditions ?? []).map((c) => c.id),
  ])
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
      if (e.key !== LIVE_KEY && !editionIds[e.key]) {
        editionIds[e.key] = `(pending:${e.key})`
        allowlist.add(editionIds[e.key]) // dry run only: never written
      }
  }

  const { upsert, conferences, avatars } = buildDocuments(fixtures, editionIds)
  // Before any transaction: every target is a seed id or an allowlisted edition.
  assertDemoIds(
    upsert.map((d) => d._id),
    new Set(),
  )
  assertDemoIds(
    conferences.map((c) => c.id),
    allowlist,
  )

  deps.log(`${opts.dryRun ? 'Planned' : 'Writing'} Sanity documents:`)
  deps.log(`  ${'conference (patched)'.padEnd(22)} ${conferences.length}`)
  for (const [type, n] of Object.entries(countByType(upsert)))
    deps.log(`  ${type.padEnd(22)} ${n}`)
  if (opts.dryRun) return

  // 3. Write. Conference docs must already exist; they get setIfMissing only.
  const client = await deps.createSanityClient()
  // The org and conference documents are referenced or patched, never created.
  const ids = [DEMO_ORG_ID, ...conferences.map((c) => c.id)]
  const found = await client.fetch<string[]>('*[_id in $ids]._id', { ids })
  const absent = ids.filter((id) => !found.includes(id))
  if (absent.length)
    throw new Error(
      `stopping: document(s) missing in Sanity: ${absent.join(', ')}`,
    )
  // Avatars: after every check above, before the speakers that reference them.
  const haveAssets = await client.fetch<string[]>('*[_id in $ids]._id', {
    ids: avatars.map((a) => a.assetId),
  })
  const toUpload = avatars.filter((a) => !haveAssets.includes(a.assetId))
  for (const a of toUpload) {
    const { _id } = await client.assets.upload('image', Buffer.from(a.svg), {
      filename: a.filename,
    })
    if (_id !== a.assetId)
      throw new Error(
        `stopping: avatar uploaded as ${_id}, expected ${a.assetId}`,
      )
  }
  deps.log(`  avatars uploaded       ${toUpload.length}/${avatars.length}`)
  for (let i = 0; i < upsert.length; i += TX_SIZE) {
    const tx = client.transaction()
    if (i === 0) {
      for (const c of conferences)
        tx.patch(c.id, { set: c.set, setIfMissing: c.setIfMissing })
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
      conferenceId?: string,
    ) {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin,
          authorization: `Bearer ${token}`,
          ...(host ? { 'x-konf-operator-tenant': host } : {}),
          ...(conferenceId
            ? { 'x-konf-operator-conference': conferenceId }
            : {}),
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
  const unknown = args.filter((a) => a !== '--dry-run')
  if (unknown.length) throw new Error(`unknown arguments: ${unknown.join(' ')}`)
  await run(
    {
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
          dataset: 'production',
          apiVersion: '2025-01-01',
          token: process.env.SANITY_API_TOKEN_WRITE,
          useCdn: false,
        }) as unknown as SanityWriter
      },
      loadSeedDemoD1: async () => (await import('./seed-d1')).seedDemoD1,
      log: console.log,
    },
  )
}

if (process.argv[1]?.endsWith('seed.ts'))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
