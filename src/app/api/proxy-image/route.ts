import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { PLATFORM_NAME } from '@/lib/branding/platform'
import { unstable_noStore as noStore } from 'next/cache'

/**
 * The ONLY origin this proxy is allowed to fetch. Every Sanity image asset is
 * served from `cdn.sanity.io` — see `SANITY_CDN_PREFIX` in
 * `src/lib/sanity/client.ts` and the `remotePatterns` entry in `next.config.ts`
 * — so an exact host match covers every legitimate caller
 * (`DownloadableImage`, `SpeakerSharingActions`) while keeping the reachable
 * surface as small as it can be.
 */
const ALLOWED_IMAGE_HOST = 'cdn.sanity.io'

/**
 * Guards a server-side fetch primitive, so it must fail CLOSED.
 *
 * Compare the PARSED hostname for equality — never `includes` (which let
 * `sanity.io.attacker.example` and `attacker-sanity.io-cdn.example` through)
 * and never `endsWith` (which lets the trailing-dot FQDN `cdn.sanity.io.`
 * through, since that resolves to the same name but is a different string).
 * `URL` already lowercases and punycodes the host, so `CDN.SANITY.IO` matches
 * and homograph spellings such as `cdn.sanitỵ.io` do not.
 *
 * The remaining URL components matter just as much as the host:
 * - `protocol`: https only. `http:` would downgrade the hop; `file:`/`data:`
 *   parse with an empty hostname and are rejected by the host check too.
 * - `port`: default only, so the allowed host cannot be used to reach
 *   non-HTTPS services bound to other ports on that address.
 * - `username`/`password`: an `@` in the authority is the classic way to make
 *   a URL *look* like it points at the allowlisted host. Parsing already
 *   resolves that correctly (`https://cdn.sanity.io@evil.example/` has hostname
 *   `evil.example`), but embedded credentials are never legitimate here and
 *   would be forwarded as an `Authorization` header, so reject them outright.
 */
function isAllowedImageTarget(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.hostname === ALLOWED_IMAGE_HOST &&
    url.port === '' &&
    url.username === '' &&
    url.password === ''
  )
}

export async function GET(request: NextRequest) {
  noStore()
  try {
    const session = await auth()
    if (!session?.user || !session?.speaker) {
      return new NextResponse('Authentication required', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('url')

    if (!imageUrl) {
      return new NextResponse('Missing url parameter', { status: 400 })
    }

    let url: URL
    try {
      url = new URL(imageUrl)
    } catch {
      return new NextResponse('Invalid URL format', { status: 400 })
    }

    if (!isAllowedImageTarget(url)) {
      return new NextResponse('Invalid image source', { status: 403 })
    }

    const pathname = url.pathname.toLowerCase()
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
    const hasValidExtension = validExtensions.some((ext) =>
      pathname.endsWith(ext),
    )
    const hasQueryParams = url.search.length > 0

    if (!hasValidExtension && !hasQueryParams) {
      return new NextResponse('Invalid image format', { status: 400 })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    // Fetch the PARSED url, not the raw string, so the request target is
    // provably the one that passed `isAllowedImageTarget`.
    const response = await fetch(url, {
      headers: {
        'User-Agent': `${PLATFORM_NAME} Website/1.0`,
        Accept: 'image/*',
      },
      signal: controller.signal,
      // A host allowlist is worthless if the allowed host can redirect us
      // somewhere else: one 302 to `http://169.254.169.254/` would hand back an
      // internal response through this proxy. Do not follow — surface the
      // redirect as an error instead. Node/undici answers `manual` with the
      // real 3xx response; a spec-strict runtime answers with an opaqueredirect
      // (status 0), so check for both.
      redirect: 'manual',
    })

    clearTimeout(timeoutId)

    if (
      response.type === 'opaqueredirect' ||
      (response.status >= 300 && response.status < 400)
    ) {
      return new NextResponse('Image source redirected', { status: 502 })
    }

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.status}`, {
        status: response.status,
      })
    }

    const contentType = response.headers.get('content-type')
    if (!contentType?.startsWith('image/')) {
      return new NextResponse('Invalid content type', { status: 400 })
    }

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return new NextResponse('Image too large', { status: 413 })
    }

    const imageBuffer = await response.arrayBuffer()

    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return new NextResponse('Image too large', { status: 413 })
    }

    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        // Safe to cache publicly and share cross-origin ONLY because the body
        // can now come from one public CDN host and is keyed by the full URL —
        // it never contains anything the caller's session made visible.
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': imageBuffer.byteLength.toString(),
        // `image/svg+xml` passes the content-type check, and this response is
        // served from OUR origin — a navigation straight to the proxy URL would
        // otherwise run the SVG's script as us. Neuter it: no sniffing, no
        // subresources, and a unique opaque origin if it is ever navigated to.
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)

    if (error instanceof Error && error.name === 'AbortError') {
      return new NextResponse('Request timeout', { status: 408 })
    }

    return new NextResponse('Internal server error', { status: 500 })
  }
}
