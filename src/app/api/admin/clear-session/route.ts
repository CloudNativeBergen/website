import { NextRequest, NextResponse } from 'next/server'
import { AppEnvironment } from '@/lib/environment'

export async function POST() {
  if (!AppEnvironment.isDevelopment) {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 },
    )
  }

  try {
    const response = NextResponse.json(
      {
        success: true,
        message: 'Session cleared successfully',
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    )

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
  if (!AppEnvironment.isDevelopment) {
    return NextResponse.json(
      { error: 'Not available in production' },
      { status: 403 },
    )
  }

  const url = new URL(request.url)
  const shouldClear = url.searchParams.get('clear') === 'true'

  if (shouldClear) {
    try {
      const response = NextResponse.json(
        {
          success: true,
          message: 'Session cleared successfully via GET',
          timestamp: new Date().toISOString(),
          redirectTo: '/admin',
          clearStorage: true,
        },
        { status: 200 },
      )

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
