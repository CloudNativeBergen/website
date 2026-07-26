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
export function isUnknownHost({ conference }: ConferenceResolution): boolean {
  // ONLY the absence of a resolved conference counts as unknown-host. An
  // `error` alongside a VALID conference (partial/secondary read failure) must
  // NOT flip the whole site to the platform landing — pages keep their own
  // error handling for that case (e.g. the terms page's conferenceError
  // branch, which a Boolean(error) test here would render unreachable).
  return !conference?._id
}
