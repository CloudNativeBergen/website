// Sanity organizers -> identity `member` sync (#1907), run by the cron.
// Insert-only: grants missing `admin` rows, never updates, deletes or
// demotes. Orgs in MEMBER_SOURCE_ORGS have identity as their source: they
// get a drift check instead and are never granted (#1923). Matching and ids follow scripts/backfill-identity-members.ts (#1909).

import { can, principalOfRole } from '@runkonf/tenancy'
import { emit } from './push'
import { recordJobStatus, type MemberSyncDrift } from './job-status'

/** Role every synced organizer gets. The owner decided this; see #1907. */
export const ORGANIZER_ROLE = 'admin'

export interface SyncEnv {
  DB: D1Database
  SANITY_PROJECT_ID?: string
  SANITY_DATASET?: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ?: string
  /** Comma-separated org ids in drift mode. Empty: every org grants. */
  MEMBER_SOURCE_ORGS?: string
  /** wrangler secret put SLACK_MEMBER_DRIFT_WEBHOOK_URL (optional) */
  SLACK_MEMBER_DRIFT_WEBHOOK_URL?: string
}

// Organizers of an org are the speakers in `organizers[]` of its published
// conferences; drafts and erased speakers are excluded. Addresses an
// organizer linked from a ticket (`ticketEmailGrants`) never count: another
// org's organizer could otherwise link an address they control and get admin.
const CONFERENCES = `*[_type == "conference" && !(_id in path("drafts.**")) && defined(organization._ref)]{
  "orgId": organization._ref, "ids": organizers[]._ref
}`
const SPEAKERS = `*[_type == "speaker" && _id in $ids && !(_id in path("drafts.**")) && !defined(erasedAt)]{ _id, knownEmails, "granted": ticketEmailGrants[].email }`

const INSERT =
  'INSERT INTO member (id, organizationId, userId, role) VALUES (?1, ?2, ?3, ?4) ON CONFLICT DO NOTHING'

const log = (level: 'log' | 'warn' | 'error', event: string, f = {}) =>
  console[level](JSON.stringify({ event, ...f }))

/** Deterministic id, the same scheme as #1909: re-runs hit ON CONFLICT. */
export async function memberId(orgId: string, userId: string) {
  const d = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${orgId}\0${userId}`),
  )
  const hex = [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `mem-bf-${hex.slice(0, 24)}`
}

async function groq<T>(env: SyncEnv, query: string, params = {}): Promise<T> {
  const res = await fetch(
    `https://${env.SANITY_PROJECT_ID}.api.sanity.io/v2023-05-03/data/query/${env.SANITY_DATASET}`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.SANITY_API_TOKEN_READ}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, params }),
    },
  )
  if (!res.ok) throw new Error(`sanity ${res.status}`)
  return ((await res.json()) as { result: T }).result
}

interface Organizer {
  speakerId: string
  emails: string[]
}

/** orgId -> its organizers with their lowercased known emails, plus the
 * orgs with a readable published conference (their roster may be empty). */
async function organizerEmails(env: SyncEnv) {
  const cs = await groq<{ orgId: string; ids: string[] | null }[]>(
    env,
    CONFERENCES,
  )
  const ids = [...new Set(cs.flatMap((c) => c.ids ?? []))]
  const speakers = ids.length
    ? await groq<
        {
          _id: string
          knownEmails: string[] | null
          granted: (string | null)[] | null
        }[]
      >(env, SPEAKERS, { ids })
    : []
  const norm = (e: string) => e.trim().toLowerCase()
  const byId = new Map(
    speakers.map((s) => {
      const granted = new Set(
        (s.granted ?? []).filter(Boolean).map((e) => norm(e!)),
      )
      return [
        s._id,
        (s.knownEmails ?? []).map(norm).filter((e) => !granted.has(e)),
      ]
    }),
  )
  const out = new Map<string, Organizer[]>()
  for (const c of cs)
    for (const id of c.ids ?? []) {
      const emails = byId.get(id)
      if (!emails) continue
      const list = out.get(c.orgId) ?? []
      list.push({ speakerId: id, emails })
      out.set(c.orgId, list)
    }
  return { byOrg: out, confOrgs: new Set(cs.map((c) => c.orgId)) }
}

