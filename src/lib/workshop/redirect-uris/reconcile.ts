/**
 * KEEPS WORKOS'S REDIRECT URIS EQUAL TO THE HOSTS THAT MAY SIGN IN (#1297,
 * parent #1293 decision 4 as narrowed by #1306).
 *
 * A host's AuthKit callback is WANTED when the host is platform-controlled
 * (`isPlatformControlledHost` — the one rule, never restated here) and the
 * conference claiming it has workshops enabled. The reconcile creates what is
 * wanted and missing, deletes what it created and no longer wants, and leaves
 * everything else in WorkOS alone.
 *
 * WHAT "IT CREATED" MEANS. A delete is only ever addressed to an id WorkOS
 * handed back for a create this system made, recorded on the host's
 * `domainVerification` document, and only while WorkOS lists that id on a URI
 * of that host. The record is the ledger: whoever can write the dataset can
 * write the ledger, and the host check is what keeps an id copied onto the
 * wrong record from deleting someone else's URI. NOTHING ELSE COUNTS: a URI that is simply
 * found in WorkOS — the environment's default, one a person added in the
 * dashboard, or one of our own creates whose answer never arrived — is recorded
 * as `external` and never deleted. Ownership is never inferred from a URI's
 * text or age. The price is that a create whose answer was lost outlives its
 * host; `unaccounted` in the summary is where that shows.
 *
 * A CREATE THAT CANNOT BE RECORDED IS UNDONE. Every write to the record is
 * conditional on the revision this run read, so a record that moved on while
 * WorkOS was answering (released, re-claimed, re-checked, or handled by an
 * overlapping run) rejects the write. The record is then read again: if the
 * host is established as still wanted and nothing else registered it, the id
 * is recorded; otherwise the URI just created is deleted. The same happens in reverse for a
 * delete: a host that became wanted again while its URI was being removed gets
 * it back. If the undo itself fails, the id is put on the record when the
 * record holds no live id, so the next run deletes it. When the record holds
 * another run's id, ours is in the error log only; the URI is then listed as
 * `unaccounted` by later runs that list WorkOS.
 *
 * ONLY THE PRODUCTION DEPLOYMENT RUNS IT. The outcome is stored in the dataset,
 * and local development and previews read the same dataset as production. A
 * run against another WorkOS environment would overwrite production's ids with
 * its own. To exercise the API against staging use
 * `scripts/probe-workos-redirect-uris.ts`, which writes nothing here.
 *
 * NEVER THROWS, and is never awaited by the mutation that triggered it. A
 * failed WorkOS call is recorded on the host (`redirectUriError`) and in the
 * summary; a host that could not be decided on is in the summary only, with
 * nothing written. The next run — at the latest the daily sweep — tries again.
 *
 * IDEMPOTENT. With nothing to change it reads (one Sanity query, the WorkOS
 * list) and writes nothing, to WorkOS or to Sanity. With no qualifying host and
 * no recorded state it does not call WorkOS at all.
 *
 * One exception, if WorkOS turns out to behave this way: it stores a URI
 * spelled differently from what it was sent, AND answers a create for a URI it
 * already has with that entry. A host whose URI someone else added is then
 * `external`, and because the listing never shows the exact URI, the create is
 * sent again on every run. It changes nothing in WorkOS and nothing is written
 * to the record.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { isPlatformControlledHost } from '@/lib/domain-verification/platform-controlled'
import {
  getRedirectUriSyncRow,
  listRedirectUriSyncRows,
  patchRedirectUriState,
} from '@/lib/domain-verification/sanity'
import type {
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'
import { resolveWorkshopsForConference } from '@/lib/features/workshops'
import { getOrganizationById } from '@/lib/organization/sanity'
import {
  WORKSHOP_AUTH_CALLBACK_PATH,
  workshopCallbackUri,
} from '../sign-in-paths'
import {
  createRedirectUri,
  deleteRedirectUri,
  listRedirectUris,
  type WorkOSRedirectUri,
} from './client'

const CLEARED: RedirectUriState = { status: null, id: null, error: null }

export interface RedirectUriReconcileSummary {
  /** Why nothing was attempted, or `null` when the reconcile ran. */
  skipped: 'no-api-key' | 'not-production' | null
  /** Hosts whose callback should be registered. */
  wanted: number
  /** Hosts whose callback this run created. */
  registered: string[]
  /** Hosts whose callback this run deleted. */
  removed: string[]
  /** Hosts this run could not decide on, or could not bring into step. */
  errored: string[]
  /**
   * Callback URIs in WorkOS that no wanted host accounts for and this system
   * holds no id for. Never deleted from here; a person has to decide.
   */
  unaccounted: string[]
  /** A failure that stopped the whole run, before any host was acted on. */
  error: string | null
}

