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
import {
  MARKETING_ASSET_AUDIO_LENGTH_REFUSAL,
  MARKETING_ASSET_AUDIO_SIZE_REFUSAL,
  MARKETING_ASSET_AUDIO_TYPE_REFUSAL,
  MARKETING_ASSET_RIGHTS_REFUSAL,
} from '@/lib/marketing-asset/audio-type'
import {
  moveAudioBlobToSanity,
  moveBlobToSanity,
  type MoveRefusal,
} from '@/lib/marketing-asset/move'
import { abortAfter } from '@/lib/marketing-asset/blob-delete'
import { createMarketingAsset } from '@/lib/marketing-asset/sanity'
import { marketingAssetDetailsSchema } from '@/lib/marketing-asset/details'
import { resolveAssetDetailsForCurrentOrg } from '@/lib/marketing-asset/guard'
import type { ResolvedMarketingAssetDetails } from '@/lib/marketing-asset/details'
import {
  deleteFileAssetIfOrphaned,
  deleteImageAssetIfOrphaned,
} from '@/lib/sanity/orphaned-asset'
import { getCurrentDateTime } from '@/lib/time'

/** The streamed move of one image gets a minute, set explicitly (§4.1). */
export const maxDuration = 60

/** Kept back from `maxDuration`, so there is always time left to answer. */
const ANSWER_MARGIN_MS = 3_000

const UrlSchema = z.object({
  url: z.string().min(1).max(2048),
  // What the organizer says they uploaded, which picks the checks. The move
  // then judges the file from its own bytes against that kind.
  kind: z.enum(['image', 'audio']).default('image'),
  // An audio track's one confirmation (spec §6). Only `true` confirms.
  rightsConfirmed: z.unknown().optional(),
})

type Refusals = Record<MoveRefusal, { status: number; error: string }>

const REFUSALS: Refusals = {
  host: { status: 400, error: 'That upload is not one of ours.' },
  prefix: { status: 400, error: 'That upload is not one of ours.' },
  type: { status: 400, error: MARKETING_ASSET_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_SIZE_REFUSAL },
  // An image has no length; only the audio move refuses one.
  length: { status: 400, error: MARKETING_ASSET_SIZE_REFUSAL },
  fetch: { status: 502, error: 'The upload could not be read. Try again.' },
  upload: { status: 502, error: 'The image could not be stored. Try again.' },
}

const AUDIO_REFUSALS: Refusals = {
  ...REFUSALS,
  type: { status: 400, error: MARKETING_ASSET_AUDIO_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_AUDIO_SIZE_REFUSAL },
  length: { status: 400, error: MARKETING_ASSET_AUDIO_LENGTH_REFUSAL },
  upload: { status: 502, error: 'The track could not be stored. Try again.' },
}

/** What differs between the two kinds once the move has been chosen. */
const KINDS = {
  image: {
    missing: 'An image, a title and alt text are required.',
    refusals: REFUSALS,
    notAdded: 'The image could not be added. Try again.',
    deleteIfOrphaned: deleteImageAssetIfOrphaned,
  },
  audio: {
    missing: 'A track and a title are required.',
    refusals: AUDIO_REFUSALS,
    notAdded: 'The track could not be added. Try again.',
    deleteIfOrphaned: deleteFileAssetIfOrphaned,
  },
} as const

/**
 * Add an uploaded image or audio track to the organization's marketing asset
 * gallery (docs/MARKETING_ASSETS_SPEC.md §4.1,
 * docs/MARKETING_STUDIO_VIDEO_SPEC.md §6): move the browser's temporary blob
 * into Sanity, then write the gallery entry. A route handler rather than tRPC so the
 * move has an explicit `maxDuration`.
 *
 * Organizer of the request host's organization only, refused before the body
 * is read. The organization is resolved here, never read from the body, and
 * the URL is checked by the move before anything is fetched. A track needs
 * the rights confirmation BEFORE anything moves; who confirmed is the
 * session's organizer and when is this server's clock, never the body's.
 */
