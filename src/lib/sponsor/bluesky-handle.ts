/**
 * The sponsor company's Bluesky handle, checked on save (tagging spec §3.3,
 * §4.4): only Bluesky's definite "no such handle" refuses. Bluesky being
 * unreachable is a warning — the handle is saved, and every post that tags it
 * is checked again at its own save, approval and publish. SERVER-ONLY: asks
 * Bluesky's public AppView.
 */

import {
  resolveBlueskyHandle,
  type HandleResolution,
} from '@/lib/marketing/tagging/resolve'

export type SponsorHandleCheck =
  { ok: true; warnings: string[] } | { ok: false; message: string }

export async function checkSponsorBlueskyHandle(
  handle: string,
  resolve: (handle: string) => Promise<HandleResolution> = resolveBlueskyHandle,
): Promise<SponsorHandleCheck> {
  const answer = await resolve(handle)
  if (answer.kind === 'not-found')
    return {
      ok: false,
      message: `@${handle} does not resolve on Bluesky. Check the handle: it is the part after bsky.app/profile/ on the company's Bluesky page.`,
    }
  return {
    ok: true,
    warnings:
      answer.kind === 'unreachable'
        ? [
            `Bluesky could not be reached to check @${handle}. The handle is saved; each post that tags it is checked again.`,
          ]
        : [],
  }
}
