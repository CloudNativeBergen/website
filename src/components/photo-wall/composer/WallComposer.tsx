'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import type { ConferenceSchedule } from '@/lib/conference/types'
import { CENTER_CROP, postedCrop, type Crop } from '@/lib/photo-wall/crop'
import { REFUSAL_MESSAGES, WallPostRefused } from '@/lib/photo-wall/post'
import type { WallFilterKey } from '@/lib/photo-wall/filters'
import {
  PhotoDecodeError,
  PhotoTooSmallError,
  bakeWallPhoto,
  decodeWallPhoto,
} from '@/lib/photo-wall/photo'
import {
  CAPTION_MAX,
  normalizeWallText,
  wallTextLength,
} from '@/lib/photo-wall/text'
import { formatDateLocalized } from '@/lib/time'
import { WallChrome } from '../WallPage'
import {
  ComposerLanding,
  DECODE_FAILED_MESSAGE,
  PRIMARY_BUTTON,
  TOO_SMALL_MESSAGE,
} from './ComposerLanding'
import { FilterStrip } from './FilterStrip'
import { PolaroidEditor } from './PolaroidEditor'
import { TalkPicker } from './TalkPicker'

/** What Post to the wall hands on: the photo part and the fields of §6.2. */
export interface WallPostDraft {
  /** The filtered JPEG, long edge at most 2048 px, APPn and COM stripped. */
  photo: Blob
  /** Normalised as the server will store it (§6.4); empty for none. */
  caption: string
  name: string
  crop: Crop
  marketingConsent: boolean
  /** The tagged talk (Talk photos spec §6.1), or null for none. */
  talkId: string | null
}

/** The generic failure line (§6.3). */
export const GENERIC_FAILURE_MESSAGE = REFUSAL_MESSAGES.failed

export interface WallComposerProps {
  logo: ConferenceLogoData | null
  /** The wall's deletion date (§11.1) as `YYYY-MM-DD`, for the consent line. */
  deletesOn: string
  /**
   * Post to the wall. Resolves when the post is in; rejects for a refusal or
   * a failure, which keeps the photo and fields on screen with the message:
   * a {@link WallPostRefused}'s own (§6.3), the generic one for anything
   * else. A caller that shows something else once the post is in swaps its
   * view BEFORE resolving: a resolved submit leaves this screen as it was.
   */
  onSubmit: (post: WallPostDraft) => Promise<void> | void
  /**
   * Whether Post to the wall may send yet: false until the device cookie is
   * set (§6.1). The button stays visible, `aria-disabled`, meanwhile.
   */
  canPost?: boolean
  /**
   * How much of the post has gone up, 0–1, while it is being sent (§6.5), or
   * null when that isn't known.
   */
  uploadProgress?: number | null
  /** Under the landing: My posts, if this phone has any (§6.5). */
  below?: React.ReactNode
  /** The published schedule, for the Talk row (Talk photos spec §6.1). */
  schedules?: ConferenceSchedule[]
  /** `?room=` from a room's QR (Talk photos spec §6.4). */
  room?: string
  /** A signed-in trusted poster's name (§6.6): the line above Post. */
  trustedName?: string
  /** Conference time for the Talk row; the clock when absent. */
  now?: Date
}

/**
 * Resolves once the browser has painted: the first frame callback runs
 * before the paint that shows a just-set status, the second after it.
 */
const afterPaint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )

/** Marks the history entry the composer pushes, so Back has somewhere to go. */
const isComposerEntry = () =>
  (window.history.state as { wallComposer?: boolean } | null)?.wallComposer ===
  true

type Stage =
  | { kind: 'landing'; error: string | null }
  | { kind: 'decoding' }
  | { kind: 'composing'; master: HTMLCanvasElement }

/**
 * The composer at `/wall/post` (Photo Wall spec §6.5): the landing with Take
 * a photo and Choose from your photos, then one screen where the polaroid
 * card is the editor. It decodes, resizes, filters and encodes the photo on
 * the phone and hands the result to `onSubmit`; it makes no request itself.
 */
