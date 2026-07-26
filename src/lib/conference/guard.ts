import type { Conference } from './types'

/**
 * The shape returned by `getConferenceForDomain` /
 * `getConferenceForCurrentDomain` that callers must inspect before rendering.
 */
export interface ConferenceResolution {
  conference: Conference
  error?: Error | null
}

/**
 * Canonical unknown-host test.
 *
 * `getConferenceForDomain` returns a TRUTHY `{} as Conference` (plus an
 * `error`) when a Host resolves to no conference, so a bare `!conference`
 * NEVER fires and dereferencing fields like `conference.formats` throws.
 * Every public (main) page and the (main) layout must gate on this instead.
 */
export function isUnknownHost({
  conference,
  error,
}: ConferenceResolution): boolean {
  return Boolean(error) || !conference?._id
}
