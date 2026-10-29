/**
 * Shared social sharing utilities
 */

import { protocolForDomain } from '@/lib/environment/localhost'
import { deriveBlueskyHandle } from '@/lib/stream/config'

export type SocialPlatform = 'bluesky'

interface ShareOptions {
  platform: SocialPlatform
  text: string
  url: string
}

/**
 * Opens a social sharing dialog
 */
export function shareSocial({ platform, text, url }: ShareOptions): void {
  if (platform === 'bluesky') {
    const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(`${text} ${url}`)}`
    window.open(blueskyUrl, '_blank', 'width=550,height=600')
  }
}

interface LinkedInCertificationOptions {
  name: string
  organizationName: string
  issueYear: number
  issueMonth: number
  certUrl: string
  certId?: string
}

/**
 * Opens LinkedIn "Add to Profile" dialog with pre-filled certification data
 */
export function addToLinkedInProfile({
  name,
  organizationName,
  issueYear,
  issueMonth,
  certUrl,
  certId,
}: LinkedInCertificationOptions): void {
  const params = new URLSearchParams({
    startTask: 'CERTIFICATION_NAME',
    name,
    organizationName,
    issueYear: issueYear.toString(),
    issueMonth: issueMonth.toString(),
    certUrl,
  })

  if (certId) {
    params.append('certId', certId)
  }

  const linkedinUrl = `https://www.linkedin.com/profile/add?${params.toString()}`
  window.open(linkedinUrl, '_blank', 'width=700,height=600')
}

/**
 * Opens the Credly badge import dialog
 */
export function shareToCredly(jsonUrl: string): void {
  const credlyUrl = `https://www.credly.com/badges/import?url=${encodeURIComponent(jsonUrl)}`
  window.open(credlyUrl, '_blank')
}

/**
 * Constructs a full URL from domain and path
 */
export function buildFullUrl(domain: string, path: string): string {
  return `${protocolForDomain(domain)}://${domain}${path}`
}

/**
 * The event hashtag and the conference's Bluesky account, as a line to end a
 * post with, e.g. "#cndn2026 @cloudnativebergen.dev". Either part is left out
 * when the conference has not set it; null when neither is set.
 */
export function shareTags(conference?: {
  socialHashtag?: string | null
  socialLinks?: string[] | null
}): string | null {
  const tag = conference?.socialHashtag?.trim().replace(/^#*/, '')
  const handle = deriveBlueskyHandle(conference?.socialLinks)
  const parts = [tag && `#${tag}`, handle && `@${handle}`].filter(Boolean)
  return parts.length ? parts.join(' ') : null
}
