import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isConferenceUnavailable, isUnknownHost } from '@/lib/conference/guard'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { WALL_DEVICE_COOKIE, readWallDevice } from '@/lib/photo-wall/device'
import { submitWallPost, type WallSubmitRefusal } from '@/lib/photo-wall/submit'

/**
 * Vercel's request body limit (4.5 MB): the composer's JPEG is at most
 * 4 MiB, so a whole submit fits under it (Photo Wall spec §6.2).
 */
const MAX_SUBMIT_BYTES = 4_500_000

/**
 * The status of each refusal. The body says which one (`{ ok: false,
 * refusal }`); the phone shows its message and never retries a 4xx.
 */
const STATUS: Record<WallSubmitRefusal | 'tooLarge', number> = {
  pendingDevice: 429,
  hourly: 429,
  pendingWall: 429,
  closed: 403,
  failed: 400,
  tooLarge: 413,
}

const refused = (refusal: WallSubmitRefusal, status = STATUS[refusal]) =>
  NextResponse.json({ ok: false, refusal }, { status })

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
 * `marketingConsent`). A Route Handler, not a Server Action: those take 1 MB
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
    return refused('failed', STATUS.tooLarge)
  }
  const body = await readCapped(request, MAX_SUBMIT_BYTES)
  if (!body) return refused('failed', STATUS.tooLarge)
  let form: FormData
  try {
    form = await new Response(body as BodyInit, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData()
  } catch {
    return refused('failed')
  }

  const resolution = await getConferenceForCurrentDomain()
  // A failed read is not a refusal: a 5xx, so the phone retries.
  if (isConferenceUnavailable(resolution)) {
    throw new Error('Could not read the conference for this Photo Wall')
  }
  if (isUnknownHost(resolution)) return refused('failed', 404)

  const device = readWallDevice(
    (await cookies()).get(WALL_DEVICE_COOKIE)?.value,
  )
  const outcome = await submitWallPost({
    conference: resolution.conference,
    device,
    form,
    now: new Date(),
  })
  return outcome.ok ? NextResponse.json({ ok: true }) : refused(outcome.refusal)
}
