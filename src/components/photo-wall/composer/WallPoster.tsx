'use client'

import { useEffect, useRef, useState } from 'react'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import {
  WallPostRefused,
  postToWall,
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
  post?: (request: WallPostRequest) => ReturnType<typeof postToWall>
}

/** Whether a press posts what the lost attempt carried: then it is a retry. */
const sameDraft = (a: WallPostDraft, b: WallPostDraft) =>
  a.photo.size === b.photo.size &&
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
 * wall waits for its answer (§6.1). If it failed, the press asks once more.
 *
 * `uploadId` (§6.2, §6.5): one per post. A press after a lost response sends
 * the same one, so the route can answer success if the post did go in; a
 * refusal or a success ends it, and the next press picks a new one.
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
  /** The post a lost response left open, to be retried as itself. */
  const open = useRef<{ uploadId: string; draft: WallPostDraft } | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const urls = useRef<string[]>([])

  useEffect(() => {
    let live = true
    ensureDevice().then(
      (ok) => live && setDevice(ok ? 'ready' : 'failed'),
      () => live && setDevice('failed'),
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
      const ok = await ensureDevice().catch(() => false)
      if (!ok) throw new Error('No device cookie')
      setDevice('ready')
    }
    if (!open.current || !sameDraft(open.current.draft, draft)) {
      open.current = { uploadId: crypto.randomUUID(), draft }
    }
    const { uploadId } = open.current
    const result = await post({ uploadId, ...draft })
    // Lost: keep the uploadId for the next press; the generic message.
    if ('lost' in result) throw new Error('No answer from the wall')
    open.current = null
    if (!result.ok) throw new WallPostRefused(result.refusal)

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
