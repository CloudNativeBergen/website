import type { NextRequest } from 'next/server'
import { finishCentralSignOut } from '@/lib/workshop/central-sign-in'

/**
 * `GET /api/auth/workshop/signed-out`: where WorkOS sends the browser after a
 * logout (#1315). The ONE sign-out redirect registered with WorkOS.
 */
export function GET(request: NextRequest) {
  return finishCentralSignOut(request)
}