function whySkipped(): RedirectUriReconcileSummary['skipped'] {
  if (!process.env.WORKOS_API_KEY?.trim()) return 'no-api-key'
  if (process.env.VERCEL_ENV !== 'production') return 'not-production'
  return null
}

/**
 * The AuthKit callback of a host — the redirect URI registered for it — or
 * `null` for a hostname that does not name itself as a URL. The parser rewrites
 * some (`127.1` is `127.0.0.1`), and a URI on any host but the one the record
 * names must never be registered.
 */
export function workshopRedirectUri(hostname: string): string | null {
  const host = normalizeDomain(hostname)
  try {
    const url = new URL(`https://${host}`)
    return url.host === host ? workshopCallbackUri(url.origin) : null
  } catch {
    return null
  }
}

function href(uri: string): string {
  try {
    return new URL(uri).href
  } catch {
    return uri
  }
}

/**
 * A URI for REPORTING only, with the spelling of its path set aside (case, a
 * trailing slash), since WorkOS may store one its own way. Never used to decide
 * what exists or what is ours.
 */
function loosely(uri: string): string {
  try {
    const url = new URL(uri)
    const path = url.pathname.replace(/\/+$/, '').toLowerCase()
    return `${url.protocol}//${url.host}${path}`
  } catch {
    return uri
  }
}

function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).host === new URL(b).host
  } catch {
    return false
  }
}

function describe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300)
}

/**
 * Should this host's callback be registered? `null` when that could not be
 * established — the host is then left exactly as it is, neither registered nor
 * removed, so that a failed read does not take a working sign-in away.
 */
async function wantsRedirectUri(
  row: RedirectUriSyncRow,
  now: Date,
): Promise<boolean | null> {
  const ownerOrgId = row.conference?.organization?._ref
  if (!isPlatformControlledHost(row.record, ownerOrgId, now)) return false
  if (!workshopRedirectUri(row.record.hostname)) return false
  try {
    // The gate answers "off" when it cannot READ the organization. Read it
    // here first, so that failure is an unknown and not a reason to delete.
    // This holds because the gate's own read is then served by the cache entry
    // this one filled; the gate reporting a rejected read itself would hold
    // without that.
    if (ownerOrgId) await getOrganizationById(ownerOrgId)
    return await resolveWorkshopsForConference(row.conference)
  } catch (error) {
    console.error(
      `[workshop] could not resolve workshops for ${row.record.hostname}; its redirect URI is left as it is`,
      error,
    )
    return null
  }
}

/** Write the fields that differ, on the revision this run holds. */
async function save(
  row: RedirectUriSyncRow,
  next: Partial<RedirectUriState>,
): Promise<void> {
  const changed: Partial<RedirectUriState> = {}
  for (const key of Object.keys(next) as (keyof RedirectUriState)[]) {
    if (next[key] !== undefined && next[key] !== row.redirectUri[key]) {
      Object.assign(changed, { [key]: next[key] })
    }
  }
  if (Object.keys(changed).length === 0) return
  row.rev = await patchRedirectUriState(row.record._id, row.rev, changed)
  row.redirectUri = { ...row.redirectUri, ...changed }
}

