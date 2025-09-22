export function extractHandleFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname === 'bsky.app' || urlObj.hostname === 'www.bsky.app') {
      const pathParts = urlObj.pathname.split('/')
      if (pathParts[1] === 'profile' && pathParts[2]) {
        return pathParts[2]
      }
    }
  } catch {}
  return null
}

export function hasBlueskySocial(links: string[] | undefined): string | null {
  if (!links) return null

  for (const link of links) {
    const handle = extractHandleFromUrl(link)
    if (handle) return link
  }

  return null
}
