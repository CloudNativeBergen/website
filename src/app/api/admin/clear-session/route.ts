import { NextRequest, NextResponse } from 'next/server'
import { AppEnvironment } from '@/lib/environment'

/**
 * API endpoint to clear session cookies and cache
 * Only available in development/test mode
 */
export async function POST() {
  // Only allow in development/test mode
  if (!AppEnvironment.isDevelopment) {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 },
    )
  }

  try {
    // Create response
    const response = NextResponse.json(
      {
        success: true,
        message: 'Session cleared successfully',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )

    // Clear all authentication-related cookies
    const cookiesToClear = [
      'next-auth.session-token',
      'next-auth.callback-url',
      'next-auth.csrf-token',
      '__Secure-next-auth.session-token',
      '__Host-next-auth.csrf-token',
      'authjs.session-token',
      'authjs.callback-url',
      'authjs.csrf-token',
    ]

    cookiesToClear.forEach((cookieName) => {
      response.cookies.set(cookieName, '', {
        expires: new Date(0),
        path: '/',
        httpOnly: true,
        secure: false, // Set to false for localhost
        sameSite: 'lax',
      })
    })

    // Add cache control headers to prevent caching
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')

    return response
  } catch (error) {
    console.error('Error clearing session:', error)
    return NextResponse.json(
      { error: 'Failed to clear session' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  // Only allow in development/test mode
  if (!AppEnvironment.isDevelopment) {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 },
    )
  }

  // Check if this is a clear request
  const url = new URL(request.url)
  const shouldClear = url.searchParams.get('clear') === 'true'

  if (shouldClear) {
    // Clear session - same logic as POST
    try {
      const response = NextResponse.json(
        {
          success: true,
          message: 'Session cleared successfully via GET',
          timestamp: new Date().toISOString(),
          redirectTo: '/admin',
          clearStorage: true, // Signal to client to clear storage
        },
        { status: 200 },
      )

      // Clear all authentication-related cookies
      const cookiesToClear = [
        'next-auth.session-token',
        'next-auth.callback-url',
        'next-auth.csrf-token',
        '__Secure-next-auth.session-token',
        '__Host-next-auth.csrf-token',
        'authjs.session-token',
        'authjs.callback-url',
        'authjs.csrf-token',
      ]

      cookiesToClear.forEach((cookieName) => {
        response.cookies.set(cookieName, '', {
          expires: new Date(0),
          path: '/',
          httpOnly: true,
          secure: false,
          sameSite: 'lax',
        })
      })

      // Add cache control headers
      response.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate',
      )
      response.headers.set('Pragma', 'no-cache')
      response.headers.set('Expires', '0')

      return response
    } catch (error) {
      console.error('Error clearing session:', error)
      return NextResponse.json(
        { error: 'Failed to clear session' },
        { status: 500 },
      )
    }
  }

  // Return session status if not clearing
  const authHeader = request.headers.get('authorization')
  const cookies = request.cookies.getAll()

  return NextResponse.json({
    testMode: AppEnvironment.isTestMode,
    development: AppEnvironment.isDevelopment,
    cookies: cookies.map((c) => ({ name: c.name, hasValue: !!c.value })),
    authHeader: !!authHeader,
    userAgent: request.headers.get('user-agent'),
    clearInstructions: 'Add ?clear=true to clear session',
  })
}
