// Sanity organizers -> identity `member` sync (#1907), run by the cron.
// Insert-only: grants missing `admin` rows, never updates, deletes or
// demotes. Matching and ids follow scripts/backfill-identity-members.ts (#1909).

/** Role every synced organizer gets. The owner decided this; see #1907. */
export const ORGANIZER_ROLE = 'admin'

export interface SyncEnv {
  DB: D1Database
  SANITY_PROJECT_ID?: string
  SANITY_DATASET?: string
  /** wrangler secret put SANITY_API_TOKEN_READ (per environment) */
  SANITY_API_TOKEN_READ?: string
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

/** orgId -> lowercased known emails of its organizers. */
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
  const out = new Map<string, string[][]>()
  for (const c of cs)
    for (const id of c.ids ?? []) {
      const emails = byId.get(id)
      if (!emails) continue
      const list = out.get(c.orgId) ?? []
      list.push(emails)
      out.set(c.orgId, list)
    }
  return out
}

export async function syncMembers(env: SyncEnv) {
  if (
    !env.SANITY_API_TOKEN_READ ||
    !env.SANITY_PROJECT_ID ||
    !env.SANITY_DATASET
  ) {
    return log('error', 'identity.membership.sync_failed', {
      reason: 'missing_config',
    })
  }
  let byOrg: Map<string, string[][]>
  try {
    byOrg = await organizerEmails(env)
  } catch (e) {
    return log('error', 'identity.membership.sync_failed', {
      reason: 'sanity_read',
      error: String(e),
    })
  }
  // An unauthenticated read of a private dataset returns [], not an error.
  if (byOrg.size === 0) {
    return log('error', 'identity.membership.sync_failed', {
      reason: 'no_organizers',
    })
  }

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
  let granted = 0
  for (const { id: orgId } of orgs) {
    const organizers = byOrg.get(orgId)
    if (!organizers?.length) {
      log('warn', 'identity.membership.org_skipped', {
        orgId,
        reason: 'no_organizers',
      })
      continue
    }
    const userIds = new Set<string>()
    for (const emails of organizers) {
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
        log('log', 'identity.membership.granted', {
          orgId,
          userId,
          memberId: memberId_,
        })
      }
    }
  }
  log('log', 'identity.membership.synced', { granted })
}
