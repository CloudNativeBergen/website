import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { unstable_noStore as noStore } from 'next/cache'

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

    if (!url.hostname.includes('sanity.io')) {
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

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Cloud Native Days Norway Website/1.0',
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
        'Cache-Control': 'public, max-age=86400, s-maxage=31536000',
        'Access-Control-Allow-Origin': '*',
        'Content-Length': imageBuffer.byteLength.toString(),
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