/**
 * Create the host's URI and record its id — or, when the record cannot take
 * the id, delete the URI again. See "A create that cannot be recorded is
 * undone" in the module doc.
 */
async function register(
  row: RedirectUriSyncRow,
  uri: string,
  listed: readonly WorkOSRedirectUri[],
  now: Date,
  summary: RedirectUriReconcileSummary,
): Promise<void> {
  let created: WorkOSRedirectUri
  try {
    created = await createRedirectUri(uri)
  } catch (error) {
    // The error only. An id already on the record stays: it is only ever
    // acted on when a listing shows it, so keeping it costs nothing.
    await save(row, { error: describe(error) }).catch(() => {})
    throw error
  }
  if (listed.some((entry) => entry.id === created.id)) {
    // WorkOS answered the create with an entry that was already there (spelled
    // differently, or it would have been seen). It made nothing, so the entry
    // is not ours: neither recorded as such nor undone.
    return save(row, { ...CLEARED, status: 'external' })
  }
  const registered = {
    status: 'registered',
    id: created.id,
    error: null,
  } as const

  // Put the id on the record. A write that fails is followed by a fresh read,
  // which either shows the id there after all (the write landed and only its
  // answer was lost), does not show that the host should keep the URI (another
  // run has registered it, it is no longer wanted, or that cannot be told for
  // the record as it now stands), or leaves one more attempt on the revision
  // just read.
  /** What the record held going in: nothing, or an id the listing did not show. */
  const heldBefore = row.redirectUri.id
  /** Does the record hold no live id — nothing, or still only that dead one? */
  const isFree = (current: RedirectUriSyncRow) =>
    current.redirectUri.id === null || current.redirectUri.id === heldBefore
  let recorded = false
  let fresh: RedirectUriSyncRow | null = row
  for (let attempt = 0; attempt < 2 && fresh && !recorded; attempt++) {
    try {
      await save(fresh, registered)
      recorded = true
    } catch {
      fresh = await getRedirectUriSyncRow(row.record._id).catch(() => null)
      if (!fresh) break
      if (fresh.redirectUri.id === created.id) recorded = true
      else if (
        !isFree(fresh) ||
        (await wantsRedirectUri(fresh, now)) !== true
      ) {
        break
      }
    }
  }
  if (recorded) {
    summary.registered.push(row.record.hostname)
    return
  }
  try {
    await deleteRedirectUri(created.id)
  } catch (error) {
    // Neither recorded nor undone. Put the id on the record if it will take
    // it, so the next run deletes it; failing that the log is the only place
    // the id is written down.
    const leftover = `redirect URI ${created.id} (${uri}) was created, could not be recorded and could not be removed again (${describe(error)})`
    if (fresh && isFree(fresh)) {
      await save(fresh, { ...registered, error: leftover }).catch(() => {})
    }
    throw new Error(`${leftover}. Remove it in WorkOS by hand if it remains.`)
  }
  throw new Error(
    `the record for ${row.record.hostname} moved on while its redirect URI was being created; the URI was removed again`,
  )
}

/**
 * The entry this system created for the host: the one with the recorded id, ON
 * THIS HOST. An id that names a URI on some other host was not put on the
 * record by a create for this one, and is never acted on or answered for. The
 * host is compared, not the whole URI: the id is what identifies the entry, and
 * WorkOS may spell the path its own way.
 */
function ownEntry(
  row: RedirectUriSyncRow,
  listed: readonly WorkOSRedirectUri[],
): WorkOSRedirectUri | undefined {
  const { id } = row.redirectUri
  const uri = workshopRedirectUri(row.record.hostname)
  if (!id || !uri) return undefined
  return listed.find((entry) => entry.id === id && sameHost(entry.uri, uri))
}

