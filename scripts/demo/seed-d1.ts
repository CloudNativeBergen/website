/**
 * Seeds the D1 branch of the demo fixtures (#2150) through the API gateway's
 * GraphQL mutations only, never D1 directly. Refuses any org whose kind is
 * not `demo`, before any write. Idempotent: entities are matched on natural
 * keys (edition title, email, order externalId), so a re-run converges.
 */
import type {
  D1Edition,
  DemoFixtures,
  FakePerson,
  Money,
} from './fixtures/types'

/**
 * The caller's operator-lane client. `host` names the tenant the operator
 * acts for (x-konf-operator-tenant); null is the operator lane with no
 * tenant. Throws on GraphQL errors.
 */
export interface DemoGraphQLClient {
  request<T>(
    host: string | null,
    query: string,
    variables?: Record<string, unknown>,
    /** Another conference of the host's org (x-konf-operator-conference). */
    conferenceId?: string,
  ): Promise<T>
}

export interface SeedDemoD1Options {
  /** A host of the demo org's current edition, e.g. kontainerkonf.konf.run. */
  host: string
  dryRun?: boolean
  /** The fixture edition that is the host's own conference. */
  currentEditionKey?: string
}

export type SeedEntity =
  | 'editions'
  | 'settings'
  | 'lifecycle'
  | 'members'
  | 'speakerProfiles'
  | 'invites'
  | 'ticketOrders'

export interface SeedDemoD1Result {
  dryRun: boolean
  /** Planned (dry run) or written per entity. */
  counts: Record<SeedEntity, number>
  /** What the API cannot seed yet, one line each. */
  skipped: string[]
}

export class NotDemoOrgError extends Error {}

const ORG = '{ organization { id kind } }'
const EDITIONS =
  '{ conference { id } conferenceEditions { id title primaryHost } }'
const PROVISION = `mutation($key: String!, $input: ProvisionConferenceInput!) {
  provisionConference(idempotencyKey: $key, input: $input) { conferenceId } }`
const UPDATE = `mutation($input: ConferencePatch!) { updateConference(input: $input) { id } }`
const LIFECYCLE = `mutation($status: ConferenceLifecycleOverride) {
  setConferenceLifecycle(status: $status) { id } }`
const SEED_USER = `mutation($email: String!, $name: String!, $role: MemberRole, $profile: SpeakerProfileInput) {
  seedDemoUser(email: $email, name: $name, role: $role, profile: $profile) }`
const INVITE = `mutation($email: String!, $role: MemberRole!, $status: SeedInvitationStatus!) {
  seedDemoInvitation(email: $email, role: $role, status: $status) { id } }`
const ORDERS = `mutation($event: TicketEventRefInput!, $orders: [TicketOrderInput!]!) {
  seedTicketOrders(event: $event, orders: $orders) }`

type Edition = { id: string; title: string | null; primaryHost: string | null }

