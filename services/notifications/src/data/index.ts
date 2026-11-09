// Proposal notifications (epic #2215, phase 1): the faithful Worker port of
// the site's Slack alert (src/lib/events/handlers/slackNotification.ts) and
// organizer in-app items (persistNotification.ts) for proposal.submitted and
// proposal.withdrawn. The copy itself is shared: proposal-copy.ts.
//
// Never-fail: send() resolves whatever happens; a failure is logged.
import { createClient } from '@sanity/client'
import type { NotificationEvent } from '@runkonf/tenancy'
import { rawDb } from './db'
import {
  isSelfWithdrawInThread,
  notificationDocument,
  organizerProposalItems,
  proposalAlertBlocks,
  type TicketCancellation,
} from '../../../../src/lib/notification/proposal-copy'

/** Bindings the data layer needs. Every secret is optional (service.cue). */
export interface DataEnv {
  DB: D1Database
  /** konf-conference `ProgramDate`: the D1-owned CFP Slack channel. */
  CONFERENCE: {
    cfpChannel(orgId: string, conferenceId: string): Promise<string | null>
  }
  SANITY_PROJECT_ID: string
  SANITY_DATASET: string
  SANITY_API_TOKEN_READ?: string
  SANITY_API_TOKEN_WRITE?: string
  SLACK_BOT_TOKEN?: string
  TENANT_SECRETS_JSON?: string
  PLATFORM_ORG_ID?: string
}

type Reader = {
  fetch<T>(query: string, params: Record<string, unknown>): Promise<T>
}
type Writer = {
  transaction(): {
    create(doc: Record<string, unknown>): unknown
    commit(): Promise<unknown>
  }
}

export interface Deps {
  db: D1Database
  read: Reader
  /** Null without SANITY_API_TOKEN_WRITE: no in-app items. */
  write: Writer | null
  fetch: typeof fetch
  env: DataEnv
  now: () => Date
}

export type Outcome = 'refused' | 'duplicate' | 'sent'

const log = (event: string, fields: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...fields }))
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'unknown')

const TYPES = new Set(['proposal.submitted', 'proposal.withdrawn'])
const nonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 200

function valid(e: unknown): e is NotificationEvent {
  if (!e || typeof e !== 'object') return false
  const o = e as Record<string, unknown>
  return (
    TYPES.has(o.type as string) &&
    ['id', 'orgId', 'conferenceId', 'proposalId', 'actorSpeakerId'].every((k) =>
      nonEmpty(o[k]),
    ) &&
    (o.type !== 'proposal.withdrawn' || typeof o.previousStatus === 'string')
  )
}

// The tenant is part of the filter: a proposal of another conference or org
// reads as null, exactly like a missing one.
export const PROPOSAL = `*[_type == "talk" && _id == $proposalId && conference._ref == $conferenceId && conference->organization._ref == $orgId][0]{
  _id, title, status, withdrawnReason,
  "speakers": speakers[]->{ _id, name, email },
  "conference": conference->{ domains, "teams": teams[0...50]{ key, "members": members[]._ref } },
  "organization": conference->organization->{ featureOverrides }
}`
// getOrganizerSpeakerIdsForOrg (src/lib/notification/sanity.ts).
// groq-global-scoped: speaker ids from the org's own conferences' organizers.
export const ORGANIZERS = `*[_type == "speaker" && _id in *[_type == "conference" && organization._ref == $orgId].organizers[]._ref][0...200]._id`
// speakersWithoutOtherConfirmedTalk (src/server/routers/proposal.ts).
export const OTHER_CONFIRMED = `*[_type == "talk" && conference._ref == $conferenceId && status == "confirmed" && _id != $proposalId].speakers[]._ref`

type Override = { feature?: string; enabled?: boolean; expiresAt?: string }
interface Proposal {
  _id: string
  title?: string
  status?: string
  withdrawnReason?: string
  speakers?: ({ _id?: string; name?: string; email?: string } | null)[]
  conference?: {
    domains?: string[]
    teams?: { key?: string; members?: string[] }[]
  }
  organization?: { featureOverrides?: Override[] } | null
}

