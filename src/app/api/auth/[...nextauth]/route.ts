import type { NextRequest } from 'next/server'
import { handlers } from '@/lib/auth'
import { linkResultStore } from '@/lib/auth-link'

const { GET: rawGET, POST: rawPOST } = handlers

// Run every auth request inside a fresh link-result store. During the Phase-2
// "link another provider" callback, the `jwt` callback writes the outcome into
// this store and the `redirect` callback reads it to append `?linkResult=...`
// to the post-login URL. Isolating it per request keeps it concurrency-safe.
export function GET(req: NextRequest): Promise<Response> {
  return linkResultStore.run({}, () => rawGET(req))
}

export function POST(req: NextRequest): Promise<Response> {
  return linkResultStore.run({}, () => rawPOST(req))
}
