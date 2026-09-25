import { NextResponse, after } from 'next/server'
import { z } from 'zod'
import { getAuthSession } from '@/lib/auth'
import {
  isOrganizerForCurrentOrg,
  resolveCurrentOrgId,
} from '@/lib/authz/organizer'
import {
  MARKETING_ASSET_SIZE_REFUSAL,
  MARKETING_ASSET_TYPE_REFUSAL,
  isSoftOnSocial,
} from '@/lib/marketing-asset/image-type'
import { moveBlobToSanity, type MoveRefusal } from '@/lib/marketing-asset/move'
import { abortAfter } from '@/lib/marketing-asset/blob-delete'
import { createMarketingAsset } from '@/lib/marketing-asset/sanity'
import { deleteImageAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'

/** The streamed move of one image gets a minute, set explicitly (§4.1). */
export const maxDuration = 60

/** Kept back from `maxDuration`, so there is always time left to answer. */
const ANSWER_MARGIN_MS = 3_000

const InputSchema = z.object({
  url: z.string().min(1).max(2048),
  title: z.string().trim().min(1).max(200),
  alt: z.string().trim().min(1).max(1000),
})

const REFUSALS: Record<MoveRefusal, { status: number; error: string }> = {
  host: { status: 400, error: 'That upload is not one of ours.' },
  prefix: { status: 400, error: 'That upload is not one of ours.' },
  type: { status: 400, error: MARKETING_ASSET_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_SIZE_REFUSAL },
  fetch: { status: 502, error: 'The upload could not be read. Try again.' },
  upload: { status: 502, error: 'The image could not be stored. Try again.' },
}

/**
 * Add an uploaded image to the organization's marketing asset gallery
 * (docs/MARKETING_ASSETS_SPEC.md §4.1): move the browser's temporary blob into
 * Sanity, then write the gallery entry. A route handler rather than tRPC so the
 * move has an explicit `maxDuration`.
 *
 * Organizer of the request host's organization only, refused before the body
 * is read. The organization is resolved here, never read from the body, and
 * the URL is checked by the move before anything is fetched.
 */
export async function POST(request: Request) {
  // Everything after the move is bounded by what is left of `maxDuration`.
  const answerBy = Date.now() + maxDuration * 1000 - ANSWER_MARGIN_MS
  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgId = await resolveCurrentOrgId()
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = InputSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'An image, a title and alt text are required.' },
      { status: 400 },
    )
  }
  const { url, title, alt } = parsed.data

  const moved = await moveBlobToSanity(url, orgId)
  if (!moved.ok) {
    const refusal = REFUSALS[moved.reason]
    return NextResponse.json(
      { error: refusal.error },
      { status: refusal.status },
    )
  }

  const writeDeadline = abortAfter(Math.max(0, answerBy - Date.now()))
  try {
    const created = await createMarketingAsset(
      {
        orgId,
        title,
        alt,
        imageAssetId: moved.asset._id,
        ...(moved.asset.created
          ? { createdImageAssetId: moved.asset._id }
          : {}),
      },
      { signal: writeDeadline.signal },
    )
    return NextResponse.json({
      _id: created._id,
      softOnSocial: isSoftOnSocial(moved.asset),
    })
  } catch (error) {
    console.error('Marketing asset: gallery entry not written', error)
    // After the answer, not before it: the cleanup must never be what pushes
    // the route past `maxDuration`. Sanity dedupes identical uploads across
    // tenants, so an image it already held may be another tenant's, possibly
    // not yet referenced: never ours to delete. A created one goes only if
    // still unreferenced, so an entry that did land after all keeps it.
    const assetId = moved.asset._id
    if (moved.asset.created)
      after(async () => {
        await deleteImageAssetIfOrphaned(assetId)
      })
    return NextResponse.json(
      { error: 'The image could not be added. Try again.' },
      { status: 500 },
    )
  } finally {
    writeDeadline.clear()
  }
}
