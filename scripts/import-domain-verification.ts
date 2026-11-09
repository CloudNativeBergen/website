#!/usr/bin/env tsx

/**
 * Sanity `domainVerification` -> tenant-directory D1 `domains` import, with a
 * parity check (#2207 phase 4). It lives here, not in services/, because
 * services may not import Sanity (eslint, #1800). It reads Sanity and a D1
 * dump the operator made, and writes one local SQL file. It NEVER applies the
 * SQL and never talks to D1. Default is a dry run.
 *
 * Usage (see docs/DATA_OWNERSHIP.md, "Importing domain verification"):
 *   pnpm tsx scripts/import-domain-verification.ts --d1 <dump.json>             (dry run)
 *   pnpm tsx scripts/import-domain-verification.ts --d1 <dump.json> --write [--out <dir>]
 *   pnpm tsx scripts/import-domain-verification.ts --d1 <dump.json> --verify
 *
 * <dump.json> is the `--json` output of
 *   wrangler d1 execute konf-tenant-directory --remote --json --command
 *     "SELECT id, org_id FROM conferences; SELECT * FROM domains"
 *
 * Column ownership (which side wins):
 * - A row with `claimed_at` set was claimed through claimDomain in D1. D1 is
 *   the newer truth for it and the import changes NOTHING on that row (the
 *   ON CONFLICT update has `WHERE domains.claimed_at IS NULL`).
 * - On every other row Sanity wins for the 0013 verification columns: method,
 *   token, status, verified_at, last_success_at, first_failure_at,
 *   grace_until, consecutive_failures, consecutive_soft_failures, last_error.
 * - D1 always keeps: org_id, conference_id, kind, the legacy `verification`
 *   column (it drives routing until the phase 6 reader switch), checked_at,
 *   cf_custom_hostname_id, claimed_at, last_recheck_at, last_error_code. A new
 *   row gets legacy `verification` 'pending', never 'verified', because
 *   tenantByHost routes on it: this import never changes live routing. Hosts
 *   where it disagrees with Sanity are listed as routing cutover candidates
 *   (phase 6) in the dry run and in --verify, informational only.
 * - The platform stamp UPDATE also skips claimed rows.
 * - --out defaults to tmp/ and must stay inside it (gitignored).
 * - A row whose D1 conference differs from the Sanity doc's is not touched.
 *
 * Kinds: a `platform-owned` doc becomes method `platform` on the D1 platform
 * row (kind kept; a platform host D1 has not minted is skipped, never
 * guessed). `dns-txt` and `grandfathered` become `custom` rows with method
 * `dns-txt`; D1 has no grandfathered method, so an in-grace grandfathered
 * doc shows up as a --verify difference, which is the point.
 * The SQL also stamps method `platform`, status `verified` on platform rows
 * written before phase 3 (status still null).
 *
 * --verify computes, for every hostname in Sanity docs, routed
 * conference.domains and D1, the routing and allowlist verdicts on both sides
 * with the site's own isRoutingEligible / isAllowlistEligible, exits 1 on any
 * difference (platform rows with no Sanity doc excluded), and asserts 2026.cloudnativedays.no is verified on both.
 */

import { config } from 'dotenv'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import {
  isAllowlistEligible,
  isRoutingEligible,
} from '../src/lib/domain-verification/policy'
import {
  isDevOnlyHost,
  isWildcardEntry,
} from '../packages/tenancy/src/challenge'
import { normalizeDomain } from '../src/lib/conference/domains'
import type { DomainVerificationRecord } from '../src/lib/domain-verification/types'
import { PLATFORM_DOMAIN } from '../services/tenant-directory/src/data/naming'

export const MUST_VERIFY = '2026.cloudnativedays.no'

export interface SanityConf {
  _id: string
  domains?: string[] | null
}
export interface D1Row {
  hostname: string
  org_id: string
  conference_id: string
  kind: 'platform-edition' | 'platform-alias' | 'custom'
  verification: 'pending' | 'verified' | 'failed'
  method: 'dns-txt' | 'platform' | null
  token: string | null
  status: DomainVerificationRecord['status'] | null
  verified_at: number | null
  last_success_at: number | null
  first_failure_at: number | null
  grace_until: number | null
  consecutive_failures: number
  consecutive_soft_failures: number
  last_error: string | null
  claimed_at: number | null
}
export interface D1Dump {
  conferences: Map<string, string>
  domains: Map<string, D1Row>
}
type Row = Omit<D1Row, 'claimed_at'> & { verification: string }

