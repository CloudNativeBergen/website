import 'server-only'
import { findOutboundOrigin } from '@/lib/conference/baseUrl'
import { mergeKonfApiConference, rolloutFlags } from '@/lib/conference/konf-api'
import type { Conference } from '@/lib/conference/types'

export type ConferenceCandidate = {
  _id: string
  domains?: readonly string[] | null
  organization?: { _ref: string } | null
  startDate?: string | null
  endDate?: string | null
  title?: string | null
}

/**
 * Merge D1-owned fields from the gateway over a Sanity conference record when
 * the tenant has `apiRead` enabled. Lookups are cached per conference within
 * the provided `cache` Map (or a per-call Map in `mergeConferences`).
 *
 * Retention purges delete data, so be conservative: if a merged date is
 * missing, fall back to the Sanity date, never to 'now'. Semantics are
 * identical for non-flagged tenants.
 */
export async function mergeConference<T extends ConferenceCandidate>(
  conf: T,
  cache?: Map<string, Promise<T>>,
): Promise<T> {
  if (!conf || !conf._id) return conf
  if (cache?.has(conf._id)) {
    return cache.get(conf._id)!
  }

  const promise = (async () => {
    const origin = findOutboundOrigin(conf)
    const host = origin ? new URL(origin).host : null
    if (
      host &&
      (
        await rolloutFlags(
          host,
          conf as Pick<Conference, '_id' | 'organization'>,
        )
      ).apiRead
    ) {
      const merged = (await mergeKonfApiConference(
        host,
        conf as unknown as Conference,
      )) as unknown as Record<string, unknown>

      // Conservative fallback: if a merged date is missing, fall back to the
      // Sanity date, never to 'now'.
      const endDate =
        (merged.endDate as string | null | undefined) ?? conf.endDate
      const startDate =
        (merged.startDate as string | null | undefined) ?? conf.startDate
      const title =
        (merged.title as string | null | undefined) ?? conf.title

      return {
        ...conf,
        ...merged,
        ...(endDate !== undefined && { endDate }),
        ...(startDate !== undefined && { startDate }),
        ...(title !== undefined && { title }),
      } as T
    }
    return conf
  })()

  if (cache) {
    cache.set(conf._id, promise)
  }
  return promise
}

/**
 * Merge an array of conference records against the gateway with a shared
 * per-conference cache within the call.
 */
export async function mergeConferences<T extends ConferenceCandidate>(
  conferences: T[],
  cache: Map<string, Promise<T>> = new Map(),
): Promise<T[]> {
  if (!conferences || conferences.length === 0) return []
  return Promise.all(conferences.map((conf) => mergeConference(conf, cache)))
}
