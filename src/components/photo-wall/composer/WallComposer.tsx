'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeftIcon } from '@heroicons/react/24/outline'
import type { ConferenceLogoData } from '@/lib/conference/logo'
import { CENTER_CROP, type Crop } from '@/lib/photo-wall/crop'
import type { WallFilterKey } from '@/lib/photo-wall/filters'
import {
  PhotoDecodeError,
  bakeWallPhoto,
  decodeWallPhoto,
} from '@/lib/photo-wall/photo'
import {
  CAPTION_MAX,
  codePointCount,
  normalizeWallText,
} from '@/lib/photo-wall/text'
import { formatConferenceDate } from '@/lib/time'
import { WallChrome } from '../WallPage'
import {
  ComposerLanding,
  DECODE_FAILED_MESSAGE,
  PRIMARY_BUTTON,
} from './ComposerLanding'
import { FilterStrip } from './FilterStrip'
import { PolaroidEditor } from './PolaroidEditor'

/** What Post to the wall hands on: the photo part and the fields of §6.2. */
export interface WallPostDraft {
  /** The filtered JPEG, long edge at most 2048 px, APPn and COM stripped. */
  photo: Blob
  /** Normalised as the server will store it (§6.4); empty for none. */
  caption: string
  name: string
  crop: Crop
  marketingConsent: boolean
}

/** The generic failure line (§6.3); a submit's own refusals are M3b's. */
export const GENERIC_FAILURE_MESSAGE =
  'Something went wrong. Your photo wasn’t posted. Try again.'

export interface WallComposerProps {
  logo: ConferenceLogoData | null
  /** The wall's deletion date (§11.1) as `YYYY-MM-DD`, for the consent line. */
  deletesOn: string
  /**
   * Post to the wall. Resolves when the post is in; rejects for a refusal or
   * a failure, which keeps the photo and fields on screen with the generic
   * message (§6.5). The submit itself is slice M3b's.
   */
  onSubmit: (post: WallPostDraft) => Promise<void> | void
}

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
export function WallComposer({ logo, deletesOn, onSubmit }: WallComposerProps) {
  const [stage, setStage] = useState<Stage>({ kind: 'landing', error: null })
  const [filter, setFilter] = useState<WallFilterKey>('original')
  const [crop, setCrop] = useState<Crop>(CENTER_CROP)
  const [caption, setCaption] = useState('')
  const [name, setName] = useState('')
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [posting, setPosting] = useState<'idle' | 'baking' | 'sending'>('idle')
  const [failure, setFailure] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  // A new screen takes focus, so a screen reader lands on it.
  useEffect(() => {
    if (stage.kind === 'composing') heading.current?.focus()
  }, [stage.kind])

  const pick = async (file: File) => {
    setStage({ kind: 'decoding' })
    try {
      const master = await decodeWallPhoto(file)
      setFilter('original')
      setCrop(CENTER_CROP)
      setFailure(null)
      setStage({ kind: 'composing', master })
    } catch (error) {
      setStage({
        kind: 'landing',
        error:
          error instanceof PhotoDecodeError
            ? DECODE_FAILED_MESSAGE
            : GENERIC_FAILURE_MESSAGE,
      })
    }
  }

  const post = async (master: HTMLCanvasElement) => {
    if (posting !== 'idle') return
    setFailure(null)
    setPosting('baking')
    try {
      const photo = await bakeWallPhoto(master, filter)
      setPosting('sending')
      await onSubmit({
        photo,
        caption: normalizeWallText(caption),
        name: normalizeWallText(name),
        crop,
        marketingConsent,
      })
    } catch {
      setFailure(GENERIC_FAILURE_MESSAGE)
    } finally {
      setPosting('idle')
    }
  }

  if (stage.kind !== 'composing') {
    return (
      <WallChrome logo={logo}>
        <div aria-busy={stage.kind === 'decoding'}>
          <ComposerLanding
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
      </WallChrome>
    )
  }

  const { master } = stage
  const busy = posting !== 'idle'
  return (
    <WallChrome logo={logo}>
      <div className="text-left">
        <button
          type="button"
          onClick={() => setStage({ kind: 'landing', error: null })}
          className="-ml-1 flex items-center gap-1 rounded-md px-1 text-sm text-gray-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:text-gray-400 dark:focus-visible:outline-white"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
          Another photo
        </button>
        <h1
          ref={heading}
          tabIndex={-1}
          className="sr-only focus:not-sr-only focus:mt-3 focus:block focus:text-sm focus:text-gray-600"
        >
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
              {codePointCount(caption)}/{CAPTION_MAX}
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

        <p className="mt-5 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
          Your photo, caption and name are shown on the screens at the venue and
          on the public wall on this website until{' '}
          <time dateTime={deletesOn}>
            {formatConferenceDate(deletesOn, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </time>
          . Only post photos the people in them are happy with.{' '}
          <a
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
            href="/privacy#photo-wall"
          >
            Privacy
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

        {failure && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-100"
          >
            {failure}
          </p>
        )}

        <button
          type="button"
          onClick={() => post(master)}
          aria-disabled={busy}
          className={`${PRIMARY_BUTTON} mt-4`}
        >
          {posting === 'baking'
            ? 'Preparing your photo…'
            : posting === 'sending'
              ? 'Posting…'
              : 'Post to the wall'}
        </button>
      </div>
    </WallChrome>
  )
}
