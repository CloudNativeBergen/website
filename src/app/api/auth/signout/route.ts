import { signOut as workosSignOut } from '@workos-inc/authkit-nextjs'
import { NextResponse } from 'next/server'
import { auth, signOut as nextAuthSignOut } from '@/lib/auth'

export async function GET(request: Request) {
  try {
    await workosSignOut()

    const origin =
      request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
    const response = NextResponse.redirect(new URL('/', origin))

    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    )

    return response
  } catch (error) {
    console.error('Error during WorkOS signout:', error)

    const origin =
      request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
    const response = NextResponse.redirect(new URL('/', origin))

    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Credentials', 'true')

    return response
  }
}

export async function POST() {
  try {
    const session = await auth()

    if (session) {
      await nextAuthSignOut({ redirect: false })
    }

    return NextResponse.json(
      { success: true, url: '/' },
      {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin':
            process.env.NEXT_PUBLIC_APP_URL || '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      }
    )
  } catch (error) {
    console.error('Error during NextAuth signout:', error)
    return NextResponse.json(
      { error: 'Signout failed', success: false },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin':
            process.env.NEXT_PUBLIC_APP_URL || '*',
          'Access-Control-Allow-Credentials': 'true',
        },
      }
    )
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin') || '*'

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400',
    },
  })
}
