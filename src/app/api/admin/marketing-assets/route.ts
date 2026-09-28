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
  VIDEO_UPLOAD_DEADLINE_MS,
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
import { resolveAssetDetailsForCurrentOrg } from '@/lib/marketing-asset/guard'
import type { ResolvedMarketingAssetDetails } from '@/lib/marketing-asset/details'
import {
  deleteFileAssetIfOrphaned,
  deleteImageAssetIfOrphaned,
} from '@/lib/sanity/orphaned-asset'
import { getCurrentDateTime } from '@/lib/time'

/**
 * Set explicitly (§4.1): the streamed move of a 100 MB video, with its poster,
 * the gallery write and the answer. An image's move keeps its own 45 s
 * deadline; a video's is {@link VIDEO_UPLOAD_DEADLINE_MS}, inside this.
 */
export const maxDuration = 300

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
    deleteIfOrphaned: deleteImageAssetIfOrphaned,
  },
  gif: {
    missing: 'A GIF, a title and alt text are required.',
    refusals: GIF_REFUSALS,
    notAdded: 'The GIF could not be added. Try again.',
    deleteIfOrphaned: deleteImageAssetIfOrphaned,
  },
  video: {
    missing: 'A video, its poster, a title and alt text are required.',
    refusals: VIDEO_REFUSALS,
    notAdded: 'The video could not be added. Try again.',
    deleteIfOrphaned: deleteFileAssetIfOrphaned,
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
  // Only the image write takes it: a track, GIF or video is never a studio
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

  const moved = await moveFor(kindName, url, posterUrl, orgId)
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
    // After the answer, not before it: the cleanup must never be what pushes
    // the route past `maxDuration`. Sanity dedupes identical uploads across
    // tenants, so an asset it already held may be another tenant's, possibly
    // not yet referenced: never ours to delete. A created one goes only if
    // still unreferenced, so an entry that did land after all keeps it.
    const created = moved.created
    if (created.length > 0)
      after(async () => {
        for (const file of created) await file.deleteIfOrphaned(file.id)
      })
    return NextResponse.json({ error: kind.notAdded }, { status: 500 })
  } finally {
    writeDeadline.clear()
  }
}

/**
 * The gallery entry to write for what moved: a track takes the rights
 * confirmation, only an image takes the studio it was saved from.
 */
function newAsset(
  fields: MovedFields,
  base: { orgId: string; details: ResolvedMarketingAssetDetails },
  extra: {
    rights: { confirmedBy: string; confirmedAt: string }
    studio: StudioOriginInput | undefined
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
  return { ...base, ...fields }
}

/** One Sanity asset a move made, with the orphan check that removes it. */
interface CreatedFile {
  id: string
  deleteIfOrphaned: (id: string) => Promise<unknown>
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
      /** What this move created, for the cleanup if the write fails. */
      created: CreatedFile[]
    }
  | { ok: false; reason: MoveRefusal | 'poster' }

const createdImage = (asset: { _id: string; created: boolean }) =>
  asset.created
    ? [{ id: asset._id, deleteIfOrphaned: deleteImageAssetIfOrphaned }]
    : []
const createdFile = (asset: { _id: string; created: boolean }) =>
  asset.created
    ? [{ id: asset._id, deleteIfOrphaned: deleteFileAssetIfOrphaned }]
    : []

/**
 * Move the upload into Sanity by its kind. A video moves its poster FIRST
 * (small, and refused like any image) and then streams the MP4; a refusal of
 * either leaves nothing behind: the other blob is discarded, and a poster
 * already stored goes through the orphan check after the answer.
 */
async function moveFor(
  kind: 'image' | 'gif' | 'video' | 'audio',
  url: string,
  posterUrl: string | undefined,
  orgId: string,
): Promise<Moved> {
  if (kind === 'audio') {
    const moved = await moveAudioBlobToSanity(url, orgId)
    if (!moved.ok) return moved
    return {
      ok: true,
      fields: {
        kind: 'audio',
        fileAssetId: moved.asset._id,
        ...(moved.asset.created ? { createdFileAssetId: moved.asset._id } : {}),
        durationSeconds: moved.asset.durationSeconds,
      },
      softOnSocial: false,
      created: createdFile(moved.asset),
    }
  }
  if (kind === 'video') {
    if (!posterUrl) return { ok: false, reason: 'poster' }
    const poster = await moveBlobToSanity(posterUrl, orgId)
    if (!poster.ok) {
      discardBlob(url, orgId)
      return { ok: false, reason: 'poster' }
    }
    const video = await moveVideoBlobToSanity(url, orgId)
    if (!video.ok) {
      const posterId = poster.asset._id
      if (poster.asset.created)
        after(async () => {
          await deleteImageAssetIfOrphaned(posterId)
        })
      return video
    }
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
      created: [...createdFile(video.asset), ...createdImage(poster.asset)],
    }
  }
  // A poster belongs to a video only: any other kind never moves one.
  if (posterUrl) discardBlob(posterUrl, orgId)
  const moved =
    kind === 'gif'
      ? await moveGifBlobToSanity(url, orgId)
      : await moveBlobToSanity(url, orgId)
  if (!moved.ok) return moved
  return {
    ok: true,
    fields: {
      kind: kind === 'gif' ? 'gif' : 'image',
      imageAssetId: moved.asset._id,
      ...(moved.asset.created ? { createdImageAssetId: moved.asset._id } : {}),
    },
    softOnSocial: isSoftOnSocial(moved.asset),
    created: createdImage(moved.asset),
  }
}
