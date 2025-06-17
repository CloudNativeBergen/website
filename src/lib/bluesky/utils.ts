// Utility function to extract Bluesky handle from URL
export function extractHandleFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname === 'bsky.app' || urlObj.hostname === 'www.bsky.app') {
      // Extract handle from URLs like https://bsky.app/profile/handle.bsky.social
      const pathParts = urlObj.pathname.split('/')
      if (pathParts[1] === 'profile' && pathParts[2]) {
        return pathParts[2]
      }
    }
  } catch {
    // Invalid URL
  }
  return null
}

// Helper function to check if a speaker has a Bluesky link
export function hasBlueskySocial(links: string[] | undefined): string | null {
  if (!links) return null

  for (const link of links) {
    const handle = extractHandleFromUrl(link)
    if (handle) return link
  }

  return null
}