export async function seedDemoD1(
  fixtures: DemoFixtures,
  client: DemoGraphQLClient,
  {
    host,
    dryRun = false,
    currentEditionKey = 'edition-live',
  }: SeedDemoD1Options,
): Promise<SeedDemoD1Result> {
  const { d1 } = fixtures
  // Guard before any write: the org the host resolves to must be a demo.
  const { organization } = await client.request<{
    organization: { id: string; kind: string | null } | null
  }>(host, ORG)
  if (organization?.kind !== 'demo')
    throw new NotDemoOrgError(
      `refusing to seed ${host}: org kind is ${organization?.kind ?? 'unknown'}, not demo`,
    )
  const orgId = organization.id

  const counts: Record<SeedEntity, number> = {
    editions: 0,
    settings: 0,
    lifecycle: 0,
    members: 0,
    speakerProfiles: 0,
    invites: 0,
    ticketOrders: 0,
  }
  const skipped: string[] = []

  if (dryRun)
    return {
      dryRun,
      counts: {
        editions: d1.editions.length,
        settings: d1.editions.length,
        lifecycle: d1.editions.length,
        members: d1.members.length,
        speakerProfiles: d1.speakerProfiles.length,
        invites: d1.invites.length,
        ticketOrders: d1.ticketOrders.length,
      },
      skipped,
    }

  // --- editions: the current one is the host's; others match on title and
  // are targeted by id on the operator lane, verified host or not.
  const read = () =>
    client.request<{
      conference: { id: string }
      conferenceEditions: Edition[]
    }>(host, EDITIONS)
  let state = await read()
  const idOf = new Map<string, string | undefined>()
  for (const e of d1.editions) {
    if (e.key === currentEditionKey) {
      idOf.set(e.key, undefined)
      continue
    }
    let found = state.conferenceEditions.find((x) => x.title === e.title)
    if (!found) {
      await client.request(host, PROVISION, {
        key: `demo-seed-${e.key}-${e.startDate}`,
        input: { title: e.title, startDate: e.startDate, endDate: e.endDate },
      })
      counts.editions++
      state = await read()
      found = state.conferenceEditions.find((x) => x.title === e.title)
    }
    if (found) idOf.set(e.key, found.id)
    else skipped.push(`edition ${e.key}: not found after provisioning`)
  }
  const target = (key: string) => idOf.get(key)

  // --- settings (phases 1-3) and lifecycle, per edition.
  for (const e of d1.editions) {
    if (!idOf.has(e.key)) continue
    await client.request(host, UPDATE, { input: patchOf(e) }, target(e.key))
    counts.settings++
    await client.request(
      host,
      LIFECYCLE,
      { status: e.lifecycle },
      target(e.key),
    )
    counts.lifecycle++
  }

  // --- members and speaker profiles: seed users, upserted on email.
  const people = new Map<string, FakePerson>(
    [...d1.members, ...fixtures.sanity.speakers].map((p) => [p.key, p]),
  )
  const profileOf = new Map(d1.speakerProfiles.map((p) => [p.userKey, p]))
  const profileInput = (key: string) => {
    const p = profileOf.get(key)
    return (
      p && {
        name: p.name,
        bio: p.bio,
        photoKey: p.photoKey,
        links: p.links,
        topics: p.topics,
        visibility: p.visibility,
      }
    )
  }
  for (const m of d1.members) {
    const profile = profileInput(m.key)
    await client.request(host, SEED_USER, {
      email: m.email,
      name: m.name,
      role: m.role,
      profile,
    })
    counts.members++
    if (profile) counts.speakerProfiles++
  }
  for (const p of d1.speakerProfiles) {
    if (d1.members.some((m) => m.key === p.userKey)) continue
    const person = people.get(p.userKey)
    if (!person) {
      skipped.push(`speaker profile ${p.userKey}: no person with that key`)
      continue
    }
    await client.request(host, SEED_USER, {
      email: person.email,
      name: person.name,
      profile: profileInput(p.userKey),
    })
    counts.speakerProfiles++
  }

  // --- invites: every state, never mailed; idempotent per email and status.
  for (const i of d1.invites) {
    await client.request(host, INVITE, {
      email: i.email,
      role: i.role,
      status: i.status,
    })
    counts.invites++
  }

  // --- ticket orders: one demo event per edition, idempotent per externalId.
  const typeOf = new Map(d1.ticketTypes.map((t) => [t.key, t]))
  for (const e of d1.editions) {
    const orders = d1.ticketOrders.filter((o) => o.editionKey === e.key)
    if (!orders.length || !idOf.has(e.key)) continue
    await client.request(
      host,
      ORDERS,
      {
        event: { provider: 'demo', accountId: orgId, externalId: e.key },
        orders: orders.map((o) => ({
          externalId: o.key,
          status: o.status,
          total: money(o.total),
          buyerEmail: o.buyerEmail,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          lines: o.lines.map((l) => ({
            ticketTypeExternalId: l.ticketTypeKey,
            ticketTypeName:
              typeOf.get(l.ticketTypeKey)?.name ?? l.ticketTypeKey,
            capacity: typeOf.get(l.ticketTypeKey)?.capacity,
            quantity: l.quantity,
            unitPrice: money(l.unitPrice),
          })),
        })),
      },
      target(e.key),
    )
    counts.ticketOrders += orders.length
  }

  return { dryRun, counts, skipped }
}

const money = (m: Money) => ({ amountMinor: m.amount, currency: m.currency })

/** The edition's settings as a ConferencePatch (phases 1-3). */
function patchOf(e: D1Edition) {
  const omit = new Set(['key', 'lifecycle'])
  return Object.fromEntries(Object.entries(e).filter(([k]) => !omit.has(k)))
}