export async function POST(request: Request) {
  // Everything after the move is bounded by what is left of `maxDuration`.
  const answerBy = Date.now() + maxDuration * 1000 - ANSWER_MARGIN_MS
  const session = await getAuthSession()
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgId = await resolveCurrentOrgId()
  // The organizer a track's rights confirmation is recorded against.
  const organizerId = session?.speaker?._id
  if (!orgId || !organizerId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await request.json().catch(() => null)
  const parsedUrl = UrlSchema.safeParse(body)
  const parsed = marketingAssetDetailsSchema.safeParse(body)
  const audio = parsedUrl.success && parsedUrl.data.kind === 'audio'
  const kind = KINDS[audio ? 'audio' : 'image']
  if (!parsedUrl.success || !parsed.success) {
    // Title and alt text are what an organizer can fix in the form; any
    // other failing field (subject, tags, edition) gets its own message.
    const otherFieldFailed = parsed.error?.issues.some(
      (issue) => issue.path[0] !== 'title' && issue.path[0] !== 'alt',
    )
    return NextResponse.json(
      {
        error:
          parsedUrl.success && otherFieldFailed
            ? 'Those details cannot be saved. Check the subject and tags.'
            : kind.missing,
      },
      { status: 400 },
    )
  }
  if (!audio && !parsed.data.alt) {
    return NextResponse.json({ error: kind.missing }, { status: 400 })
  }
  if (audio && parsedUrl.data.rightsConfirmed !== true) {
    return NextResponse.json(
      { error: MARKETING_ASSET_RIGHTS_REFUSAL },
      { status: 400 },
    )
  }
  // Stamped when the confirmed request arrives, by this server.
  const confirmedAt = getCurrentDateTime()
  const { url } = parsedUrl.data
  // An audio track has no alt text: whatever was sent is not kept.
  if (audio) delete parsed.data.alt
  // Before the move, so a refused edition or subject leaves no image behind.
  // A new asset has no edition to keep. The guard's refusal never says
  // whether a foreign id exists.
  let details: ResolvedMarketingAssetDetails
  try {
    details = await resolveAssetDetailsForCurrentOrg(parsed.data)
  } catch {
    return NextResponse.json(
      {
        error:
          'That edition or subject is not one of this organization’s. Choose another.',
      },
      { status: 400 },
    )
  }

  const moved = audio
    ? await moveAudioBlobToSanity(url, orgId)
    : await moveBlobToSanity(url, orgId)
  if (!moved.ok) {
    const refusal = kind.refusals[moved.reason]
    return NextResponse.json(
      { error: refusal.error },
      { status: refusal.status },
    )
  }

  const writeDeadline = abortAfter(Math.max(0, answerBy - Date.now()))
  try {
    const created = await createMarketingAsset(
      'durationSeconds' in moved.asset
        ? {
            orgId,
            details,
            kind: 'audio',
            fileAssetId: moved.asset._id,
            ...(moved.asset.created
              ? { createdFileAssetId: moved.asset._id }
              : {}),
            durationSeconds: moved.asset.durationSeconds,
            // The organizer who made this request, proven one above.
            rights: { confirmedBy: organizerId, confirmedAt },
          }
        : {
            orgId,
            details,
            imageAssetId: moved.asset._id,
            ...(moved.asset.created
              ? { createdImageAssetId: moved.asset._id }
              : {}),
          },
      { signal: writeDeadline.signal },
    )
    return NextResponse.json({
      _id: created._id,
      softOnSocial:
        'width' in moved.asset ? isSoftOnSocial(moved.asset) : false,
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
        await kind.deleteIfOrphaned(assetId)
      })
    return NextResponse.json({ error: kind.notAdded }, { status: 500 })
  } finally {
    writeDeadline.clear()
  }
}
