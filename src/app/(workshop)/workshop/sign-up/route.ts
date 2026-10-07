import type { NextRequest } from 'next/server'
import { startWorkshopSignIn } from '@/lib/workshop/sign-in-start'

/** `GET /workshop/sign-up` — start a WorkOS sign-up on this host (#1296). */
export function GET(request: NextRequest) {
  return startWorkshopSignIn(request, 'sign-up')
}
