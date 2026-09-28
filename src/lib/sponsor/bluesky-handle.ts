/**
 * The sponsor company's Bluesky handle, checked on save (tagging spec §3.3,
 * §4.4): only Bluesky's definite "no such handle" refuses. Bluesky being
 * unreachable is a warning — the handle is saved, and every post that tags it
 * is checked again at its own save, approval and publish. SERVER-ONLY: asks
 * Bluesky's public AppView.
 */

import { parseBlueskyHandle } from '@/lib/marketing/tagging/handle'
import { linkedinCompanyUrl } from '@/lib/marketing/tag-by-hand/links'
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

export interface SponsorSocials {
  blueskyHandle?: string | null
  linkedinUrl?: string | null
}

/**
 * The company's social accounts as typed, normalised (tagging spec §3.3):
 * `@Acme.com` and a `bsky.app/profile/…` URL are both `acme.com`; the
 * LinkedIn page is stored as "Tag by hand" shows it (`linkedinCompanyUrl`),
 * so a profile or a non-LinkedIn URL is refused rather than saved and never
 * listed. Absent stays absent; empty or null is null (clear). Pure.
 */
export function parseSponsorSocials(
  input: SponsorSocials,
): { ok: true; value: SponsorSocials } | { ok: false; message: string } {
  const value: SponsorSocials = {}
  const typed = (v: string | null | undefined) =>
    v === undefined
      ? undefined
      : v === null || v.trim() === ''
        ? null
        : v.trim()
  const handle = typed(input.blueskyHandle)
  if (handle !== undefined) {
    const parsed = handle === null ? null : parseBlueskyHandle(handle)
    if (handle !== null && !parsed)
      return {
        ok: false,
        message: `"${handle}" is not a Bluesky handle. Enter it like acme.com or acme.bsky.social.`,
      }
    value.blueskyHandle = parsed
  }
  const page = typed(input.linkedinUrl)
  if (page !== undefined) {
    const parsed = page === null ? null : linkedinCompanyUrl(page)
    if (page !== null && !parsed)
      return {
        ok: false,
        message:
          'Enter the LinkedIn company page, like https://www.linkedin.com/company/acme.',
      }
    value.linkedinUrl = parsed
  }
  return { ok: true, value }
}
