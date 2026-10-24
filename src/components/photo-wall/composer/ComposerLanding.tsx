'use client'

import type { ChangeEvent } from 'react'
import { CameraIcon, PhotoIcon } from '@heroicons/react/24/outline'

export const PRIMARY_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-cloud-blue px-4 text-base font-semibold text-white shadow-xs hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue aria-disabled:cursor-wait aria-disabled:opacity-60 dark:focus-visible:outline-indigo-400'
export const SECONDARY_BUTTON =
  'flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-base font-semibold text-gray-900 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus-visible:outline-white'

/**
 * The focus ring of a label whose sr-only input has the focus: the input is
 * what the keyboard reaches, the label is what the eye sees.
 */
const LABEL_FOCUS =
  'cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-cloud-blue dark:has-[:focus-visible]:outline-indigo-400'

/** The message for a file the browser cannot decode (Photo Wall spec §6.5). */
export const DECODE_FAILED_MESSAGE =
  'This photo couldn’t be opened. Try another one, or take a new photo.'

/** The message for a photo under the wall's 320 px short edge (§6.4). */
export const TOO_SMALL_MESSAGE =
  'This photo is too small or too narrow for the wall. Try another one, or take a new photo.'

/**
 * A button that opens the camera or the photo library: a label around a
 * hidden file input, so the whole button is the input's hit area and the
 * browser's own picker runs. `capture` asks for the camera (§6.5).
 */
function PickPhotoButton({
  capture,
  className,
  onPick,
  children,
}: {
  capture?: boolean
  className: string
  onPick: (file: File) => void
  children: React.ReactNode
}) {
  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same photo again fires `change` again.
    e.target.value = ''
    if (file) onPick(file)
  }
  return (
    <label className={`${className} ${LABEL_FOCUS}`}>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="sr-only"
        onChange={onChange}
      />
      {children}
    </label>
  )
}

/**
 * The landing of `/wall/post` (Photo Wall spec §6.5): the heading and the two
 * ways in. The logo is the chrome's. `error` is the message after a photo
 * the browser could not open, or one too small for the wall; it is
 * announced, then read in place.
 */
export function ComposerLanding({
  onPick,
  error,
}: {
  onPick: (file: File) => void
  error?: string | null
}) {
  return (
    <div className="text-center">
      <h1 className="font-display text-2xl font-semibold">
        Add your photo to the wall
      </h1>
      <p className="mt-3 text-gray-600 dark:text-gray-400">
        Take a photo or pick one, add a filter and a line, and see it on the
        screens here at the venue.
      </p>
      {error && (
        <p
          role="alert"
          className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        >
          {error}
        </p>
      )}
      <div className="mt-8 space-y-3">
        <PickPhotoButton capture className={PRIMARY_BUTTON} onPick={onPick}>
          <CameraIcon className="size-5" aria-hidden="true" />
          Take a photo
        </PickPhotoButton>
        <PickPhotoButton className={SECONDARY_BUTTON} onPick={onPick}>
          <PhotoIcon className="size-5" aria-hidden="true" />
          Choose from your photos
        </PickPhotoButton>
      </div>
      <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
        An organizer looks at every photo before it appears.
      </p>
    </div>
  )
}