/** Wildcards and dev hosts are neither imported nor compared. */
export function skipHost(host: string) {
  return (
    isWildcardEntry(host) ||
    isDevOnlyHost(host) ||
    host.endsWith('.vercel.app') ||
    host.includes('ngrok')
  )
}

/** Parses `wrangler d1 execute --json` output: an array of statement results. */
export function parseD1Dump(json: string): D1Dump {
  const rows = (
    JSON.parse(json) as { results?: Record<string, unknown>[] }[]
  ).flatMap((r) => r.results ?? [])
  const dump: D1Dump = { conferences: new Map(), domains: new Map() }
  for (const r of rows) {
    if (typeof r.hostname === 'string')
      dump.domains.set(r.hostname, r as unknown as D1Row)
    else if (typeof r.id === 'string' && typeof r.org_id === 'string')
      dump.conferences.set(r.id, r.org_id)
  }
  if (dump.conferences.size === 0)
    throw new Error('D1 dump has no conferences rows; see the usage header')
  return dump
}

const ms = (iso: string | null) => (iso ? Date.parse(iso) || null : null)
const iso = (n: number | null) =>
  n === null ? null : new Date(n).toISOString()

/** Sanity docs to D1 rows. Orphans and conflicts are skipped and reported. */
export function planImport(docs: DomainVerificationRecord[], d1: D1Dump) {
  const rows: Row[] = []
  const skipped: string[] = []
  for (const doc of [...docs].sort((a, b) =>
    a.hostname.localeCompare(b.hostname),
  )) {
    const host = normalizeDomain(doc.hostname)
    const why = (s: string) => skipped.push(`${host}: ${s}`)
    if (skipHost(host)) continue
    const orgId = doc.conferenceId && d1.conferences.get(doc.conferenceId)
    if (!orgId) {
      why(`conference ${doc.conferenceId ?? '(none)'} not in D1`)
      continue
    }
    const existing = d1.domains.get(host)
    if (existing && existing.conference_id !== doc.conferenceId) {
      why(`D1 routes it to conference ${existing.conference_id}`)
      continue
    }
    if (existing?.claimed_at != null) {
      why('claimed in D1; D1 wins')
      continue
    }
    const platform = doc.method === 'platform-owned'
    if (existing && platform !== (existing.kind !== 'custom')) {
      why(`method ${doc.method} vs D1 kind ${existing?.kind}`)
      continue
    }
    if (platform && !existing) {
      why('platform host not minted in D1')
      continue
    }
    rows.push({
      hostname: host,
      org_id: orgId,
      conference_id: doc.conferenceId!,
      kind: existing?.kind ?? 'custom',
      // Never 'verified': tenantByHost routes on this column (phase 6 switch).
      verification: 'pending',
      method: platform ? 'platform' : 'dns-txt',
      token: doc.token || null,
      status: doc.status,
      verified_at: ms(doc.verifiedAt),
      last_success_at: ms(doc.lastSuccessAt),
      first_failure_at: ms(doc.firstFailureAt),
      grace_until: ms(doc.graceUntil),
      consecutive_failures: doc.consecutiveFailures,
      consecutive_soft_failures: doc.consecutiveSoftFailures,
      last_error: doc.lastError,
    })
  }
  return { rows, skipped }
}

const UPDATED = [
  'method',
  'token',
  'status',
  'verified_at',
  'last_success_at',
  'first_failure_at',
  'grace_until',
  'consecutive_failures',
  'consecutive_soft_failures',
  'last_error',
] as const

