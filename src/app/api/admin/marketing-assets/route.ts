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
  MARKETING_ASSET_AUDIO_UNREADABLE_REFUSAL,
  MARKETING_ASSET_RIGHTS_REFUSAL,
  MARKETING_ASSET_WAV_FORMAT_REFUSAL,
} from '@/lib/marketing-asset/audio-type'
import {
  MARKETING_ASSET_GIF_SIZE_REFUSAL,
  MARKETING_ASSET_GIF_TYPE_REFUSAL,
  MARKETING_ASSET_VIDEO_SIZE_REFUSAL,
  MARKETING_ASSET_VIDEO_TYPE_REFUSAL,
} from '@/lib/marketing-asset/motion-type'
import {
  discardBlob,
  moveAudioBlobToSanity,
  moveBlobToSanity,
  moveGifBlobToSanity,
  moveVideoBlobToSanity,
  type MoveRefusal,
} from '@/lib/marketing-asset/move'
import type { NewMarketingAsset } from '@/lib/marketing-asset/sanity'
import { abortAfter } from '@/lib/marketing-asset/blob-delete'
import { createMarketingAsset } from '@/lib/marketing-asset/sanity'
import { marketingAssetDetailsSchema } from '@/lib/marketing-asset/details'
import {
  studioOriginSchema,
  type StudioOriginInput,
} from '@/lib/marketing-asset/studio'
import {
  resolveAssetDetailsForCurrentOrg,
  resolveVideoLineage,
} from '@/lib/marketing-asset/guard'
import type { ResolvedMarketingAssetDetails } from '@/lib/marketing-asset/details'
import {
  recordPendingCleanup,
  unqueuePendingCleanup,
} from '@/lib/marketing-asset/pending-cleanup'
import { getCurrentDateTime } from '@/lib/time'

/**
 * Set explicitly (§4.1): the streamed move of a 100 MB video, with its poster,
 * the gallery write and the answer. An image's move keeps its own 45 s
 * deadline; a video’s is `VIDEO_UPLOAD_DEADLINE_MS` (move.ts), inside this.
 */
export const maxDuration = 300

/**
 * What a video's move leaves for the gallery write and the cleanup after it,
 * inside {@link ANSWER_MARGIN_MS}.
 */
const WRITE_RESERVE_MS = 15_000

/** Kept back from `maxDuration`, so there is always time left to answer. */
const ANSWER_MARGIN_MS = 3_000

const UrlSchema = z.object({
  url: z.string().min(1).max(2048),
  // What the organizer says they uploaded, which picks the checks. The move
  // then judges the file from its own bytes against that kind.
  kind: z.enum(['image', 'gif', 'video', 'audio']).default('image'),
  // A video's poster: its first frame, drawn in the browser and uploaded as
  // a second, image, blob. Checked and moved exactly as an image is.
  posterUrl: z.string().min(1).max(2048).optional(),
  // An audio track's one confirmation (spec §6). Only `true` confirms.
  rightsConfirmed: z.unknown().optional(),
})

// "Save to gallery" in the studio (spec §4.2) names the tab it saved from. The
// speaker or sponsor it was opened on is the subject, checked by the guard.
const StudioSchema = z.object({ studio: studioOriginSchema.optional() })

type Refusals = Record<MoveRefusal, { status: number; error: string }>

const REFUSALS: Refusals = {
  host: { status: 400, error: 'That upload is not one of ours.' },
  prefix: { status: 400, error: 'That upload is not one of ours.' },
  type: { status: 400, error: MARKETING_ASSET_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_SIZE_REFUSAL },
  // An image has no length; only the audio move refuses these.
  length: { status: 400, error: MARKETING_ASSET_SIZE_REFUSAL },
  unreadable: { status: 400, error: MARKETING_ASSET_TYPE_REFUSAL },
  'wav-format': { status: 400, error: MARKETING_ASSET_TYPE_REFUSAL },
  fetch: { status: 502, error: 'The upload could not be read. Try again.' },
  upload: { status: 502, error: 'The image could not be stored. Try again.' },
}

