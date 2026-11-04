#!/usr/bin/env tsx

/**
 * Sanity organizers -> identity D1 `member` backfill (#1907). READ-ONLY: it
 * reads production Sanity and two local export files, and writes a SQL file
 * plus an unmatched report. It never connects to D1 or Cloudflare.
 *
 * Organizers of an org are the speakers referenced by `organizers[]` on that
 * org's published conferences (there is no `is_organizer` field in Sanity).
 * Drafts and erased speakers are excluded.
 *
 * Matching: a speaker's `knownEmails` (login, ticket or Studio) against the identity
 * `user.email` where `emailVerified` is true. Nothing else matches; no users
 * are created.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-identity-members.ts <users.json> [--members <members.json>] [--out <dir>]
 *
 * <users.json>   wrangler --json output (or a plain array) of id,email,emailVerified
 * <members.json> optional export of organizationId,userId; those pairs are skipped
 * Writes <dir>/identity-members.sql and <dir>/identity-members-unmatched.json.
 */

import { createHash } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'

/** Role every backfilled organizer gets. The owner decides this; see #1907. */
export const ORGANIZER_ROLE = 'admin'

export interface Organizer {
  orgId: string
  speakerId: string
  knownEmails: string[] | null
}
export interface IdentityUser {
  id: string
  email: string
  emailVerified: number | boolean
}
export interface ExistingMember {
  organizationId: string
  userId: string
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** Deterministic id: re-runs produce the same rows, so ON CONFLICT no-ops them. */
export const memberId = (orgId: string, userId: string) =>
  `mem-bf-${createHash('sha256').update(`${orgId}\0${userId}`).digest('hex').slice(0, 24)}`

export function planMembers(
  organizers: Organizer[],
  users: IdentityUser[],
  existing: ExistingMember[] = [],
) {
  const verified = new Map<string, string>()
  let caseCollisions = 0
  for (const u of users)
    if (u.emailVerified === true || Number(u.emailVerified) === 1) {
      const e = u.email.trim().toLowerCase()
      if (verified.has(e)) caseCollisions++
      verified.set(e, u.id)
    }
  // Never name the emails: the error lands in terminal scrollback and CI logs.
  if (caseCollisions)
    throw new Error(
      `${caseCollisions} verified identity email(s) collide when lowercased; resolve the duplicate users first`,
    )

  const seen = new Set(existing.map((m) => `${m.organizationId}\0${m.userId}`))
  const rows: {
    id: string
    organizationId: string
    userId: string
    role: string
  }[] = []
  const unmatched: { orgId: string; speakerId: string }[] = []
  let skippedExisting = 0

  for (const o of organizers) {
    const userId = (o.knownEmails ?? [])
      .map((e) => verified.get(e.trim().toLowerCase()))
      .find(Boolean)
    if (!userId) {
      unmatched.push({ orgId: o.orgId, speakerId: o.speakerId })
      continue
    }
    const key = `${o.orgId}\0${userId}`
    if (seen.has(key)) {
      skippedExisting++
      continue
    }
    seen.add(key)
    rows.push({
      id: memberId(o.orgId, userId),
      organizationId: o.orgId,
      userId,
      role: ORGANIZER_ROLE,
    })
  }
  return { rows, unmatched, skippedExisting }
}

/** Insert-only. ON CONFLICT DO NOTHING covers both the id PK and member_user_org_idx. */
export function toSql(rows: ReturnType<typeof planMembers>['rows']) {
  return (
    rows
      .map(
        (r) =>
          `INSERT INTO member (id, organizationId, userId, role) VALUES (${q(r.id)}, ${q(r.organizationId)}, ${q(r.userId)}, ${q(r.role)}) ON CONFLICT DO NOTHING;`,
      )
      .join('\n') + '\n'
  )
}

/** Accepts a plain array or wrangler's `[{ results: [...] }]` --json shape. */
export function readRows<T>(path: string): T[] {
  const data = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(data) && data[0]?.results ? data[0].results : data
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (n: string) => {
    const i = args.indexOf(n)
    if (i < 0) return undefined
    const v = args[i + 1]
    if (!v || v.startsWith('--')) {
      console.error(`${n} needs a path`)
      process.exit(2)
    }
    return v
  }
  const membersPath = flag('--members')
  const dir = flag('--out') ?? '.'
  const usersPath = args[0]
  if (!usersPath || usersPath.startsWith('--')) {
    console.error(
      'usage: backfill-identity-members.ts <users.json> [--members <members.json>] [--out <dir>]',
    )
    process.exit(2)
  }
  const { config } = await import('dotenv')
  config({ path: resolve(process.cwd(), '.env') })
  config({ path: resolve(process.cwd(), '.env.local'), override: true })
  const { clientReadUncached } = await import('../src/lib/sanity/client')

  // groq-global: a platform-wide migration reads every tenant by design.
  const flat: Organizer[] = await clientReadUncached
    .fetch(
      `
    *[_type == "conference" && !(_id in path("drafts.**")) && defined(organization._ref)]{
      "orgId": organization._ref, "ids": organizers[]._ref
    }`,
    )
    .then(async (cs: { orgId: string; ids: string[] | null }[]) => {
      const ids = [...new Set(cs.flatMap((c) => c.ids ?? []))]
      const speakers: { _id: string; knownEmails: string[] | null }[] =
        await clientReadUncached.fetch(
          `*[_type == "speaker" && _id in $ids && !defined(erasedAt)]{ _id, knownEmails }`,
          { ids },
        )
      const byId = new Map(speakers.map((s) => [s._id, s]))
      const out = new Map<string, Organizer>()
      for (const c of cs)
        for (const id of c.ids ?? []) {
          const s = byId.get(id)
          if (s)
            out.set(`${c.orgId}\0${id}`, {
              orgId: c.orgId,
              speakerId: id,
              knownEmails: s.knownEmails,
            })
        }
      return [...out.values()]
    })

  const plan = planMembers(
    flat,
    readRows<IdentityUser>(usersPath),
    membersPath ? readRows<ExistingMember>(membersPath) : [],
  )
  writeFileSync(join(dir, 'identity-members.sql'), toSql(plan.rows))
  writeFileSync(
    join(dir, 'identity-members-unmatched.json'),
    JSON.stringify(plan.unmatched, null, 2) + '\n',
  )
  console.log(
    `organizers ${flat.length}, members ${plan.rows.length}, already present ${plan.skippedExisting}, unmatched ${plan.unmatched.length}`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
