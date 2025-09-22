import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function middleware(request: NextRequest) {
  const session = await getAuthSession()

  if (!session || !session.user || !session.speaker) {
    return NextResponse.json(
      { message: 'Unauthorized - Authentication required' },
      { status: 401 },
    )
  }

  if (!session.speaker.is_organizer) {
    return NextResponse.json(
      { message: 'Forbidden - Organizer access required' },
      { status: 403 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/admin/api/:path*',
}
