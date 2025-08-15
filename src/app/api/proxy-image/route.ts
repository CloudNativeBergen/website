import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    // Require authentication - only authenticated speakers can use this proxy
    const session = await auth()
    if (!session?.user || !session?.speaker) {
      return new NextResponse('Authentication required', { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const imageUrl = searchParams.get('url')

    if (!imageUrl) {
      return new NextResponse('Missing url parameter', { status: 400 })
    }

    // Validate URL format
    let url: URL
    try {
      url = new URL(imageUrl)
    } catch {
      return new NextResponse('Invalid URL format', { status: 400 })
    }

    // Security: Only allow Sanity CDN URLs
    if (!url.hostname.includes('sanity.io')) {
      return new NextResponse('Invalid image source', { status: 403 })
    }

    // Additional security: Check for common image extensions or query params (Sanity URLs may have query params)
    const pathname = url.pathname.toLowerCase()
    const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg']
    const hasValidExtension = validExtensions.some((ext) =>
      pathname.endsWith(ext),
    )
    const hasQueryParams = url.search.length > 0

    if (!hasValidExtension && !hasQueryParams) {
      return new NextResponse('Invalid image format', { status: 400 })
    }

    // Fetch with timeout and size limits
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Cloud Native Bergen Website/1.0',
        Accept: 'image/*',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return new NextResponse(`Failed to fetch image: ${response.status}`, {
        status: response.status,
      })
    }

    const contentType = response.headers.get('content-type')
    if (!contentType?.startsWith('image/')) {
      return new NextResponse('Invalid content type', { status: 400 })
    }

    // Check content length to prevent abuse
    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      // 10MB limit
      return new NextResponse('Image too large', { status: 413 })
    }

    const imageBuffer = await response.arrayBuffer()

    // Double-check size after download
    if (imageBuffer.byteLength > 10 * 1024 * 1024) {
      return new NextResponse('Image too large', { status: 413 })
    }

    // Return with optimized headers
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000', // 24h client, 1 year CDN
        'Access-Control-Allow-Origin': '*',
        'Content-Length': imageBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    console.error('Image proxy error:', error)

    // Don't expose internal errors to clients
    if (error instanceof Error && error.name === 'AbortError') {
      return new NextResponse('Request timeout', { status: 408 })
    }

    return new NextResponse('Internal server error', { status: 500 })
  }
}
