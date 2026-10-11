import type { NextRequest } from 'next/server'
import { beginWorkshopSignIn } from '@/lib/workshop/central-sign-in'

/** `GET /workshop/sign-up`: begin a workshop sign-up for this host (#1311). */
export function GET(request: NextRequest) {
  return beginWorkshopSignIn(request, 'sign-up')
}
