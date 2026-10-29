import type { NextRequest } from 'next/server'
import { redeemWorkshopHandOff } from '@/lib/workshop/central-sign-in'

/** `GET /workshop/redeem`: the hand-off becomes this host's session (#1311). */
export function GET(request: NextRequest) {
  return redeemWorkshopHandOff(request)
}
