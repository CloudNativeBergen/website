'use client'

import { useRef, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowUpTrayIcon,
  CheckIcon,
  PhotoIcon,
  SparklesIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import type { PlatformConstraints } from '@/lib/social/provider/types'
import { renditionRect } from '@/lib/social/rendition'
import type {
  SocialPostAttachment,
  SocialVariantAttachment,
} from '@/lib/social/types'
import { CropEditor } from './CropEditor'
import { CroppedImage } from './CroppedImage'

/** An image the organizer can pull in from the conference gallery. */
export interface GalleryPick {
  id: string
  assetId: string
  alt: string
  hotspot: { x: number; y: number; width: number; height: number } | null
  crop: { top: number; bottom: number; left: number; right: number } | null
  thumbnailSrc: string
}

/**
 * A share card the studio can rasterize on demand (spec §7: "studio asset").
 * The slot only needs the bytes and an alt text; the studio owns rendering.
 */
export interface ShareCardSource {
  id: string
  label: string
  render: () => Promise<{ blob: Blob; alt: string }>
}

export interface AttachmentSlotProps {
  /** The post's library: every image a variant may carry. */
  postAttachments: SocialPostAttachment[]
  /** The variant's picks, in order. */
  attachments: SocialVariantAttachment[]
  constraints: PlatformConstraints | null
  /** Source image URL for previews and the crop editor. */
  imageSrc: (asset: SocialPostAttachment) => string
  onChange: (attachments: SocialVariantAttachment[]) => void
  /** Upload a file into the post library. Absent = no upload source. */
  onUpload?: (file: File, alt: string) => Promise<void>
  gallery?: {
    images: GalleryPick[]
    isLoading: boolean
    /** Called when the picker opens, so the list can load lazily. */
    onOpen?: () => void
    onPick: (image: GalleryPick) => Promise<void>
  }
  shareCards?: ShareCardSource[]
  onAttachShareCard?: (card: ShareCardSource) => Promise<void>
  /** Fires when an upload / pick starts and ends. */
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
}

type Picker = 'upload' | 'gallery' | 'share-card' | null

export function AttachmentSlot({
  postAttachments,
  attachments,
  constraints,
  imageSrc,
  onChange,
  onUpload,
  gallery,
  shareCards,
  onAttachShareCard,
  onBusyChange,
  disabled,
}: AttachmentSlotProps) {
  const [picker, setPicker] = useState<Picker>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingAlt, setPendingAlt] = useState('')
  const [busy, setBusy] = useState(false)
  const [sourceError, setSourceError] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const byKey = new Map(postAttachments.map((a) => [a._key, a]))
  const selected = new Set(attachments.map((a) => a.source))
  const aspect = constraints?.imageAspectRatio ?? null
  const maxImages = constraints?.maxImages ?? Infinity
  const full = attachments.length >= maxImages

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    onBusyChange?.(true)
    setSourceError(null)
    try {
      await work()
      setPicker(null)
      setPendingFile(null)
      setPendingAlt('')
    } catch (error) {
      setSourceError(
        error instanceof Error ? error.message : 'Could not add the image.',
      )
    } finally {
      setBusy(false)
      onBusyChange?.(false)
    }
  }

  // NOT a <form>: the slot lives inside the editor's form, and a nested form
  // is invalid HTML whose submit bubbles into "Save variant".
  const submitUpload = () => {
    if (!pendingFile || !onUpload) return
    const alt = pendingAlt.trim()
    if (!alt) {
      setSourceError('Describe the image for people who cannot see it.')
      return
    }
    void run(() => onUpload(pendingFile, alt))
  }

  const toggle = (key: string) => {
    if (selected.has(key)) {
      onChange(attachments.filter((a) => a.source !== key))
    } else if (!full) {
      onChange([...attachments, { source: key, crop: null, altOverride: null }])
    }
  }

  const update = (key: string, patch: Partial<SocialVariantAttachment>) =>
    onChange(
      attachments.map((a) => (a.source === key ? { ...a, ...patch } : a)),
    )

  const openPicker = (next: Picker) => {
    setSourceError(null)
    setPicker((current) => (current === next ? null : next))
    if (next === 'gallery') gallery?.onOpen?.()
    if (next === 'upload') fileInput.current?.click()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {onUpload && (
          <AdminButton
            type="button"
            size="xs"
            variant="secondary"
            disabled={disabled || busy || full}
            onClick={() => openPicker('upload')}
          >
            <ArrowUpTrayIcon className="mr-1 size-4" />
            Upload
          </AdminButton>
        )}
        {gallery && (
          <AdminButton
            type="button"
            size="xs"
            variant="secondary"
            disabled={disabled || busy || full}
            onClick={() => openPicker('gallery')}
            aria-expanded={picker === 'gallery'}
          >
            <PhotoIcon className="mr-1 size-4" />
            From gallery
          </AdminButton>
        )}
        {shareCards && shareCards.length > 0 && onAttachShareCard && (
          <AdminButton
            type="button"
            size="xs"
            variant="secondary"
            disabled={disabled || busy || full}
            onClick={() => openPicker('share-card')}
            aria-expanded={picker === 'share-card'}
          >
            <SparklesIcon className="mr-1 size-4" />
            Share card
          </AdminButton>
        )}
        {constraints && (
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {attachments.length} / {constraints.maxImages} images
          </span>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={(constraints?.imageMimeTypes ?? ['image/*']).join(',')}
        className="sr-only"
        aria-label="Upload an image"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null
          e.target.value = ''
          if (!file) return
          const accepted = constraints?.imageMimeTypes
          if (accepted && !accepted.includes(file.type)) {
            setSourceError(
              `${file.type.replace('image/', '') || 'This file type'} is not accepted here; use ${accepted
                .map((t) => t.replace('image/', ''))
                .join(', ')}.`,
            )
            return
          }
          setPendingFile(file)
          setPendingAlt('')
          setPicker('upload')
        }}
      />

      {picker === 'upload' && pendingFile && onUpload && (
        <div
          role="group"
          aria-label="Upload an image"
          className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
        >
          <p className="truncate text-sm text-gray-700 dark:text-gray-200">
            {pendingFile.name}
          </p>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
            Alt text
            <input
              type="text"
              value={pendingAlt}
              onChange={(e) => setPendingAlt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitUpload()
                }
              }}
              className={inputClass}
              autoFocus
            />
          </label>
          <div className="flex justify-end gap-2">
            <AdminButton
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => {
                setPendingFile(null)
                setPicker(null)
              }}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="button"
              size="xs"
              color="brand"
              disabled={busy}
              onClick={submitUpload}
            >
              {busy ? 'Uploading…' : 'Add to post'}
            </AdminButton>
          </div>
        </div>
      )}

      {picker === 'gallery' && gallery && (
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          {gallery.isLoading ? (
            <div className="h-24 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
          ) : gallery.images.length === 0 ? (
            <p className="text-sm text-gray-500">The gallery is empty.</p>
          ) : (
            <ul className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
              {gallery.images.map((image) => (
                <li key={image.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(() => gallery.onPick(image))}
                    className="block aspect-square w-full overflow-hidden rounded bg-gray-100 ring-offset-2 hover:ring-2 hover:ring-brand-cloud-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:bg-gray-800"
                    title={image.alt}
                  >
                    <img
                      src={image.thumbnailSrc}
                      alt={image.alt}
                      className="size-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {picker === 'share-card' && shareCards && onAttachShareCard && (
        <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
          {shareCards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => onAttachShareCard(card))}
                className="flex min-h-[44px] w-full items-center px-3 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {card.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {sourceError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {sourceError}
        </p>
      )}

      {postAttachments.length > 0 && (
        <ul
          aria-label="Post images"
          className="grid grid-cols-4 gap-2 sm:grid-cols-6"
        >
          {postAttachments.map((image) => {
            const isSelected = selected.has(image._key)
            return (
              <li key={image._key}>
                <button
                  type="button"
                  disabled={disabled || (!isSelected && full)}
                  aria-pressed={isSelected}
                  onClick={() => toggle(image._key)}
                  title={
                    isSelected
                      ? `Remove “${image.alt}” from this variant`
                      : `Add “${image.alt}” to this variant`
                  }
                  className={clsx(
                    'relative block aspect-square w-full overflow-hidden rounded bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:opacity-40 dark:bg-gray-800',
                    isSelected && 'ring-2 ring-brand-cloud-blue',
                  )}
                >
                  <img
                    src={imageSrc(image)}
                    alt={image.alt}
                    className="size-full object-cover"
                  />
                  {isSelected && (
                    <span className="absolute top-1 right-1 rounded-full bg-brand-cloud-blue p-0.5 text-white">
                      <CheckIcon className="size-3" />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {attachments.length > 0 && (
        <ul className="space-y-3">
          {attachments.map((attachment, index) => {
            const source = byKey.get(attachment.source)
            if (!source) {
              return (
                <li
                  key={attachment.source}
                  className="flex items-center justify-between rounded-lg border border-red-200 p-3 text-sm text-red-700 dark:border-red-900 dark:text-red-300"
                >
                  This image is no longer on the post.
                  <AdminButton
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => toggle(attachment.source)}
                  >
                    Remove
                  </AdminButton>
                </li>
              )
            }
            const rect = renditionRect(source, aspect, attachment.crop)
            const src = imageSrc(source)
            const isCropping = cropOpen === attachment.source
            return (
              <li
                key={attachment.source}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="flex gap-3">
                  <CroppedImage
                    src={src}
                    alt={attachment.altOverride ?? source.alt}
                    rect={rect}
                    sourceAspect={source.width / source.height}
                    aspectRatio={aspect ?? undefined}
                    className="w-28 shrink-0 self-start rounded bg-gray-100 dark:bg-gray-800"
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                      Alt text
                      <input
                        type="text"
                        value={attachment.altOverride ?? source.alt}
                        placeholder={source.alt}
                        disabled={disabled}
                        onChange={(e) =>
                          update(attachment.source, {
                            altOverride:
                              e.target.value === source.alt
                                ? null
                                : e.target.value,
                          })
                        }
                        className={inputClass}
                        aria-label={`Alt text for image ${index + 1}`}
                        aria-invalid={
                          (attachment.altOverride ?? source.alt).trim() === ''
                        }
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      {attachment.altOverride !== null && (
                        <AdminButton
                          type="button"
                          size="xs"
                          variant="ghost"
                          disabled={disabled}
                          onClick={() =>
                            update(attachment.source, { altOverride: null })
                          }
                        >
                          Use the post&apos;s alt text
                        </AdminButton>
                      )}
                      {aspect !== null && (
                        <AdminButton
                          type="button"
                          size="xs"
                          variant="secondary"
                          disabled={disabled}
                          aria-expanded={isCropping}
                          onClick={() =>
                            setCropOpen(isCropping ? null : attachment.source)
                          }
                        >
                          {isCropping ? 'Done cropping' : 'Adjust crop'}
                        </AdminButton>
                      )}
                      {attachment.crop && (
                        <span className="text-xs text-gray-500">
                          Custom crop
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => toggle(attachment.source)}
                        aria-label={`Remove image ${index + 1}`}
                        className="ml-auto inline-flex size-11 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-800"
                      >
                        <XMarkIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>
                {isCropping && aspect !== null && (
                  <div className="mt-3">
                    <CropEditor
                      asset={source}
                      src={src}
                      aspectRatio={aspect}
                      value={attachment.crop}
                      onChange={(crop) => update(attachment.source, { crop })}
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const inputClass =
  'mt-1 block min-h-[40px] w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-xs focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none disabled:opacity-60 dark:border-gray-600 dark:bg-gray-700 dark:text-white'
