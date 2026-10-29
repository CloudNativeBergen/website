import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth'
import type { WallSubmitRefusal } from '@/lib/photo-wall/post'
import { readDeviceCookie, wallConference } from '@/lib/photo-wall/request'
import { submitWallPost } from '@/lib/photo-wall/submit'

/**
 * Vercel's request body limit (4.5 MB): the composer's JPEG is at most
 * 4 MiB, so a whole submit fits under it (Photo Wall spec §6.2).
 */
const MAX_SUBMIT_BYTES = 4_500_000

/** Why the route refused: the submit's own reasons, and the route's. */
type Refusal = WallSubmitRefusal | 'tooLarge' | 'malformed' | 'unknownHost'

/**
 * The status and body of each refusal. The body names a refusal the phone
 * knows (`{ ok: false, refusal }`); the phone shows its message and never
 * retries a 4xx.
 */
const ANSWER: Record<Refusal, [number, WallSubmitRefusal]> = {
  pendingDevice: [429, 'pendingDevice'],
  hourly: [429, 'hourly'],
  pendingWall: [429, 'pendingWall'],
  closed: [403, 'closed'],
  failed: [400, 'failed'],
  malformed: [400, 'failed'],
  unknownHost: [404, 'failed'],
  tooLarge: [413, 'failed'],
}

const refused = (why: Refusal) => {
  const [status, refusal] = ANSWER[why]
  return NextResponse.json({ ok: false, refusal }, { status })
}

/**
 * The body, read once and at most `max` bytes of it, or null past that: a
 * request without a `Content-Length` (chunked) is held to the same cap.
 */
async function readCapped(
  request: Request,
  max: number,
): Promise<Uint8Array | null> {
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.length
  }
  return body
}

/**
 * `POST /wall/post/submit` (Photo Wall spec §6.2): one Wall Post, multipart
 * (`photo`, `uploadId`, `caption`, `name`, `cropX`, `cropY`,
 * `marketingConsent`, optional `talkId`). A Route Handler, not a Server Action: those take 1 MB
 * by default. Under `/wall`, so the `Path=/wall` device cookie arrives. The
 * conference comes from the Host, never from the body.
 *
 * Answers 200 `{ ok: true }`, or a 4xx `{ ok: false, refusal }` when no post
 * was created. Anything else (a 5xx, a lost answer) may have created it: the
 * phone retries with the same `uploadId`, and the retry converges.
 */
export async function POST(request: Request) {
  // Before the body is read: Vercel answers 413 above its own limit anyway.
  if (Number(request.headers.get('content-length')) > MAX_SUBMIT_BYTES) {
    return refused('tooLarge')
  }
  const body = await readCapped(request, MAX_SUBMIT_BYTES)
  if (!body) return refused('tooLarge')
  let form: FormData
  try {
    form = await new Response(body as BodyInit, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData()
  } catch {
    return refused('malformed')
  }

  const host = await wallConference()
  // A failed read is not a refusal: a 5xx, so the phone retries.
  if (!host.ok && host.reason === 'unavailable') {
    throw new Error('Could not read the conference for this Photo Wall')
  }
  if (!host.ok) return refused('unknownHost')

  const outcome = await submitWallPost({
    conference: host.conference,
    device: await readDeviceCookie(),
    form,
    now: new Date(),
    // The session cookie is on `Path=/`, so it arrives here too (§6.6).
    session: await getAuthSession({
      url: request.url,
      headers: request.headers,
    }),
  })
  return outcome.ok ? NextResponse.json({ ok: true }) : refused(outcome.refusal)
}