const AUDIO_REFUSALS: Refusals = {
  ...REFUSALS,
  type: { status: 400, error: MARKETING_ASSET_AUDIO_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_AUDIO_SIZE_REFUSAL },
  length: { status: 400, error: MARKETING_ASSET_AUDIO_LENGTH_REFUSAL },
  unreadable: { status: 400, error: MARKETING_ASSET_AUDIO_UNREADABLE_REFUSAL },
  'wav-format': { status: 400, error: MARKETING_ASSET_WAV_FORMAT_REFUSAL },
  upload: { status: 502, error: 'The track could not be stored. Try again.' },
}

const GIF_REFUSALS: Refusals = {
  ...REFUSALS,
  type: { status: 400, error: MARKETING_ASSET_GIF_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_GIF_SIZE_REFUSAL },
  upload: { status: 502, error: 'The GIF could not be stored. Try again.' },
}

const VIDEO_REFUSALS: Refusals = {
  ...REFUSALS,
  type: { status: 400, error: MARKETING_ASSET_VIDEO_TYPE_REFUSAL },
  size: { status: 400, error: MARKETING_ASSET_VIDEO_SIZE_REFUSAL },
  upload: { status: 502, error: 'The video could not be stored. Try again.' },
}

/** A poster the move refuses: the browser drew it, so it is ours to fix. */
const POSTER_REFUSED = {
  status: 400,
  error: 'The video’s poster could not be read. Pick the video again.',
}

/** What differs between the kinds once the move has been chosen. */
const KINDS = {
  image: {
    missing: 'An image, a title and alt text are required.',
    refusals: REFUSALS,
    notAdded: 'The image could not be added. Try again.',
  },
  gif: {
    missing: 'A GIF, a title and alt text are required.',
    refusals: GIF_REFUSALS,
    notAdded: 'The GIF could not be added. Try again.',
  },
  video: {
    missing: 'A video, its poster, a title and alt text are required.',
    refusals: VIDEO_REFUSALS,
    notAdded: 'The video could not be added. Try again.',
  },
  audio: {
    missing: 'A track and a title are required.',
    refusals: AUDIO_REFUSALS,
    notAdded: 'The track could not be added. Try again.',
  },
} as const