export async function syncMembers(env: SyncEnv) {
  const progress = {
    checked: 0,
    granted: 0,
    failed: false,
    drifted: [] as MemberSyncDrift[],
  }
  const ranAt = Date.now()
  try {
    return await runSync(env, progress)
  } catch (error) {
    progress.failed = true
    throw error
  } finally {
    // Failure takes precedence over drift, then a clean run: failed > drift > ok.
    await recordJobStatus(env.DB, {
      job: 'identity.member_sync',
      ran_at: ranAt,
      status: progress.failed
        ? 'failed'
        : progress.drifted.length
          ? 'drift'
          : 'ok',
      checked: progress.checked,
      affected: progress.drifted.length,
      granted: progress.granted,
      detail: JSON.stringify(progress.drifted),
    })
  }
}

interface Progress {
  checked: number
  granted: number
  failed: boolean
  drifted: MemberSyncDrift[]
}

async function runSync(env: SyncEnv, progress: Progress) {
  if (
    !env.SANITY_API_TOKEN_READ ||
    !env.SANITY_PROJECT_ID ||
    !env.SANITY_DATASET
  ) {
    progress.failed = true
    return log('error', 'identity.membership.sync_failed', {
      reason: 'missing_config',
    })
  }
  let byOrg: Map<string, Organizer[]>
  let confOrgs: Set<string>
  try {
    ;({ byOrg, confOrgs } = await organizerEmails(env))
  } catch (e) {
    progress.failed = true
    return log('error', 'identity.membership.sync_failed', {
      reason: 'sanity_read',
      error: String(e),
    })
  }
  // An unauthenticated read of a private dataset returns [], not an error.
  // No organizers anywhere never grants. Drift orgs with a published
  // conference still run: their roster is validly empty (#1947 review).
  const noOrganizers = byOrg.size === 0
  if (noOrganizers) progress.failed = true
  if (noOrganizers)
    log('error', 'identity.membership.sync_failed', { reason: 'no_organizers' })

  const { results: users } = await env.DB.prepare(
    'SELECT id, email FROM user WHERE emailVerified = 1',
  ).all<{ id: string; email: string }>()
  const verified = new Map<string, string | null>()
  let clashes = 0
  for (const u of users) {
    const e = u.email.trim().toLowerCase()
    if (verified.has(e)) {
      clashes++
      verified.set(e, null) // ambiguous: grant to neither
    } else verified.set(e, u.id)
  }
  // Counts only: never name the emails.
  if (clashes)
    log('error', 'identity.membership.email_case_clash', { count: clashes })

  const { results: orgs } = await env.DB.prepare(
    'SELECT id FROM organization',
  ).all<{ id: string }>()
  const sourceOrgs = new Set(
    (env.MEMBER_SOURCE_ORGS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  // A mistyped id would leave that org granting with no sign (#1949).
  const known = new Set(orgs.map((o) => o.id))
  for (const orgId of sourceOrgs)
    if (!known.has(orgId))
      log('warn', 'identity.membership.source_org_unknown', { orgId })
  let granted = 0
  for (const { id: orgId } of orgs) {
    progress.checked++
    const organizers = byOrg.get(orgId)
    if (noOrganizers && !(sourceOrgs.has(orgId) && confOrgs.has(orgId)))
      continue
    if (sourceOrgs.has(orgId)) {
      // Never grants. A drift or Slack failure must not stop the sync.
      await checkDrift(env, orgId, organizers ?? [], verified, progress).catch(
        (e) => {
          progress.failed = true
          log('error', 'identity.membership.drift_failed', {
            orgId,
            // Name only: a message is not ours to vet for emails.
            error: e instanceof Error ? e.name : 'unknown',
          })
        },
      )
      continue
    }
    if (!organizers?.length) {
      log('warn', 'identity.membership.org_skipped', {
        orgId,
        reason: 'no_organizers',
      })
      continue
    }
    const userIds = new Set<string>()
    for (const { emails } of organizers) {
      const userId = emails.map((e) => verified.get(e)).find(Boolean)
      if (userId) userIds.add(userId)
    }
    for (const userId of userIds) {
      const memberId_ = await memberId(orgId, userId)
      const { meta } = await env.DB.prepare(INSERT)
        .bind(memberId_, orgId, userId, ORGANIZER_ROLE)
        .run()
      if (meta.changes > 0) {
        granted++
        progress.granted = granted
        log('log', 'identity.membership.granted', {
          orgId,
          userId,
          memberId: memberId_,
        })
      }
    }
  }
  if (!noOrganizers) log('log', 'identity.membership.synced', { granted })
}

const DAY_MS = 24 * 3600 * 1000

/** Ids only: speaker ids for Sanity organizers, user ids for identity rows. */
export interface Drift {
  /** Speaker ids in organizers[] with no identity `member` row. */
  missingInIdentity: string[]
  /** User ids with a `member` row who are no Sanity organizer. */
  missingInSanity: string[]
  /** User ids in both whose role holds neither owner nor admin. */
  roleMismatch: string[]
  /** Owner count, set only when under two. A count: no ids. */
  ownersBelowTwo?: number
  /** Of missingInIdentity, the speaker ids with a pending, unexpired
   * invitation to one of their known emails. Set only when some are (#1949). */
  invitePending?: string[]
}

/** Same rule as the LAST_OWNER trigger (migration 0003): strip space, tab,
 * CR, LF anywhere, lowercase, then match a whole comma-separated item. */
export const isOwner = (role: string) =>
  role
    .toLowerCase()
    .replace(/[ \t\n\r]/g, '')
    .split(',')
    .includes('owner')

/** Compares, writes no `member` row, alerts on change or once a day. */
async function checkDrift(
  env: SyncEnv,
  orgId: string,
  organizers: Organizer[],
  verified: Map<string, string | null>,
  progress: Progress,
) {
  const { results: rows } = await env.DB.prepare(
    'SELECT userId, role FROM member WHERE organizationId = ?1',
  )
    .bind(orgId)
    .all<{ userId: string; role: string }>()
  const roles = new Map(rows.map((r) => [r.userId, r.role]))
  const inSanity = new Set<string>()
  const missingInIdentity: string[] = []
  const missingEmails: Organizer[] = []
  for (const o of organizers) {
    const userId = o.emails.map((e) => verified.get(e)).find(Boolean)
    if (userId) inSanity.add(userId)
    if (!userId || !roles.has(userId)) {
      missingInIdentity.push(o.speakerId)
      missingEmails.push(o)
    }
  }
  // An expired invitation stays `pending` until retired, so expiry is checked.
  const { results: pending } = missingEmails.length
    ? await env.DB.prepare(
        "SELECT email FROM invitation WHERE organizationId = ?1 AND status = 'pending' AND expiresAt > ?2",
      )
        .bind(orgId, Date.now())
        .all<{ email: string }>()
    : { results: [] }
  // Normalised as organizerEmails does: SQLite's trim keeps tabs and newlines.
  const invited = new Set(pending.map((r) => r.email.trim().toLowerCase()))
  const invitePending = [
    ...new Set(
      missingEmails
        .filter((o) => o.emails.some((e) => invited.has(e)))
        .map((o) => o.speakerId),
    ),
  ].sort()
  // As authorization reads a role (members.ts asMember: parseOrgRoles), so
  // a role it refuses, such as "ow ner", is a mismatch. ownersBelowTwo uses
  // isOwner instead, the LAST_OWNER trigger's rule: the two differ on purpose
  // (#1949).
  const roleOk = (r: string) => can(principalOfRole(r), 'org.manage_members')
  const drift: Drift = {
    missingInIdentity: [...new Set(missingInIdentity)].sort(),
    missingInSanity: [...roles.keys()].filter((u) => !inSanity.has(u)).sort(),
    roleMismatch: [...inSanity]
      .filter((u) => roles.has(u) && !roleOk(roles.get(u)!))
      .sort(),
  }
  if (invitePending.length) drift.invitePending = invitePending
  // A pending invite never counts as an owner: it may never be accepted.
  const owners = rows.filter((r) => isOwner(r.role)).length
  if (owners < 2) drift.ownersBelowTwo = owners
  const counts: MemberSyncDrift['counts'] = {
    missingInIdentity: drift.missingInIdentity.length,
    missingInSanity: drift.missingInSanity.length,
    roleMismatch: drift.roleMismatch.length,
    ...(drift.ownersBelowTwo === undefined ? {} : { ownersBelowTwo: 1 }),
    ...(invitePending.length ? { invitePending: invitePending.length } : {}),
  }
  if (Object.values(counts).every((n) => n === 0)) {
    // Clean: forget the last alert, so a recurrence posts at once.
    await env.DB.prepare(
      'DELETE FROM member_drift_alert WHERE organizationId = ?1',
    )
      .bind(orgId)
      .run()
    return log('log', 'identity.membership.drift_clean', { orgId })
  }
  progress.drifted.push({ orgId, counts })
  log('warn', 'identity.membership.drift', { orgId, counts, ...drift })

  const url = env.SLACK_MEMBER_DRIFT_WEBHOOK_URL
  if (!url) return
  const hash = await sha256(JSON.stringify(drift))
  const last = await env.DB.prepare(
    'SELECT hash, postedAt FROM member_drift_alert WHERE organizationId = ?1',
  )
    .bind(orgId)
    .first<{ hash: string; postedAt: number }>()
  const now = Date.now()
  // Post when the drift set changes; while it stays the same, once a day.
  if (last?.hash === hash && now - last.postedAt < DAY_MS)
    return log('log', 'identity.membership.drift_deduped', { orgId })
  // Same gate and dedupe as the Slack post: ids only (kontroll#61).
  emit({ type: 'membership.drift', organizationId: orgId })
  // Never the URL in a log: it is the webhook's secret.
  const failed = (detail: { status: number } | { error: string }) => {
    progress.failed = true
    return log('error', 'identity.membership.drift_alert_failed', {
      orgId,
      ...detail,
    })
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: slackText(orgId, drift) }),
      signal: AbortSignal.timeout(5000),
      // Never follow a 307/308 (it would re-POST the drift elsewhere, #1949):
      // the 3xx fails the status check below. Workers has no 'error' mode.
      redirect: 'manual',
    })
  } catch (e) {
    // Name only: a message may carry the URL.
    return failed({ error: e instanceof Error ? e.name : 'unknown' })
  }
  if (!res.ok) return failed({ status: res.status })
  await env.DB.prepare(
    'INSERT INTO member_drift_alert (organizationId, hash, postedAt) VALUES (?1, ?2, ?3) ON CONFLICT (organizationId) DO UPDATE SET hash = excluded.hash, postedAt = excluded.postedAt',
  )
    .bind(orgId, hash, now)
    .run()
  log('log', 'identity.membership.drift_alerted', { orgId })
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Ids and counts only, never emails. */
export function slackText(orgId: string, d: Drift) {
  const line = (label: string, ids: string[]) =>
    `${label}: ${ids.length}${ids.length ? ` (${ids.join(', ')})` : ''}`
  return [
    `Organizer membership drift in org ${orgId}`,
    line('In Sanity, missing in identity (speaker ids)', d.missingInIdentity),
    ...(d.invitePending
      ? [line('  of them invited, pending (speaker ids)', d.invitePending)]
      : []),
    line('In identity, missing in Sanity (user ids)', d.missingInSanity),
    line('Role neither owner nor admin (user ids)', d.roleMismatch),
    ...(d.ownersBelowTwo === undefined
      ? []
      : [`Owners below two: ${d.ownersBelowTwo}`]),
  ].join('\n')
}
