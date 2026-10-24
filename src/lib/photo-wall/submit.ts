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
 * Answers `{ ok: false }` only when it KNOWS no post was created; anything it
 * cannot tell (a read or the create's re-read failing) throws, so the route
 * answers 500 and the phone retries with the same `uploadId`, which is safe.
 */
import 'server-only'
import { clientReadUncached, clientWrite } from '@/lib/sanity/client'
import { deleteImageAssetIfOrphaned } from '@/lib/sanity/orphaned-asset'
import { expireWallPost } from './cache'
import type { WallDevice } from './device'
import { checkWallFields, isUploadId, type WallPostFields } from './fields'
import { checkWallPhoto } from './jpeg-check'
import { postingLimitHit, readPostingCounts } from './limits'
import type { WallSubmitRefusal } from './post'
import { readPhotoWall } from './sanity'
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
  const existing = await readPost(uploadId)
  if (existing) {
    if (!isOwnPost(existing, conferenceId, device.key)) {
      return refuse('failed', 'uploadId taken')
    }
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

  // 4. The fields, then the photo: its size first, then the §6.4 checks on
  // the bytes in memory (`checkWallPhoto`).
  const checked = checkWallFields(form)
  if (!checked.ok) return refuse('failed', `field ${checked.field}`)
  const { fields } = checked
  const bytes = new Uint8Array(await fields.photo.arrayBuffer())
  const photo = checkWallPhoto(bytes)
  if (!photo.ok) return refuse('failed', `photo ${photo.reason}`)

  // 5. Upload, then create.
  return createPost(conferenceId, device.key, fields, bytes, now)
}

async function createPost(
  conferenceId: string,
  deviceKey: string,
  fields: WallPostFields,
  bytes: Uint8Array,
  now: Date,
): Promise<WallSubmitOutcome> {
  const { uploadId } = fields
  const asset = await clientWrite.assets.upload('image', Buffer.from(bytes), {
    filename: `${uploadId}.jpg`,
    contentType: 'image/jpeg',
    source: { name: 'photo-wall', id: conferenceId },
    // Sent as `meta=none`: no palette, LQIP, blurhash, EXIF or location.
    extract: [],
  })

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
        marketingConsent: fields.marketingConsent,
        deviceKey,
        submittedAt: now.toISOString(),
      })
      .commit()
  } catch (error) {
    // The id now exists (two submits with one `uploadId`), the create failed,
    // or it landed and its answer was lost: the stored post decides. The
    // asset goes unless a document references it: Sanity names assets by
    // their bytes, across tenants, so it may be the winner's photo too.
    const stored = await readPost(uploadId).finally(() =>
      deleteImageAssetIfOrphaned(asset._id),
    )
    if (!isOwnPost(stored, conferenceId, deviceKey)) {
      console.error('Photo Wall submit: the create failed', error)
      return refuse('failed', stored ? 'uploadId taken at create' : 'create')
    }
  }

  expireWallPost(conferenceId, deviceKey, { wall: false })
  return { ok: true }
}