/**
 * resolveConferenceSlackToken (src/lib/slack/token.ts): the org's own token
 * from TENANT_SECRETS_JSON, else the platform token iff the slack-mirror gate
 * (src/lib/features/slack.ts) passes. `slack-mirror` is `internal` in the
 * registry, so no plan grants it: the last active override decides, and
 * without one only PLATFORM_ORG_ID has it.
 */
export function slackToken(
  env: DataEnv,
  orgId: string,
  overrides: Override[] | undefined,
  now: Date,
): string | undefined {
  try {
    const own = env.TENANT_SECRETS_JSON
      ? JSON.parse(env.TENANT_SECRETS_JSON)?.[orgId]?.slack
      : undefined
    if (
      own &&
      typeof own === 'object' &&
      !Array.isArray(own) &&
      Object.keys(own).length > 0 &&
      own.botToken
    )
      return String(own.botToken)
  } catch {
    log('notify.tenant_secrets_invalid', {})
  }
  let mirror: boolean | undefined
  for (const o of overrides ?? []) {
    if (o?.feature !== 'slack-mirror') continue
    if (o.expiresAt) {
      const t = Date.parse(o.expiresAt)
      if (Number.isNaN(t) || t <= now.getTime()) continue
    }
    mirror = !!o.enabled
  }
  const platform = env.PLATFORM_ORG_ID?.trim()
  if (mirror ?? (!!platform && orgId === platform)) return env.SLACK_BOT_TOKEN
  return undefined
}

async function ticketsToCancel(
  deps: Deps,
  p: Proposal,
  conferenceId: string,
): Promise<TicketCancellation> {
  const all = (p.speakers ?? []).filter(
    (s): s is { _id: string; name?: string; email?: string } => !!s?._id,
  )
  const entry = (s: (typeof all)[number]) => ({
    name: s.name ?? 'Unknown',
    email: s.email,
  })
  try {
    const busy = new Set(
      (await deps.read.fetch<string[] | null>(OTHER_CONFIRMED, {
        conferenceId,
        proposalId: p._id,
      })) ?? [],
    )
    return {
      speakers: all.filter((s) => !busy.has(s._id)).map(entry),
      unfiltered: false,
    }
  } catch {
    return { speakers: all.map(entry), unfiltered: true }
  }
}

async function postSlack(
  deps: Deps,
  e: NotificationEvent,
  p: Proposal,
  action: 'submit' | 'withdraw',
) {
  const tickets =
    e.type === 'proposal.withdrawn' && e.previousStatus === 'confirmed'
      ? await ticketsToCancel(deps, p, e.conferenceId)
      : undefined
  // The site's skip rule. A cfp withdrawal posts no thread message and is the
  // speaker's own, so it never applies here; kept so the rule stays one rule.
  if (
    isSelfWithdrawInThread({
      action,
      isOrganizer: false,
      postedToThread: false,
      ticketCancellation: tickets,
    })
  )
    return
  const channel = await deps.env.CONFERENCE.cfpChannel(e.orgId, e.conferenceId)
  const token = slackToken(
    deps.env,
    e.orgId,
    p.organization?.featureOverrides,
    deps.now(),
  )
  if (!token || !channel) {
    log('notify.slack_skipped', {
      id: e.id,
      reason: token ? 'no channel' : 'no token',
    })
    return
  }
  const speakerNames =
    (p.speakers ?? []).map((s) => s?.name || 'Unknown').join(', ') || 'Unknown'
  const blocks = proposalAlertBlocks({
    action,
    proposalId: p._id,
    title: p.title ?? '',
    speakerNames,
    domain: p.conference?.domains?.[0] ?? null,
    reason: action === 'withdraw' ? p.withdrawnReason : undefined,
    ticketCancellation: tickets,
  })
  const res = await deps.fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      channel,
      blocks,
      // PLATFORM_NAME (src/lib/branding/platform.ts), as postSlackMessage.
      text: 'Notification from Konf',
    }),
  })
  if (!res.ok) throw new Error(`Slack API HTTP ${res.status}`)
  const data = (await res.json()) as { ok: boolean; error?: string }
  if (!data.ok) throw new Error(`Slack API error: ${data.error}`)
}

