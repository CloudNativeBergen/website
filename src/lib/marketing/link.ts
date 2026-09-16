/**
 * THE TAGGED LINK (spec §3.4, from #993/#932):
 *
 *   baseUrl + targetPage + ?utm_source=<channel>&utm_medium=social
 *                          &utm_campaign=<campaign.key>&utm_content=<task.key>
 *
 * Derived on read, never stored on the Task; written into the variant's
 * `link` so the Bluesky adapter builds its card from it and the copy-ready
 * view shows it. Links always point at our own domain: the vendor hand-off
 * happens on our page, where the outbound click event fires.
 */

import type { MarketingChannel } from './types'

export interface TaggedLinkInput {
  /** The conference origin, e.g. `https://cloudnativebergen.dev`. */
  baseUrl: string
  /** Site path from the page picker; must start with `/`. */
  targetPage: string
  channel: MarketingChannel | 'outreach'
  campaignKey: string
  taskKey: string
}

export function taggedUrl(input: TaggedLinkInput): string {
  if (!input.targetPage.startsWith('/')) {
    throw new Error(
      `taggedUrl: targetPage must be a site path starting with "/", got "${input.targetPage}"`,
    )
  }
  const base = new URL(input.baseUrl)
  const url = new URL(input.targetPage, base.origin)
  // Never off our own domain: a targetPage of `//evil.example` resolves to
  // another host, which the hand-off rule forbids.
  if (url.origin !== base.origin) {
    throw new Error(
      `taggedUrl: targetPage "${input.targetPage}" leaves ${base.origin}`,
    )
  }
  // Existing parameters on the picked page survive; ours win on collision.
  url.searchParams.set('utm_source', input.channel)
  url.searchParams.set('utm_medium', 'social')
  url.searchParams.set('utm_campaign', input.campaignKey)
  url.searchParams.set('utm_content', input.taskKey)
  return url.toString()
}
