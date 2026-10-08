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
 * WHAT "IT CREATED" MEANS. A delete is only ever addressed to an id this system
 * was handed by WorkOS for a create it made itself — recorded on the host's
 * `domainVerification` document. A URI that is simply found in WorkOS (the
 * environment's default, one a person added in the dashboard) is recorded as
 * `external` and never deleted, even for a host that is released later.
 *
 * The one case that needs care is a create whose answer never arrived: the URI
 * may exist with nobody holding its id. So the intent is written BEFORE the
 * request (`registering` + `requestedAt`), and a URI that later turns up,
 * created no earlier than that, is recognised as ours. A create WorkOS refused
 * outright withdraws the intent, so a URI a person adds afterwards stays theirs.
 *
 * EVERY WRITE TO THE RECORD IS CONDITIONAL on the revision this run read. Two
 * runs can overlap (a domain mutation's and the daily sweep's); the second to
 * write is rejected by Sanity and does nothing more for that host — in
 * particular it does not go on to call WorkOS.
 *
 * NEVER THROWS, and is never awaited by the mutation that triggered it. A
 * failure is recorded on the host (`redirectUriError`) and in the summary, and
 * the next run — at the latest the daily sweep — tries again.
 *
 * IDEMPOTENT. With nothing to change it reads (one Sanity query, the WorkOS
 * list) and writes nothing, to WorkOS or to Sanity. With no qualifying host and
 * no recorded state it does not call WorkOS at all.
 */

import { normalizeDomain } from '@/lib/conference/domains'
import { isPlatformControlledHost } from '@/lib/domain-verification/platform-controlled'
import {
  listRedirectUriSyncRows,
  patchRedirectUriState,
} from '@/lib/domain-verification/sanity'
import type {
  RedirectUriState,
  RedirectUriSyncRow,
} from '@/lib/domain-verification/types'
import { resolveWorkshopsForConference } from '@/lib/features/workshops'
import { WORKSHOP_AUTH_CALLBACK_PATH } from '../sign-in-paths'
import {
  createRedirectUri,
  deleteRedirectUri,
  isRedirectUriApiConfigured,
  listRedirectUris,
  WorkOSRedirectUriError,
  type WorkOSRedirectUri,
} from './client'

/**
 * How far WorkOS's clock may run behind ours and a URI still count as created
 * after our request. Anything older was already in the list this run read
 * before it wrote the request, so the margin cannot reach a hand-added URI.
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000

const CLEARED: RedirectUriState = {
  status: null,
  id: null,
  requestedAt: null,
  error: null,
}

export interface RedirectUriReconcileSummary {
  /** `false` when `WORKOS_API_KEY` is unset: nothing was attempted. */
  configured: boolean
  /** Hosts whose callback should be registered. */
  wanted: number
  /** Hosts whose callback this run created. */
  registered: string[]
  /** Hosts whose callback this run deleted. */
  removed: string[]
  /** Hosts this run could not bring into step. */
  errored: string[]
  /** A failure that stopped the whole run, before any host was acted on. */
  error: string | null
}

/** The AuthKit callback of a host — the redirect URI registered for it. */
export function workshopRedirectUri(hostname: string): string {
  return `https://${normalizeDomain(hostname)}${WORKSHOP_AUTH_CALLBACK_PATH}`
}

function sameUri(a: string, b: string): boolean {
  try {
    return new URL(a).href === new URL(b).href
  } catch {
    return a === b
  }
}

function describe(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 300)
}

/**
 * Should this host's callback be registered? `null` when the workshops gate
 * could not say — the host is then left exactly as it is, neither registered
 * nor removed, so a failed read can never take a working sign-in away.
 */
async function wantsRedirectUri(
  row: RedirectUriSyncRow,
  now: Date,
): Promise<boolean | null> {
  const ownerOrgId = row.conference?.organization?._ref
  if (!isPlatformControlledHost(row.record, ownerOrgId, now)) return false
  try {
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

/** Was this URI created by the request the record still has on file? */
function answersOurRequest(
  entry: WorkOSRedirectUri,
  state: RedirectUriState,
): boolean {
  if (state.status !== 'registering' || !state.requestedAt) return false
  if (!entry.createdAt) return false
  const requestedAt = Date.parse(state.requestedAt)
  return (
    !Number.isNaN(requestedAt) &&
    entry.createdAt.getTime() >= requestedAt - CLOCK_SKEW_MS
  )
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
  const state = row.redirectUri
  const atWorkOS = listed.find((entry) => sameUri(entry.uri, uri))
  const ours =
    (state.id ? listed.find((entry) => entry.id === state.id) : undefined) ??
    (atWorkOS && answersOurRequest(atWorkOS, state) ? atWorkOS : undefined)

  if (!wanted) {
    if (ours) {
      try {
        await deleteRedirectUri(ours.id)
      } catch (error) {
        await save(row, { error: describe(error) })
        throw error
      }
      summary.removed.push(hostname)
    } else if (atWorkOS) {
      console.warn(
        `[workshop] ${uri} is no longer wanted but was not created by this system; it is left in WorkOS. Remove it by hand.`,
      )
    }
    await save(row, CLEARED)
    return
  }

  if (ours) {
    await save(row, { ...CLEARED, status: 'registered', id: ours.id })
    return
  }
  if (atWorkOS) {
    await save(row, { ...CLEARED, status: 'external' })
    return
  }

  // The request goes on record first: this write is also what a concurrent run
  // loses on, so only one of them reaches WorkOS.
  await save(row, {
    status: 'registering',
    id: null,
    requestedAt: now.toISOString(),
  })
  try {
    const created = await createRedirectUri(uri)
    await save(row, { ...CLEARED, status: 'registered', id: created.id })
    summary.registered.push(hostname)
  } catch (error) {
    // A status is WorkOS saying no: nothing was registered, so the request is
    // withdrawn. Without one something may have been, and the request stays on
    // record for the next run to recognise it by.
    const refused =
      error instanceof WorkOSRedirectUriError && error.status !== null
    await save(row, {
      ...(refused ? { status: null, requestedAt: null } : {}),
      error: describe(error),
    })
    throw error
  }
}

/**
 * Bring WorkOS's redirect URIs into step with the hosts that may sign in. See
 * the module doc. Never throws.
 */
export async function reconcileWorkshopRedirectUris(
  now: Date = new Date(),
): Promise<RedirectUriReconcileSummary> {
  const summary: RedirectUriReconcileSummary = {
    configured: isRedirectUriApiConfigured(),
    wanted: 0,
    registered: [],
    removed: [],
    errored: [],
    error: null,
  }
  if (!summary.configured) return summary

  try {
    const work: { row: RedirectUriSyncRow; wanted: boolean }[] = []
    for (const row of await listRedirectUriSyncRows()) {
      const wanted = await wantsRedirectUri(row, now)
      if (wanted === null) continue
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
        const { status } = row.redirectUri
        if (wanted && (status === 'registered' || status === 'external')) {
          continue
        }
        summary.errored.push(row.record.hostname)
        await save(row, { error: summary.error }).catch(() => {})
      }
      return summary
    }

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