async function writeInApp(
  deps: Deps,
  e: NotificationEvent,
  p: Proposal,
  action: 'submit' | 'withdraw',
) {
  if (!deps.write) return log('notify.inapp_skipped', { id: e.id })
  // resolveRoutedOrganizerIds: the `cfp` team when it has members, else
  // every organizer of the org.
  const team = p.conference?.teams?.find((t) => t?.key === 'cfp')
  const organizerIds = team?.members?.length
    ? team.members
    : ((await deps.read.fetch<string[] | null>(ORGANIZERS, {
        orgId: e.orgId,
      })) ?? [])
  const items = organizerProposalItems({
    action,
    organizerIds,
    actorId: e.actorSpeakerId,
    conferenceId: e.conferenceId,
    proposalId: p._id,
    title: p.title ?? '',
    reason: p.withdrawnReason,
  })
  if (!items.length) return
  // One transaction for the whole fan-out.
  const tx = deps.write.transaction()
  const createdAt = deps.now().toISOString()
  for (const item of items) tx.create(notificationDocument(item, createdAt))
  await tx.commit()
}

export async function send(deps: Deps, e: unknown): Promise<Outcome> {
  if (!valid(e)) {
    log('notify.refused', {
      reason: 'invalid event',
      type: (e as { type?: unknown } | null)?.type,
    })
    return 'refused'
  }
  const p = await deps.read.fetch<Proposal | null>(PROPOSAL, {
    proposalId: e.proposalId,
    conferenceId: e.conferenceId,
    orgId: e.orgId,
  })
  const action = e.type === 'proposal.submitted' ? 'submit' : 'withdraw'
  const status = action === 'submit' ? 'submitted' : 'withdrawn'
  if (
    !p?._id ||
    p.status !== status ||
    !(p.speakers ?? []).some((s) => s?._id === e.actorSpeakerId)
  ) {
    log('notify.refused', { id: e.id, reason: 'proposal not in tenant' })
    return 'refused'
  }
  // ponytail: claim-then-send, so a crash after the claim drops that event
  // rather than double-sending; add a status column if retries matter.
  const claim = await rawDb(deps.db)
    .prepare(
      'INSERT OR IGNORE INTO sent_event (id, type, org_id, created_at) VALUES (?, ?, ?, ?)',
    )
    .bind(e.id, e.type, e.orgId, deps.now().toISOString())
    .run()
  if (!claim.meta.changes) {
    log('notify.duplicate', { id: e.id })
    return 'duplicate'
  }
  const results = await Promise.allSettled([
    postSlack(deps, e, p, action),
    writeInApp(deps, e, p, action),
  ])
  for (const [i, r] of results.entries())
    if (r.status === 'rejected')
      console.error(
        JSON.stringify({
          event: 'notify.failed',
          channel: i ? 'inapp' : 'slack',
          id: e.id,
          error: errMsg(r.reason),
        }),
      )
  return 'sent'
}

export function createData(env: DataEnv) {
  const client = (token?: string) =>
    createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      apiVersion: '2023-05-03',
      // Read right after cfp's commit: no CDN.
      useCdn: false,
      token,
      requestTagPrefix: 'notifications',
    })
  const deps: Deps = {
    db: env.DB,
    read: client(env.SANITY_API_TOKEN_READ),
    write: env.SANITY_API_TOKEN_WRITE
      ? client(env.SANITY_API_TOKEN_WRITE)
      : null,
    fetch: (...a) => fetch(...a),
    env,
    now: () => new Date(),
  }
  return {
    /** Never rejects. */
    send: (e: unknown) =>
      send(deps, e).catch((err) => {
        console.error(
          JSON.stringify({ event: 'notify.failed', error: errMsg(err) }),
        )
        return 'refused' as Outcome
      }),
  }
}
