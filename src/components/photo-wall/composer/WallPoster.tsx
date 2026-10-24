'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import {
  WallPostRefused,
  postToWall,
  type PostOptions,
  type WallPostRequest,
} from '@/lib/photo-wall/post'
import { WallChrome } from '../WallPage'
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './ComposerLanding'
import { WaitingCard, type PostedPhoto } from './WaitingCard'
import { WallComposer, type WallPostDraft } from './WallComposer'

export interface WallPosterProps {
  logo: ConferenceLogoData | null
  /** The wall's deletion date, `YYYY-MM-DD`, for the consent line. */
  deletesOn: string
  /** The `/wall/post` Server Action that sets the device cookie (§6.1). */
  ensureDevice: () => Promise<boolean>
  /** The submit; `postToWall` unless a story stands in for the server. */
  post?: (
    request: WallPostRequest,
    options: Pick<PostOptions, 'onProgress'>,
  ) => ReturnType<typeof postToWall>
}

/**
 * How long `ensureDevice()` may take before Post to the wall is enabled
 * anyway: the press then asks again, and says so if that fails too.
 */
export const ENSURE_DEVICE_TIMEOUT_MS = 10_000

/** `ensureDevice()`'s answer, or false once it failed or took too long. */
function deviceWithin(ensureDevice: () => Promise<boolean>): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    ensureDevice().catch(() => false),
    new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ENSURE_DEVICE_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

/**
 * Whether a press posts what the lost attempt carried: then it is a retry.
 * The photo by identity: the composer hands over the same baked Blob while
 * the photo and filter stay.
 */
const sameDraft = (a: WallPostDraft, b: WallPostDraft) =>
  a.photo === b.photo &&
  a.caption === b.caption &&
  a.name === b.name &&
  a.crop.x === b.crop.x &&
  a.crop.y === b.crop.y &&
  a.marketingConsent === b.marketingConsent

/**
 * `/wall/post` while posting is open (Photo Wall spec §6.5): the composer,
 * wired to the submit route, then the posts sent from this page, each
 * "Waiting for approval".
 *
 * The device cookie first: `ensureDevice()` runs on load and Post to the
 * wall waits for its answer (§6.1), for at most
 * {@link ENSURE_DEVICE_TIMEOUT_MS}. If it failed or took too long, the press
 * asks once more, and shows the generic message if that fails too.
 *
 * `uploadId` (§6.2, §6.5): one per post. A press after a lost response sends
 * the same one, so the route can answer success if the post did go in. A
 * success ends it; so does a refusal, unless an earlier attempt of the same
 * draft was lost. Editing the draft always picks a new one.
 */
export function WallPoster({
  logo,
  deletesOn,
  ensureDevice,
  post = postToWall,
}: WallPosterProps) {
  const [device, setDevice] = useState<'pending' | 'ready' | 'failed'>(
    'pending',
  )
  const [posted, setPosted] = useState<PostedPhoto[]>([])
  const [composing, setComposing] = useState(true)
  const [progress, setProgress] = useState<number | null>(null)
  /**
   * The post being sent and its `uploadId`, kept for the next press of the
   * same draft. `ambiguous` once any attempt of it was lost: it may still
   * land, so from then on even a refusal keeps the id.
   */
  const open = useRef<{
    uploadId: string
    draft: WallPostDraft
    ambiguous: boolean
  } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    let live = true
    deviceWithin(ensureDevice).then(
      (ok) => live && setDevice(ok ? 'ready' : 'failed'),
    )
    return () => {
      live = false
    }
  }, [ensureDevice])

  useEffect(() => {
    const created = urls.current
    return () => created.forEach((url) => URL.revokeObjectURL(url))
  }, [])

  useEffect(() => {
    if (!composing) heading.current?.focus()
  }, [composing])

  const submit = async (draft: WallPostDraft) => {
    if (device !== 'ready') {
      if (!(await deviceWithin(ensureDevice))) {
        throw new Error('No device cookie')
      }
      setDevice('ready')
    }
    if (!open.current || !sameDraft(open.current.draft, draft)) {
      open.current = { uploadId: crypto.randomUUID(), draft, ambiguous: false }
    }
    const { uploadId } = open.current
    // Whole percents only: a re-render per progress event is wasted work.
    const onProgress = (fraction: number) =>
      setProgress(Math.round(fraction * 100) / 100)
    const result = await post({ uploadId, ...draft }, { onProgress }).finally(
      () => setProgress(null),
    )
    // Lost: keep the uploadId for the next press; the generic message.
    if ('lost' in result) {
      open.current.ambiguous = true
      throw new Error('No answer from the wall')
    }
    if (!result.ok) {
      // A refusal proves only that THIS attempt made no post. After a lost
      // one, the same draft keeps its id: that post may still land, and the
      // next press must converge on it rather than post it twice.
      if (result.earlierLost) open.current.ambiguous = true
      if (!open.current.ambiguous) open.current = null
      throw new WallPostRefused(result.refusal)
    }
    open.current = null

    const url = URL.createObjectURL(draft.photo)
    urls.current.push(url)
    // Swapped before `onSubmit` resolves: a resolved submit would leave the
    // composer showing the posted photo with a live Post button.
    setPosted((before) => [
      {
        uploadId,
        url,
        crop: draft.crop,
        caption: draft.caption,
        name: draft.name,
      },
      ...before,
    ])
    setComposing(false)
  }

  if (composing) {
    return (
      <WallComposer
        logo={logo}
        deletesOn={deletesOn}
        onSubmit={submit}
        canPost={device !== 'pending'}
        uploadProgress={progress}
      />
    )
  }

  return (
    <WallChrome logo={logo}>
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-2xl font-semibold focus:outline-none"
      >
        My posts
      </h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        An organizer looks at every photo before it appears on the wall.
      </p>
      <ul className="mx-auto mt-8 max-w-xs space-y-8">
        {posted.map((photo) => (
          <li key={photo.uploadId}>
            <WaitingCard post={photo} />
          </li>
        ))}
      </ul>
      <div className="mt-10 space-y-3">
        <button
          type="button"
          onClick={() => setComposing(true)}
          className={PRIMARY_BUTTON}
        >
          Post another photo
        </button>
        <a href="/wall" className={SECONDARY_BUTTON}>
          See the wall
        </a>
      </div>
    </WallChrome>
  )
}
