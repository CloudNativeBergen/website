/**
 * A speaker's Bluesky handle, from the profile links they gave us (spec §3.1).
 *
 * Not `deriveBlueskyHandle` (`src/lib/stream/config.ts`): that was written for
 * the conference's own `socialLinks`, accepts bare handles, and returns a bare
 * `did:plc:…` for a DID profile URL. Here only a `bsky.app/profile/<handle>`
 * URL counts, and a DID in its place is no handle at all.
 */

const PROFILE_URL =
  /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\/([^/?#\s]+)/i

/** The atproto handle syntax (atproto.com/specs/handle), as `@atproto/syntax` checks it. */
const HANDLE =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/

/**
 * The atproto DID syntax (atproto.com/specs/did), including its 2,048-char
 * limit — the same check as `@atproto/syntax`'s `isValidDid`.
 */
export function isValidDid(did: string): boolean {
  return (
    did.length <= 2048 &&
    /^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$/.test(did)
  )
}

/** A handle in its canonical form: no `@`, lower case (handles are case-insensitive). */
export function normaliseHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase()
}

/**
 * The first `bsky.app/profile/<handle>` link's handle, lower-cased; null when
 * there is none. A `did:` profile URL is skipped: it names an account but
 * carries no handle to put in the text.
 */
export function blueskyHandleFromLinks(
  links: readonly (string | null | undefined)[] | null | undefined,
): string | null {
  for (const raw of links ?? []) {
    const match = raw?.trim().match(PROFILE_URL)
    if (!match) continue
    let segment: string
    try {
      segment = decodeURIComponent(match[1])
    } catch {
      continue
    }
    const handle = normaliseHandle(segment)
    if (handle.length <= 253 && HANDLE.test(handle)) return handle
  }
  return null
}
