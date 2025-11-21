/**
 * Shared social sharing utilities
 */

export type SocialPlatform = 'bluesky' | 'linkedin'

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
  } else if (platform === 'linkedin') {
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`
    window.open(linkedinUrl, '_blank', 'width=550,height=420')
  }
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