const lit = (v: unknown) =>
  v === null || v === undefined
    ? 'NULL'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`

/** Idempotent: re-running the same file leaves D1 unchanged. */
export function toSql(rows: Row[]) {
  const cols = Object.keys(rows[0] ?? {}) as (keyof Row)[]
  const out = rows.map(
    (r) =>
      `INSERT INTO domains (${cols.join(', ')}) VALUES (${cols.map((c) => lit(r[c])).join(', ')})\n` +
      `  ON CONFLICT(hostname) DO UPDATE SET ${UPDATED.map((c) => `${c} = excluded.${c}`).join(', ')}\n` +
      `  WHERE domains.claimed_at IS NULL AND domains.conference_id = excluded.conference_id;`,
  )
  out.push(
    "UPDATE domains SET method = 'platform', status = 'verified' WHERE kind IN ('platform-edition', 'platform-alias') AND status IS NULL AND claimed_at IS NULL;",
  )
  return out.join('\n') + '\n'
}

/** A D1 row as the policy reads it; null when it carries no verification state. */
export function d1Record(r: D1Row): DomainVerificationRecord | null {
  if (!r.status) return null
  return {
    _id: r.hostname,
    hostname: r.hostname,
    conferenceId: r.conference_id,
    token: r.token ?? '',
    status: r.status,
    method: r.method === 'platform' ? 'platform-owned' : 'dns-txt',
    graceUntil: iso(r.grace_until),
    verifiedAt: iso(r.verified_at),
    lastSuccessAt: iso(r.last_success_at),
    lastCheckedAt: null,
    firstFailureAt: iso(r.first_failure_at),
    consecutiveFailures: r.consecutive_failures,
    consecutiveSoftFailures: r.consecutive_soft_failures,
    lastError: r.last_error,
  }
}

/** Every routing/allowlist verdict difference, plus the MUST_VERIFY assert. */
export function parity(
  docs: DomainVerificationRecord[],
  confs: SanityConf[],
  d1: D1Dump,
  now: Date,
) {
  const sanity = new Map(docs.map((d) => [normalizeDomain(d.hostname), d]))
  const hosts = new Set([
    ...sanity.keys(),
    ...confs
      .filter((c) => d1.conferences.has(c._id))
      .flatMap((c) => (c.domains ?? []).map(normalizeDomain)),
    ...d1.domains.keys(),
  ])
  const diffs: string[] = []
  const verdict = (r: DomainVerificationRecord | null | undefined) =>
    r
      ? {
          routing: isRoutingEligible(r, now),
          allowlist: isAllowlistEligible(r, now),
        }
      : { routing: false, allowlist: false }
  for (const host of [...hosts].sort()) {
    if (!host || skipHost(host)) continue
    const row = d1.domains.get(host)
    // Platform rows (phase 3) have no Sanity doc by design; phase 6 decides.
    if (row && row.kind !== 'custom' && !sanity.has(host)) continue
    const s = verdict(sanity.get(host))
    const d = verdict(row && d1Record(row))
    for (const k of ['routing', 'allowlist'] as const)
      if (s[k] !== d[k]) diffs.push(`${host}: ${k} sanity=${s[k]} d1=${d[k]}`)
    if (
      host === MUST_VERIFY &&
      !(s.routing && d.routing && s.allowlist && d.allowlist)
    )
      diffs.push(`${host}: MUST be verified on both sides`)
  }
  if (!hosts.has(MUST_VERIFY))
    diffs.push(`${MUST_VERIFY}: missing on both sides`)
  return { hosts: hosts.size, diffs }
}

/**
 * Hosts whose legacy `verification` column (what tenantByHost routes on today)
 * disagrees with Sanity's routing verdict. Informational: the phase 6 reader
 * switch decides them; this import never changes the legacy column.
 */
export function cutoverCandidates(
  docs: DomainVerificationRecord[],
  d1: D1Dump,
  now: Date,
) {
  const sanity = new Map(docs.map((d) => [normalizeDomain(d.hostname), d]))
  const out: string[] = []
  for (const host of [
    ...new Set([...sanity.keys(), ...d1.domains.keys()]),
  ].sort()) {
    if (!host || skipHost(host)) continue
    const legacy = d1.domains.get(host)?.verification ?? 'absent'
    const doc = sanity.get(host)
    const routes = doc ? isRoutingEligible(doc, now) : false
    if ((legacy === 'verified') !== routes)
      out.push(`${host}: legacy=${legacy} sanity routing=${routes}`)
  }
  return out
}

/** Output must stay inside the gitignored tmp/: the SQL holds tokens. */
export function outDir(value: string | undefined, cwd = process.cwd()) {
  const dir = resolve(cwd, value ?? 'tmp')
  const tmp = resolve(cwd, 'tmp')
  if (dir !== tmp && !dir.startsWith(tmp + sep))
    throw new Error(`--out must be inside ${tmp} (gitignored); got ${dir}`)
  return dir
}

function arg(args: string[], flag: string) {
  const i = args.indexOf(flag)
  return i < 0 ? undefined : args[i + 1]
}

function printCutover(list: string[]) {
  console.log(
    `routing cutover candidates (phase 6), informational, NOT applied: ${list.length}`,
  )
  for (const c of list) console.log(`  ${c}`)
}

async function main() {
  config({ path: resolve(process.cwd(), '.env') })
  config({ path: resolve(process.cwd(), '.env.local'), override: true })
  // domain-import.sh pins the env's dataset; .env.local must not override it.
  if (process.env.KONF_IMPORT_DATASET)
    process.env.NEXT_PUBLIC_SANITY_DATASET = process.env.KONF_IMPORT_DATASET
  const { requireReadToken } = await import('./backfill-conference')
  const args = process.argv.slice(2)
  const dumpPath = arg(args, '--d1')
  if (!dumpPath) throw new Error('--d1 <wrangler --json dump> is required')
  requireReadToken()
  // isPlatformAllocated reads the zone from the environment.
  process.env.PLATFORM_DOMAIN_SUFFIX ??= PLATFORM_DOMAIN
  const d1 = parseD1Dump(readFileSync(dumpPath, 'utf8'))
  const { clientReadUncached } = await import('../src/lib/sanity/client')
  // groq-global: a platform-wide migration reads every hostname by design.
  const { docs, confs } = await clientReadUncached.fetch<{
    docs: DomainVerificationRecord[]
    confs: SanityConf[]
  }>(`{
    "docs": *[_type == "domainVerification" && !(_id in path("drafts.**"))]{
      _id, hostname, "conferenceId": conference._ref, token,
      "status": coalesce(status, "pending"), "method": coalesce(method, "dns-txt"),
      graceUntil, verifiedAt, lastSuccessAt, lastCheckedAt, firstFailureAt,
      "consecutiveFailures": coalesce(consecutiveFailures, 0),
      "consecutiveSoftFailures": coalesce(consecutiveSoftFailures, 0), lastError
    },
    "confs": *[_type == "conference" && !(_id in path("drafts.**"))]{ _id, domains }
  }`)
  for (const d of docs) {
    for (const k of [
      'graceUntil',
      'verifiedAt',
      'lastSuccessAt',
      'lastCheckedAt',
      'firstFailureAt',
      'lastError',
      'conferenceId',
    ] as const)
      d[k] ??= null
  }

  if (args.includes('--verify')) {
    const { hosts, diffs } = parity(docs, confs, d1, new Date())
    console.log(`hostnames ${hosts}, differences ${diffs.length}`)
    for (const d of diffs) console.log(`  ${d}`)
    printCutover(cutoverCandidates(docs, d1, new Date()))
    if (diffs.length) process.exit(1)
    console.log(`parity OK; ${MUST_VERIFY} verified on both sides`)
    return
  }

  const { rows, skipped } = planImport(docs, d1)
  console.log(
    `docs ${docs.length}, rows ${rows.length}, skipped ${skipped.length}`,
  )
  for (const s of skipped) console.log(`  skipped ${s}`)
  printCutover(cutoverCandidates(docs, d1, new Date()))
  console.log(`ON CONFLICT UPDATE columns: ${UPDATED.join(', ')}`)
  if (!args.includes('--write')) return console.log('dry run; pass --write')
  const dir = outDir(arg(args, '--out'))
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'domain-verification.sql')
  writeFileSync(file, toSql(rows))
  console.log(
    `wrote ${file} (holds verification tokens; delete after applying)`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