export function WallComposer({
  logo,
  deletesOn,
  onSubmit,
  canPost = true,
  uploadProgress = null,
  below,
  schedules = [],
  room,
  trustedName,
  now,
}: WallComposerProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'landing', error: null })
  const [filter, setFilter] = useState<WallFilterKey>('original')
  const [crop, setCrop] = useState<Crop>(CENTER_CROP)
  const [caption, setCaption] = useState('')
  const [name, setName] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [talkId, setTalkId] = useState<string | null>(null)
  const [posting, setPosting] = useState<'idle' | 'baking' | 'sending'>('idle')
  const [failure, setFailure] = useState<Error | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const landingHeading = useRef<HTMLHeadingElement>(null)
  const previousKind = useRef(stage.kind)
  // Only the photo picked last may land: a large one picked first can finish
  // opening after it.
  const latestPick = useRef(0)
  // The last bake, reused while the photo and filter stay: the press after a
  // lost response then sends the very same photo, which is how the caller
  // tells a retry from a new post.
  const baked = useRef<{
    master: HTMLCanvasElement
    filter: WallFilterKey
    photo: Blob
  } | null>(null)
  const busy = posting !== 'idle'

  // A new screen takes focus, so a screen reader lands on it: the composer
  // when it opens, the landing when the composer closes (the button that
  // closed it is gone).
  useEffect(() => {
    if (stage.kind === 'composing') heading.current?.focus()
    else if (stage.kind === 'landing' && previousKind.current === 'composing') {
      landingHeading.current?.focus()
    }
    previousKind.current = stage.kind
  }, [stage.kind])

  // The composer is a screen of its own: it pushes a history entry, so the
  // back gesture returns to the landing (dropping the photo) instead of
  // leaving the page and the draft with it. While a post is going out, Back
  // stays put: the post cannot be called back.
  useEffect(() => {
    if (stage.kind !== 'composing') return
    if (!isComposerEntry()) window.history.pushState({ wallComposer: true }, '')
    const onBack = () => {
      if (busy) {
        window.history.pushState({ wallComposer: true }, '')
      } else {
        setStage({ kind: 'landing', error: null })
      }
    }
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [stage.kind, busy])

  const anotherPhoto = () => {
    if (isComposerEntry()) window.history.back()
    else setStage({ kind: 'landing', error: null })
  }

  const pick = async (file: File) => {
    const thisPick = ++latestPick.current
    setStage({ kind: 'decoding' })
    try {
      const master = await decodeWallPhoto(file)
      if (thisPick !== latestPick.current) return
      // A new photo is a new post: its own look, crop and caption, and the
      // marketing consent asked again. The name is the same person's.
      setFilter('original')
      setCrop(CENTER_CROP)
      setCaption('')
      setMarketingConsent(false)
      setFailure(null)
      setStage({ kind: 'composing', master })
    } catch (error) {
      if (thisPick !== latestPick.current) return
      setStage({
        kind: 'landing',
        error:
          error instanceof PhotoTooSmallError
            ? TOO_SMALL_MESSAGE
            : error instanceof PhotoDecodeError
              ? DECODE_FAILED_MESSAGE
              : GENERIC_FAILURE_MESSAGE,
      })
    }
  }

  const post = async (master: HTMLCanvasElement) => {
    if (posting !== 'idle' || !canPost) return
    setFailure(null)
    setPosting('baking')
    try {
      let photo = baked.current?.photo
      if (baked.current?.master !== master || baked.current.filter !== filter) {
        // The bake blocks the main thread for a moment (more on a phone):
        // let "Preparing your photo…" paint first.
        await afterPaint()
        photo = await bakeWallPhoto(master, filter)
        baked.current = { master, filter, photo }
      }
      if (!photo) throw new Error('No photo to post')
      setPosting('sending')
      await onSubmit({
        photo,
        caption: normalizeWallText(caption),
        name: normalizeWallText(name),
        crop: postedCrop(crop),
        marketingConsent,
        talkId,
      })
    } catch (error) {
      setFailure(
        error instanceof WallPostRefused
          ? error
          : new Error(GENERIC_FAILURE_MESSAGE),
      )
    } finally {
      setPosting('idle')
    }
  }

  if (stage.kind !== 'composing') {
    return (
      <WallChrome logo={logo}>
        <div aria-busy={stage.kind === 'decoding'}>
          <ComposerLanding
            headingRef={landingHeading}
            onPick={pick}
            error={stage.kind === 'landing' ? stage.error : null}
          />
          {stage.kind === 'decoding' && (
            <p
              role="status"
              className="mt-6 text-sm text-gray-500 dark:text-gray-400"
            >
              Opening your photo…
            </p>
          )}
        </div>
        {below}
      </WallChrome>
    )
  }

  const { master } = stage
  return (
    <WallChrome logo={logo}>
      <div className="text-left">
        {/* Everything that makes up the post is locked while it goes out, so
            what is posted is what the screen shows (the consent above all).
            The Post button stays outside: aria-disabled, it keeps focus. */}
        <fieldset disabled={busy} className="min-w-0">
          <button
            type="button"
            onClick={anotherPhoto}
            className="-ml-2 flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-gray-400 dark:focus-visible:outline-white"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
            Another photo
          </button>
          <h1 ref={heading} tabIndex={-1} className="sr-only">
            Your photo
          </h1>

          <div className="mx-auto mt-4 max-w-xs">
            <PolaroidEditor
              master={master}
              filter={filter}
              crop={crop}
              caption={caption}
              name={name}
              onCrop={setCrop}
              onCaption={setCaption}
              onName={setName}
            />
            <p className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Drag the photo to move it</span>
              <span data-testid="caption-counter">
                <span className="sr-only">Caption: </span>
                {wallTextLength(caption)}/{CAPTION_MAX}
              </span>
            </p>
          </div>

          <div className="mt-5">
            <FilterStrip
              master={master}
              crop={crop}
              value={filter}
              onChange={setFilter}
            />
          </div>

          <TalkPicker
            schedules={schedules}
            now={now}
            initialRoom={room}
            onChange={setTalkId}
          />

          <p className="mt-5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
            Your whole photo, caption and name are shown on the screens at the
            venue and on the public wall on this website until{' '}
            <time dateTime={deletesOn}>
              {formatDateLocalized(deletesOn, 'en-GB')}
            </time>
            ; the square you choose is only how the polaroids frame it. A photo
            tagged with a talk is also shown with that talk on the program and
            its speakers’ pages. Only post photos the people in them are happy
            with.{' '}
            <a
              className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
              href="/privacy#photo-wall"
              // A new tab, so reading it never drops the photo or a post
              // going out (the busy lock doesn't cover links).
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>

          <label className="mt-4 flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={marketingConsent}
              onChange={(e) => setMarketingConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-900"
            />
            The organizers may also use my photo in their own marketing.
          </label>
        </fieldset>

        {failure && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-100"
          >
            {failure.message}
            {failure instanceof WallPostRefused &&
              failure.refusal === 'closed' && (
                <>
                  {' '}
                  <a
                    href="/wall"
                    className="rounded-sm font-semibold underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800 dark:focus-visible:outline-red-100"
                  >
                    See the wall
                  </a>
                </>
              )}
          </p>
        )}

        {trustedName && (
          <p className="mt-4 text-sm text-gray-700 dark:text-gray-300">
            You’re signed in as{' '}
            <span dir="auto" className="font-medium">
              {trustedName}
            </span>
            . Your photo goes straight on the wall.
          </p>
        )}

        <button
          type="button"
          onClick={() => post(master)}
          aria-disabled={busy || !canPost}
          className={`${PRIMARY_BUTTON} mt-4`}
        >
          {posting === 'baking'
            ? 'Preparing your photo…'
            : posting === 'sending'
              ? 'Posting…'
              : 'Post to the wall'}
        </button>
        {posting === 'sending' && uploadProgress !== null && (
          <UploadProgress fraction={uploadProgress} />
        )}
      </div>
    </WallChrome>
  )
}

/**
 * How much of the post has gone up (§6.5): a progress bar under the button.
 * The button keeps saying Posting… and keeps focus, so a screen reader isn't
 * read a new label at every step; the bar carries the value.
 */
function UploadProgress({ fraction }: { fraction: number }) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100)
  return (
    <div className="mt-3 flex items-center gap-3">
      <div
        role="progressbar"
        aria-label="Uploading your photo"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div
          className="h-full rounded-full bg-brand-cloud-blue transition-[width] dark:bg-indigo-400"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        aria-hidden="true"
        className="w-10 text-right text-xs text-gray-600 tabular-nums dark:text-gray-400"
      >
        {percent}%
      </span>
    </div>
  )
}
