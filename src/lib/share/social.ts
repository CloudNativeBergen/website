/**
 * Shared social sharing utilities
 */

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
  const protocol = domain.includes('localhost') ? 'http' : 'https'
  return `${protocol}://${domain}${path}`
}
