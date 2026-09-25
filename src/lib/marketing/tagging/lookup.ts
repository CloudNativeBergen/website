/**
 * What generation may tag for one speaker (tagging spec §3.1, §3.2, §4.4):
 * the opt-out and our own account are checked BEFORE Bluesky is asked, so
 * neither costs a request nor tells Bluesky who we were about to tag.
 */

import { deriveBlueskyHandle } from '@/lib/stream/config'
import type { BlueskyTag } from './body'
import { blueskyHandleFromLinks, normaliseHandle } from './handle'
import { resolveBlueskyHandle, type HandleResolution } from './resolve'

export interface TagSource {
  links: readonly string[] | null
  socialTagOptOut: boolean | null
}

/**
 * Our own account, from the conference's `socialLinks`: a lower-cased handle,
 * or a DID when the link names the account by DID. Null without one.
 */
export function ownBlueskyHandle(
  socialLinks: string[] | null | undefined,
): string | null {
  const own = deriveBlueskyHandle(socialLinks)
  if (!own) return null
  return own.startsWith('did:') ? own : normaliseHandle(own)
}

/**
 * Null when there is nothing to tag: no source, opted out, no handle, or our
 * own account. Otherwise `tagged` with the DID, or `unresolved` — a timeout
 * or an unreachable Bluesky counts as unresolved at generation (§4.4).
 */
export async function blueskyTagFor(
  source: TagSource | undefined,
  ownHandle: string | null,
  resolve: (handle: string) => Promise<HandleResolution> = resolveBlueskyHandle,
): Promise<BlueskyTag | null> {
  if (!source || source.socialTagOptOut) return null
  const handle = blueskyHandleFromLinks(source.links)
  if (!handle || handle === ownHandle) return null
  const resolution = await resolve(handle).catch((): HandleResolution => ({
    kind: 'unreachable',
  }))
  if (resolution.kind !== 'resolved') return { status: 'unresolved', handle }
  // A speaker who links our account, when we only know it by DID.
  if (resolution.did === ownHandle) return null
  return { status: 'tagged', handle, did: resolution.did }
}
