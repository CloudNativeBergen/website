import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'

export async function middleware() {
  const session = await getAuthSession()

  if (!session || !session.user || !session.speaker) {
    return NextResponse.json(
      { message: 'Unauthorized - Authentication required' },
      { status: 401 },
    )
  }

  if (!session.speaker.isOrganizer) {
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
