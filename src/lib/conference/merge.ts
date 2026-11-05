import 'server-only'
import { findOutboundOrigin } from '@/lib/conference/baseUrl'
import { mergeKonfApiConference, rolloutFlags } from '@/lib/conference/konf-api'
import type { Conference } from '@/lib/conference/types'

/** The fields a server-side Sanity conference row needs to be merged. */
export type ConferenceCandidate = {
  _id: string
  domains?: readonly string[] | null
  organization?: { _ref: string } | null
}

/**
 * Merge the D1-owned fields over a Sanity conference row when its tenant has
 * `apiRead`. The host comes from the row's own `domains[]`, never from a
 * request. Any error leaves the Sanity row untouched.
 */
export async function mergeConference<T extends ConferenceCandidate>(
  conf: T,
): Promise<T> {
  try {
    const origin = findOutboundOrigin(conf)
    if (!origin) return conf
    const host = new URL(origin).host
    const flags = await rolloutFlags(host, {
      _id: conf._id,
      organization: conf.organization ?? undefined,
    })
    if (!flags.apiRead) return conf
    const merged = await mergeKonfApiConference(
      host,
      conf as unknown as Conference,
    )
    return merged as unknown as T
  } catch (err) {
    console.warn(
      `[conference/merge] falling back to Sanity for ${conf._id}:`,
      (err as Error).message,
    )
    return conf
  }
}

export function mergeConferences<T extends ConferenceCandidate>(
  conferences: readonly T[],
): Promise<T[]> {
  return Promise.all(conferences.map((c) => mergeConference(c)))
}

const isDate = (d: unknown): d is string =>
  typeof d === 'string' &&
  /^\d{4}-\d{2}-\d{2}/.test(d) &&
  !Number.isNaN(Date.parse(d))

/**
 * The end date a DELETING job may use: the later of Sanity's and D1's. A
 * later end date means a later cutoff, so D1 can only ever delay a purge,
 * never widen it. A missing or unparsable D1 date falls back to Sanity.
 */
export function purgeEndDate(
  sanity: string | null | undefined,
  merged: unknown,
): string | null | undefined {
  if (!isDate(merged)) return sanity
  if (!isDate(sanity)) return sanity
  return merged.slice(0, 10) > sanity.slice(0, 10) ? merged : sanity
}
