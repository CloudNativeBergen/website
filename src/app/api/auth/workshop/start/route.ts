import type { NextRequest } from 'next/server'
import { startCentralSignIn } from '@/lib/workshop/central-sign-in'

/** `GET /api/auth/workshop/start`: the auth host starts a workshop sign-in (#1313). */
export function GET(request: NextRequest) {
  return startCentralSignIn(request)
}
