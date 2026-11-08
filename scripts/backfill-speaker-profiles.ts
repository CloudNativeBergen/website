#!/usr/bin/env tsx

/**
 * Sanity speakers -> identity D1 `speaker_profile` import (#2094, #2022).
 * READ-ONLY: it reads Sanity and two local identity export files, and writes
 * a SQL file plus a report. It never connects to D1 and never deletes.
 *
 * ADDITIONS ONLY: every row is `INSERT ... ON CONFLICT(user_id) DO NOTHING`,
 * so a profile the person already has is never overwritten. Every imported
 * profile is `private` (owner decision, #2022); the opt-in nudge does the rest.
 *
 * Matching, safe keys only (a wrong match hands one person's profile to another):
 *   1. a Sanity `providers[]` entry `<providerId>:<accountId>` equal to an
 *      identity `account` row;
 *   2. a Sanity `knownEmails[]` entry (login-verified) equal to an identity
 *      `user.email` with `emailVerified` = 1.
 * The display `email` and the slug are never used. A speaker matching two
 * users, or a user matched by two speakers, is skipped as ambiguous.
 *
 * Usage:
 *   wrangler d1 execute <identity-db> --remote --json --command "SELECT id, email, emailVerified FROM user" > users.json
 *   wrangler d1 execute <identity-db> --remote --json --command "SELECT userId, providerId, accountId FROM account" > accounts.json
 *   fnox exec -- pnpm tsx scripts/backfill-speaker-profiles.ts users.json accounts.json [--out <dir>] [--verbose]
 * <dir> defaults to tmp/speaker-import (gitignored).
 * Writes <dir>/speaker-profiles.sql and <dir>/speaker-profiles-report.json.
 * Apply with `wrangler d1 execute <identity-db> --remote --file <dir>/speaker-profiles.sql`,
 * then delete both files and the exports: they hold PII.
 */

import { randomUUID } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { readRows, type IdentityUser } from './backfill-identity-members'
import { requireReadToken } from './backfill-conference'

export interface SanitySpeaker {
  _id: string
  name?: string | null
  bio?: string | null
  links?: string[] | null
  imageURL?: string | null
  providers?: string[] | null
  knownEmails?: string[] | null
  ticketGrantEmails?: string[] | null
  email?: string | null // fetched only to prove it is never matched on
  publicProfile?: boolean | null
}
export interface IdentityAccount {
  userId: string
  providerId: string
  accountId: string
}

export type SkipReason = 'no-user' | 'ambiguous' | 'invalid'
export interface ReportRow {
  speakerId: string
  status: 'matched' | 'skipped'
  reason?: SkipReason
  userIds?: string[]
  matchedBy?: 'provider' | 'email' | 'provider+email'
  publicProfileConsent: boolean
  photoDropped: boolean
  linksDropped: number
}

const MAX_LINKS = 10
interface Profile {
  name: string
  bio: string
  photoKey: string | null
  links: string[]
  topics: string[]
}
// COPIED from services/identity/src/data/speaker-profiles.ts (importing it pulls
// Worker types into the root typecheck). Re-check them against that file
// before every run: a drift lets rows through that the API would refuse.
const MAX_NAME = 120
const MAX_BIO = 4000
const PHOTO_KEY = /^[A-Za-z0-9/_.-]{1,200}$/
const q = (s: string) => `'${s.replace(/'/g, "''")}'`

function httpsOnly(links: string[]) {
  const ok = links.filter((l) => {
    try {
      const u = new URL(l)
      return (
        l.length <= 500 && u.protocol === 'https:' && !u.username && !u.password
      )
    } catch {
      return false
    }
  })
  return ok.slice(0, MAX_LINKS)
}

