/**
 * atproto identifier syntax, shared by the Bluesky adapter and marketing's
 * tag generation — kept here so the social layer never imports marketing.
 */

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

/** `@Alice.bsky.social` and `alice.bsky.social` are the same handle. */
export function normaliseHandle(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase()
}