/**
 * Add an uploaded image or audio track to the organization's marketing asset
 * gallery (docs/MARKETING_ASSETS_SPEC.md §4.1,
 * docs/MARKETING_STUDIO_VIDEO_SPEC.md §6): move the browser's temporary blob
 * into Sanity, then write the gallery entry — also for "Save to gallery" in the
 * studio (spec §4.2), which names its tab. A route handler rather than tRPC so the
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
  const kindName = parsedUrl.success ? parsedUrl.data.kind : 'image'
  const audio = kindName === 'audio'
  const kind = KINDS[kindName]
  if (!parsedUrl.success || !parsed.success) {
    // Nothing will move what was uploaded for this request: delete it after
    // the answer. `discardBlob` pins each URL to our store and this
    // organization's prefix first; anything else is never touched.
    for (const known of uploadedUrls(body)) discardBlob(known, orgId)
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
  // From here a refusal before the move leaves an upload nobody will move:
  // delete it (after the answer) rather than leave it to the sweeper.
  const { posterUrl } = parsedUrl.data
  const discard = () => {
    discardBlob(parsedUrl.data.url, orgId)
    if (posterUrl) discardBlob(posterUrl, orgId)
  }
  const parsedStudio = StudioSchema.safeParse(body)
  if (!parsedStudio.success) {
    discard()
    return NextResponse.json(
      { error: 'Those details cannot be saved. Check the studio tab.' },
      { status: 400 },
    )
  }
  // The image and the video write take it: a track or GIF is never a studio
  // render.
  const { studio } = parsedStudio.data
  // Alt text for every kind but a track (spec §3); a video needs its poster.
  if ((!audio && !parsed.data.alt) || (kindName === 'video' && !posterUrl)) {
    discard()
    return NextResponse.json({ error: kind.missing }, { status: 400 })
  }
  if (audio && parsedUrl.data.rightsConfirmed !== true) {
    discard()
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
    discard()
    return NextResponse.json(
      {
        error:
          'That edition or subject is not one of this organization’s. Choose another.',
      },
      { status: 400 },
    )
  }

  // An exported video's project and sources (#1182) are client ids: the
  // project is proven ours before the move, like the subject, and the
  // refusal never says whether it exists; a source that is not ours is
  // simply not recorded.
  let sourceFileIds: string[] = []
  if (
    kindName === 'video' &&
    studio?.tab === 'meme-generator' &&
    (studio.projectId || studio.sources?.length)
  ) {
    try {
      ;({ sourceFileIds } = await resolveVideoLineage(orgId, studio))
    } catch {
      discard()
      return NextResponse.json(
        { error: 'That project is not one of this organization’s.' },
        { status: 400 },
      )
    }
  }

  const moved = await moveFor(kindName, url, posterUrl, orgId, answerBy)
  if (!moved.ok) {
    const refusal =
      moved.reason === 'poster' ? POSTER_REFUSED : kind.refusals[moved.reason]
    return NextResponse.json(
      { error: refusal.error },
      { status: refusal.status },
    )
  }

  const writeDeadline = abortAfter(Math.max(0, answerBy - Date.now()))
  try {
    const created = await createMarketingAsset(
      newAsset(
        moved.fields,
        { orgId, details },
        {
          // The organizer who made this request, proven one above.
          rights: { confirmedBy: organizerId, confirmedAt },
          studio,
          sourceFileIds,
        },
      ),
      { signal: writeDeadline.signal },
    )
    return NextResponse.json({
      _id: created._id,
      softOnSocial: moved.softOnSocial,
    })
  } catch (error) {
    console.error('Marketing asset: gallery entry not written', error)
    // After the answer, not before it: recording must never be what pushes
    // the route past `maxDuration`. Never deleted here: Sanity dedupes
    // identical bytes, so a file this upload saw created may be another
    // upload's too, still moving and not yet referenced. The delayed orphan
    // check (`pending-cleanup.ts`) deletes it once no concurrent move can be
    // in flight, and only if nothing references it.
    const created = moved.created
    if (created.length > 0) after(() => recordPendingCleanup(created))
    return NextResponse.json({ error: kind.notAdded }, { status: 500 })
  } finally {
    writeDeadline.clear()
  }
}

/**
 * The upload URLs a refused body names, read leniently (the schema may be
 * what refused it): any string under `url` or `posterUrl`, within the
 * schema's length. Only candidates — `discardBlob` decides which are ours.
 */
function uploadedUrls(body: unknown): string[] {
  if (typeof body !== 'object' || body === null) return []
  const { url, posterUrl } = body as Record<string, unknown>
  return [url, posterUrl].filter(
    (value): value is string =>
      typeof value === 'string' && value.length > 0 && value.length <= 2048,
  )
}

/**
 * The gallery entry to write for what moved: a track takes the rights
 * confirmation; an image, or a video exported from the meme generator
 * (#1182), takes the studio it was saved from.
 */
function newAsset(
  fields: MovedFields,
  base: { orgId: string; details: ResolvedMarketingAssetDetails },
  extra: {
    rights: { confirmedBy: string; confirmedAt: string }
    studio: StudioOriginInput | undefined
    /** The files the named project holds (#1182); empty without one. */
    sourceFileIds: string[]
  },
): NewMarketingAsset {
  if (fields.kind === 'audio')
    return { ...base, ...fields, rights: extra.rights }
  if (fields.kind === 'image')
    return {
      ...base,
      ...fields,
      ...(extra.studio ? { studio: extra.studio } : {}),
    }
  // Only the meme generator makes videos: another tab's claim is dropped.
  if (fields.kind === 'video')
    return {
      ...base,
      ...fields,
      ...(extra.studio?.tab === 'meme-generator'
        ? {
            studio: extra.studio,
            ...(extra.sourceFileIds.length > 0
              ? { sourceFileIds: extra.sourceFileIds }
              : {}),
          }
        : {}),
    }
  return { ...base, ...fields }
}

