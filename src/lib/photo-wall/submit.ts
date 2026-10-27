/**
 * SUBMIT (Photo Wall spec §6.2): one Wall Post from a phone, in the spec's
 * order, GUARD BEFORE UPLOAD: nothing reaches Sanity's asset store until
 * every check has passed. Then the upload (§5), a strict `create` of the
 * pending post, and the tag expiries (§8).
 *
 * Retries converge on one post: the id is `wallPost-<uploadId>`, so a retry
 * after a lost response finds its post and succeeds without uploading again,
 * even once posting has closed. Every read that decides is on the NON-CDN
 * client (a CDN read lags the previous write).
 *
 * Answers `{ ok: false }` only when no post can come of this request: a
 * check refused it, or Sanity answered the create with a 4xx. Anything it
 * cannot tell (a read failing, or a create that failed in transport or with
 * a 5xx and may still commit) throws, so the route answers 500 and the phone
 * retries with the same `uploadId`, which converges on the post if it landed.
 */
import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { sanityStatus } from '@/lib/sanity/status'
import { expireWallPost } from './cache'
import { deleteWallAsset } from './delete'
import type { WallDevice } from './device'
import { checkWallFields, isUploadId, type WallPostFields } from './fields'
import { MAX_PHOTO_BYTES, checkWallPhoto } from './jpeg-check'
import { postingLimitHit, readPostingCounts } from './limits'
import type { WallSubmitRefusal } from './post'
import { readPhotoWall } from './sanity'
import { isConferenceTalk } from './talk-tag'
import { isPostingOpen } from './window'

/**
 * A refusal is a limit, posting not open, or the generic refusal for
 * everything else, a foreign `uploadId` included: it must not tell anyone a
 * post with that id exists.
 */
export type WallSubmitOutcome =
  { ok: true } | { ok: false; refusal: WallSubmitRefusal }

export interface WallSubmitRequest {
  /** The Host's conference, never the client's. */
  conference: {
    _id: string
    startDate?: string | null
    endDate?: string | null
  }
  /** The `/wall` cookie's device, or null without a valid one (§6.1). */
  device: WallDevice | null
  /** The multipart body, parsed once. */
  form: FormData
  now: Date
}

export const wallPostId = (uploadId: string) => `wallPost-${uploadId}`

interface StoredPost {
  _type?: string
  conference?: { _ref?: string }
  deviceKey?: string
}

/** This device's post on this conference's wall. */
const isOwnPost = (
  doc: StoredPost | null | undefined,
  conferenceId: string,
  deviceKey: string,
) =>
  doc?._type === 'wallPost' &&
  doc.conference?._ref === conferenceId &&
  doc.deviceKey === deviceKey

/**
 * The post as stored now, through the doc endpoint: the document store
 * itself, past the query index's lag. The id is a checked UUID, so it can't
 * smuggle the endpoint's comma-separated id list.
 */
const readPost = (uploadId: string) =>
  clientReadUncached.getDocument<StoredPost & { _id: string }>(
    wallPostId(uploadId),
  )

const refuse = (refusal: WallSubmitRefusal, why: string): WallSubmitOutcome => {
  // The reason only, never the content: the organizer never sees refusals
  // (§6.3), the logs are where a pattern of them shows up.
  console.warn(`Photo Wall submit refused: ${why}`)
  return { ok: false, refusal }
}

