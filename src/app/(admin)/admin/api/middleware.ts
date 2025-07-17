import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function middleware(request: NextRequest) {
  // Get the session
  const session = await auth()

  // Check if user is authenticated
  if (!session || !session.user || !session.speaker) {
    return NextResponse.json(
      { message: 'Unauthorized - Authentication required' },
      { status: 401 },
    )
  }

  // Check if user is an organizer
  if (!session.speaker.is_organizer) {
    return NextResponse.json(
      { message: 'Forbidden - Organizer access required' },
      { status: 403 },
    )
  }

  // Allow the request to continue
  return NextResponse.next()
}

export const config = {
  matcher: '/admin/api/:path*',
}