/** The fields each kind writes, as `createMarketingAsset` takes them. */
type MovedFields =
  | {
      kind: 'image' | 'gif'
      imageAssetId: string
      createdImageAssetId?: string
    }
  | {
      kind: 'video'
      fileAssetId: string
      createdFileAssetId?: string
      posterAssetId: string
      createdImageAssetId?: string
    }
  | {
      kind: 'audio'
      fileAssetId: string
      createdFileAssetId?: string
      durationSeconds: number
    }

type Moved =
  | {
      ok: true
      fields: MovedFields
      softOnSocial: boolean
      /** The asset ids this move saw created, for the cleanup if the write fails. */
      created: string[]
    }
  | { ok: false; reason: MoveRefusal | 'poster' }

const createdIds = (...assets: { _id: string; created: boolean }[]) =>
  assets.filter((asset) => asset.created).map((asset) => asset._id)

/**
 * Move the upload into Sanity by its kind. A video moves its poster FIRST
 * (small, and refused like any image) and then streams the MP4; a refusal of
 * either leaves nothing behind: the other blob is discarded, and a poster
 * already stored is recorded for the delayed orphan check.
 *
 * Every asset a move returns is taken off that queue BEFORE the route goes
 * on: Sanity hands a later upload of the same bytes the same asset, which a
 * failed upload may have queued, and nothing references it until the
 * gallery write.
 */
async function moveFor(
  kind: 'image' | 'gif' | 'video' | 'audio',
  url: string,
  posterUrl: string | undefined,
  orgId: string,
  /** When the route must answer: the video's move ends in time to write. */
  answerBy: number,
): Promise<Moved> {
  // A poster belongs to a video only: any other kind never moves one.
  if (kind !== 'video' && posterUrl) discardBlob(posterUrl, orgId)
  if (kind === 'audio') {
    const moved = await moveAudioBlobToSanity(url, orgId)
    if (!moved.ok) return moved
    await unqueuePendingCleanup([moved.asset._id])
    return {
      ok: true,
      fields: {
        kind: 'audio',
        fileAssetId: moved.asset._id,
        ...(moved.asset.created ? { createdFileAssetId: moved.asset._id } : {}),
        durationSeconds: moved.asset.durationSeconds,
      },
      softOnSocial: false,
      created: createdIds(moved.asset),
    }
  }
  if (kind === 'video') {
    if (!posterUrl) return { ok: false, reason: 'poster' }
    const poster = await moveBlobToSanity(posterUrl, orgId)
    if (!poster.ok) {
      discardBlob(url, orgId)
      return { ok: false, reason: 'poster' }
    }
    // Before the MP4 streams: that is the longest the poster goes unreferenced.
    await unqueuePendingCleanup([poster.asset._id])
    // Whatever the poster and the checks before it took comes off the
    // video's time, so the gallery write and the cleanup still fit.
    const video = await moveVideoBlobToSanity(
      url,
      orgId,
      answerBy - Date.now() - WRITE_RESERVE_MS,
    )
    if (!video.ok) {
      // Recorded for the delayed orphan check, never deleted now: see the
      // write's failure below.
      const posterIds = createdIds(poster.asset)
      if (posterIds.length > 0) after(() => recordPendingCleanup(posterIds))
      return video
    }
    await unqueuePendingCleanup([video.asset._id])
    return {
      ok: true,
      fields: {
        kind: 'video',
        fileAssetId: video.asset._id,
        ...(video.asset.created ? { createdFileAssetId: video.asset._id } : {}),
        posterAssetId: poster.asset._id,
        ...(poster.asset.created
          ? { createdImageAssetId: poster.asset._id }
          : {}),
      },
      softOnSocial: isSoftOnSocial(poster.asset),
      created: createdIds(video.asset, poster.asset),
    }
  }
  const moved =
    kind === 'gif'
      ? await moveGifBlobToSanity(url, orgId)
      : await moveBlobToSanity(url, orgId)
  if (!moved.ok) return moved
  await unqueuePendingCleanup([moved.asset._id])
  return {
    ok: true,
    fields: {
      kind: kind === 'gif' ? 'gif' : 'image',
      imageAssetId: moved.asset._id,
      ...(moved.asset.created ? { createdImageAssetId: moved.asset._id } : {}),
    },
    softOnSocial: isSoftOnSocial(moved.asset),
    created: createdIds(moved.asset),
  }
}
