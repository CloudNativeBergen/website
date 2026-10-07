import type { NextRequest } from 'next/server'
import { startWorkshopSignIn } from '@/lib/workshop/sign-in-start'

/** `GET /workshop/sign-in` — start a WorkOS sign-in on this host (#1296). */
export function GET(request: NextRequest) {
  return startWorkshopSignIn(request, 'sign-in')
}