export async function submitWallPost({
  conference,
  device,
  form,
  now,
}: WallSubmitRequest): Promise<WallSubmitOutcome> {
  const conferenceId = conference._id

  // 1. A valid cookie and a UUID v4 `uploadId`.
  if (!device) return refuse('failed', 'no device cookie')
  const uploadId = form.get('uploadId')
  if (!isUploadId(uploadId)) return refuse('failed', 'uploadId')

  // 2. A retry after a lost response: success, without uploading again.
  // Another's post under this id is refused only where an upload would
  // happen (before step 5), never here: refused here, a taken id would
  // answer `failed` where a free one answers `closed` or a limit, telling
  // anyone that a post with that id exists. A deliberate departure from
  // §6.2's order, which lists the refusal under step 2.
  const existing = await readPost(uploadId)
  const taken = !!existing && !isOwnPost(existing, conferenceId, device.key)
  if (existing && !taken) {
    // Again: the first run may have stopped between its create and expiry.
    expireWallPost(conferenceId, device.key, { wall: false })
    return { ok: true }
  }

  // 3. The wall, the Posting Window and the limits.
  const wall = await readPhotoWall(conferenceId)
  if (!wall) return refuse('failed', 'no wall')
  if (!isPostingOpen(wall, conference, now)) {
    return refuse('closed', 'posting not open')
  }
  const limit = postingLimitHit(
    await readPostingCounts(conferenceId, device.key, now),
  )
  if (limit) return refuse(limit, `limit ${limit}`)

  // 4. The photo's size, then the §6.4 checks: the fields, and the JPEG on
  // the bytes in memory. Every photo part, before any is read.
  const parts = form.getAll('photo')
  if (parts.some((p) => p instanceof Blob && p.size > MAX_PHOTO_BYTES)) {
    return refuse('failed', 'size')
  }
  const checked = checkWallFields(form)
  if (!checked.ok) return refuse('failed', `field ${checked.field}`)
  const { fields } = checked
  const bytes = new Uint8Array(await fields.photo.arrayBuffer())
  const photo = checkWallPhoto(bytes)
  if (!photo.ok) return refuse('failed', `photo ${photo.reason}`)
  if (fields.talkId && !(await isConferenceTalk(fields.talkId, conferenceId))) {
    return refuse('failed', 'talk')
  }

  // 5. Upload, then create; not under another's id.
  if (taken) return refuse('failed', 'uploadId taken')
  return createPost({ conferenceId, deviceKey: device.key, fields, bytes, now })
}

interface NewPost {
  conferenceId: string
  deviceKey: string
  fields: WallPostFields
  /** The photo, checked. */
  bytes: Uint8Array
  now: Date
}

async function createPost({
  conferenceId,
  deviceKey,
  fields,
  bytes,
  now,
}: NewPost): Promise<WallSubmitOutcome> {
  const { uploadId } = fields
  const asset = await clientWrite.assets.upload('image', Buffer.from(bytes), {
    filename: `${uploadId}.jpg`,
    contentType: 'image/jpeg',
    source: { name: 'photo-wall', id: conferenceId },
    // Sent as `meta=none`: no palette, LQIP, blurhash, EXIF or location.
    extract: [],
  })

  // Just before the create (§11.1): the retention cron may have closed the
  // wall since step 3. The asset goes, with its history (§12), unless a
  // document references it, as after a failed create.
  const wall = await readPhotoWall(conferenceId)
  if (!wall || wall.closedAt) {
    await deleteWallAsset(asset._id)
    return refuse('closed', 'wall closed before the create')
  }

  try {
    await clientWrite
      .transaction()
      .create({
        _id: wallPostId(uploadId),
        _type: 'wallPost',
        conference: { _type: 'reference', _ref: conferenceId },
        status: 'pending',
        photo: {
          _type: 'image',
          asset: { _type: 'reference', _ref: asset._id },
        },
        crop: fields.crop,
        ...(fields.caption ? { caption: fields.caption } : {}),
        ...(fields.name ? { name: fields.name } : {}),
        ...(fields.talkId
          ? { talk: { _type: 'reference', _ref: fields.talkId, _weak: true } }
          : {}),
        marketingConsent: fields.marketingConsent,
        deviceKey,
        submittedAt: now.toISOString(),
      })
      .commit()
  } catch (error) {
    // The stored post decides. This device's: the create landed and its
    // answer was lost. Another's: two submits raced on one `uploadId`.
    // None: refused only when Sanity ANSWERED with a 4xx, which proves the
    // create was rejected. A transport error or a 5xx may still commit
    // after this read, so it is not a refusal (the phone would post again
    // under a new id): it throws, and the phone retries with this one.
    const stored = await readPost(uploadId)
    const status = sanityStatus(error)
    const rejected = typeof status === 'number' && status >= 400 && status < 500
    if (!stored && !rejected) {
      // The asset stays: a late create references it, and the retry
      // uploads the same bytes, which Sanity names as the same asset.
      // One nothing ever references is the orphan sweep's (§11.2).
      throw new Error('Photo Wall submit: the create’s outcome is unknown', {
        cause: error,
      })
    }
    // This request's asset goes, with its history (§12), unless a document
    // references it: the stored post (this create landed, or the winner
    // sent the same bytes; Sanity names assets by their bytes) or any
    // other, in any tenant. Also when the stored post is this device's: a
    // concurrent request with other bytes may have won.
    await deleteWallAsset(asset._id)
    if (!isOwnPost(stored, conferenceId, deviceKey)) {
      console.error('Photo Wall submit: the create failed', error)
      return refuse('failed', stored ? 'uploadId taken at create' : 'create')
    }
  }

  expireWallPost(conferenceId, deviceKey, { wall: false })
  return { ok: true }
}
