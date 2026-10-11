import type { NextRequest } from 'next/server'
import { startCentralSignOut } from '@/lib/workshop/central-sign-in'

/** `GET /api/auth/workshop/sign-out`: the auth host ends the WorkOS login (#1315). */
export function GET(request: NextRequest) {
  return startCentralSignOut(request)
}
