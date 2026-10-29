import type { NextRequest } from 'next/server'
import { beginWorkshopSignIn } from '@/lib/workshop/central-sign-in'

/** `GET /workshop/sign-in`: begin a workshop sign-in for this host (#1311). */
export function GET(request: NextRequest) {
  return beginWorkshopSignIn(request, 'sign-in')
}