async function reconcileHost(
  row: RedirectUriSyncRow,
  wanted: boolean,
  listed: readonly WorkOSRedirectUri[],
  now: Date,
  summary: RedirectUriReconcileSummary,
): Promise<void> {
  const { hostname } = row.record
  const uri = workshopRedirectUri(hostname)
  const ours = ownEntry(row, listed)

  if (!wanted || !uri) {
    if (!ours) return save(row, CLEARED)
    try {
      await deleteRedirectUri(ours.id)
    } catch (error) {
      await save(row, { error: describe(error) })
      throw error
    }
    summary.removed.push(hostname)
    try {
      return await save(row, CLEARED)
    } catch (error) {
      // The record moved on while the URI was being deleted. If the host is
      // wanted again and still points at the URI just deleted, put it back.
      // Anything else — still unwanted, or another run has registered it
      // since, which the list this run holds knows nothing about — is left to
      // the next run.
      const fresh = await getRedirectUriSyncRow(row.record._id)
      if (
        !fresh ||
        fresh.redirectUri.id !== ours.id ||
        (await wantsRedirectUri(fresh, now)) !== true
      ) {
        throw error
      }
      const remaining = listed.filter((entry) => entry.id !== ours.id)
      return reconcileHost(fresh, true, remaining, now, summary)
    }
  }

  if (ours) return save(row, { status: 'registered', error: null })
  if (listed.some((entry) => href(entry.uri) === href(uri))) {
    return save(row, { ...CLEARED, status: 'external' })
  }
  return register(row, uri, listed, now, summary)
}

/**
 * Bring WorkOS's redirect URIs into step with the hosts that may sign in. See
 * the module doc. Never throws.
 */
export async function reconcileWorkshopRedirectUris(
  now: Date = new Date(),
): Promise<RedirectUriReconcileSummary> {
  const summary: RedirectUriReconcileSummary = {
    skipped: whySkipped(),
    wanted: 0,
    registered: [],
    removed: [],
    errored: [],
    unaccounted: [],
    error: null,
  }
  if (summary.skipped) return summary

  try {
    const work: { row: RedirectUriSyncRow; wanted: boolean }[] = []
    const decided: { row: RedirectUriSyncRow; wanted: boolean | null }[] = []
    for (const row of await listRedirectUriSyncRows()) {
      const wanted = await wantsRedirectUri(row, now)
      decided.push({ row, wanted })
      if (wanted === null) {
        summary.errored.push(row.record.hostname)
        continue
      }
      if (wanted) summary.wanted += 1
      const hasState = Object.values(row.redirectUri).some((v) => v !== null)
      if (wanted || hasState) work.push({ row, wanted })
    }
    if (work.length === 0) return summary

    let listed: WorkOSRedirectUri[]
    try {
      listed = await listRedirectUris()
    } catch (error) {
      summary.error = describe(error)
      console.error('[workshop] could not list WorkOS redirect URIs', error)
      for (const { row, wanted } of work) {
        if (wanted && row.redirectUri.status !== null) continue
        summary.errored.push(row.record.hostname)
        await save(row, { error: summary.error }).catch(() => {})
      }
      return summary
    }

    // What some host answers for: its own entry, or, for a host that should
    // have a URI and has none of its own listed, any entry with its URI.
    const accounted = new Set<string>()
    for (const { row, wanted } of decided) {
      const own = ownEntry(row, listed)
      const uri = workshopRedirectUri(row.record.hostname)
      if (own) accounted.add(own.id)
      else if (uri && wanted !== false) accounted.add(loosely(uri))
    }
    summary.unaccounted = listed
      .filter(
        (entry) =>
          loosely(entry.uri).endsWith(WORKSHOP_AUTH_CALLBACK_PATH) &&
          !accounted.has(loosely(entry.uri)) &&
          !accounted.has(entry.id),
      )
      .map((entry) => entry.uri)

    for (const { row, wanted } of work) {
      try {
        await reconcileHost(row, wanted, listed, now, summary)
      } catch (error) {
        summary.errored.push(row.record.hostname)
        console.error(
          `[workshop] redirect URI for ${row.record.hostname} is out of step`,
          error,
        )
      }
    }
  } catch (error) {
    summary.error = describe(error)
    console.error('[workshop] redirect URI reconcile failed', error)
  }
  return summary
}
