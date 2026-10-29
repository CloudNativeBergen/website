import type { NextRequest } from 'next/server'
import { openEarlyAccessLink } from '@/lib/workshop/early-access'

/** `GET /workshop/early-access/<token>`: open a sponsor's early-access link (#1346). */
export async function GET(
  request: NextRequest,
  segment: { params: Promise<{ token: string }> },
) {
  return openEarlyAccessLink(request, (await segment.params).token)
}