export function planProfiles(
  speakers: SanitySpeaker[],
  users: IdentityUser[],
  accounts: IdentityAccount[],
) {
  const verified = new Map<string, string>()
  for (const u of users)
    if (u.emailVerified === true || Number(u.emailVerified) === 1)
      verified.set(u.email.trim().toLowerCase(), u.id)
  const byProvider = new Map(
    accounts.map((a) => [`${a.providerId}:${a.accountId}`, a.userId]),
  )

  const candidates = speakers.map((s) => {
    const viaProvider = new Set(
      (s.providers ?? []).flatMap((p) => byProvider.get(p) ?? []),
    )
    // A ticket-granted address was added by an organizer, never login-verified;
    // the live sign-in matcher skips it too (src/lib/speaker/sanity.ts, #1914).
    const granted = new Set(
      (s.ticketGrantEmails ?? []).map((e) => e.trim().toLowerCase()),
    )
    const viaEmail = new Set(
      (s.knownEmails ?? [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => !granted.has(e))
        .flatMap((e) => verified.get(e) ?? []),
    )
    return {
      s,
      viaProvider,
      viaEmail,
      all: new Set([...viaProvider, ...viaEmail]),
    }
  })
  const claims = new Map<string, number>()
  for (const c of candidates)
    for (const u of c.all) claims.set(u, (claims.get(u) ?? 0) + 1)

  const rows: {
    userId: string
    id: string
    profile: Profile
  }[] = []
  const report: ReportRow[] = []
  for (const { s, viaProvider, viaEmail, all } of candidates) {
    const userIds = [...all]
    const links = s.links ?? []
    const kept = httpsOnly(links)
    const photoKey =
      s.imageURL &&
      PHOTO_KEY.test(s.imageURL) &&
      !s.imageURL.split('/').includes('..')
        ? s.imageURL
        : null
    const base = {
      speakerId: s._id,
      publicProfileConsent: s.publicProfile === true,
      photoDropped: !!s.imageURL && !photoKey,
      linksDropped: links.length - kept.length,
    }
    const skip = (reason: SkipReason) =>
      report.push({ ...base, status: 'skipped', reason, userIds })
    if (userIds.length === 0) {
      skip('no-user')
      continue
    }
    // Never guess: one speaker -> two users, or two speakers -> one user.
    if (userIds.length > 1 || claims.get(userIds[0])! > 1) {
      skip('ambiguous')
      continue
    }
    const name = (s.name ?? '').trim()
    const bio = (s.bio ?? '').trim()
    if (!name || name.length > MAX_NAME || bio.length > MAX_BIO) {
      skip('invalid')
      continue
    }
    const profile: Profile = { name, bio, photoKey, links: kept, topics: [] }
    const [userId] = userIds
    rows.push({
      userId,
      id: randomUUID(),
      profile,
    })
    report.push({
      ...base,
      status: 'matched',
      userIds,
      matchedBy:
        viaProvider.has(userId) && viaEmail.has(userId)
          ? 'provider+email'
          : viaProvider.has(userId)
            ? 'provider'
            : 'email',
    })
  }
  return { rows, report }
}

/** Insert-only: an existing profile for the user is never touched. */
export function toSql(
  rows: ReturnType<typeof planProfiles>['rows'],
  now = Date.now(),
) {
  return (
    rows
      .map(
        ({ userId, id, profile: p }) =>
          `INSERT INTO speaker_profile (user_id, id, name, bio, photo_key, links, topics, visibility, created_at, updated_at) VALUES (${q(userId)}, ${q(id)}, ${q(p.name)}, ${q(p.bio)}, ${p.photoKey ? q(p.photoKey) : 'NULL'}, ${q(JSON.stringify(p.links))}, ${q(JSON.stringify(p.topics))}, 'private', ${now}, ${now}) ON CONFLICT(user_id) DO NOTHING;`,
      )
      .join('\n') + '\n'
  )
}

export function summarize(report: ReportRow[]) {
  const n = (f: (r: ReportRow) => boolean) => report.filter(f).length
  return {
    speakers: report.length,
    matched: n((r) => r.status === 'matched'),
    noUser: n((r) => r.reason === 'no-user'),
    ambiguous: n((r) => r.reason === 'ambiguous'),
    invalid: n((r) => r.reason === 'invalid'),
    publicProfileConsent: n(
      (r) => r.status === 'matched' && r.publicProfileConsent,
    ),
    photosDropped: n((r) => r.status === 'matched' && r.photoDropped),
  }
}

async function main() {
  const args = process.argv.slice(2)
  const i = args.indexOf('--out')
  const outDir = i < 0 ? 'tmp/speaker-import' : args[i + 1]
  if (!outDir || outDir.startsWith('--')) throw new Error('--out needs a value')
  const [usersPath, accountsPath] = args.filter(
    (a, j) => !a.startsWith('--') && args[j - 1] !== '--out',
  )
  if (!usersPath || !accountsPath)
    throw new Error(
      'usage: backfill-speaker-profiles.ts <users.json> <accounts.json> [--out <dir>] [--verbose]',
    )
  const { config } = await import('dotenv')
  config({ path: resolve(process.cwd(), '.env') })
  config({ path: resolve(process.cwd(), '.env.local'), override: true })
  requireReadToken()
  const { clientReadUncached } = await import('../src/lib/sanity/client')
  // groq-global: a platform-wide migration reads every speaker by design.
  const speakers: SanitySpeaker[] = await clientReadUncached.fetch(
    `*[_type == "speaker" && !(_id in path("drafts.**")) && !defined(erasedAt)]{
      _id, name, bio, links, imageURL, providers, knownEmails,
      "ticketGrantEmails": ticketEmailGrants[].email,
      "publicProfile": consent.publicProfile.granted
    }`,
  )
  const plan = planProfiles(
    speakers,
    readRows<IdentityUser>(usersPath),
    readRows<IdentityAccount>(accountsPath),
  )
  const s = summarize(plan.report)
  console.log(
    Object.entries(s)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
  )
  if (args.includes('--verbose'))
    for (const r of plan.report.filter((r) => r.status === 'skipped'))
      console.log(`  ${r.reason} ${r.speakerId} ${(r.userIds ?? []).join(',')}`)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'speaker-profiles.sql'), toSql(plan.rows))
  writeFileSync(
    join(outDir, 'speaker-profiles-report.json'),
    JSON.stringify(plan.report, null, 2) + '\n',
  )
  console.log(
    `wrote ${outDir}/speaker-profiles.sql and speaker-profiles-report.json (delete after applying)`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
