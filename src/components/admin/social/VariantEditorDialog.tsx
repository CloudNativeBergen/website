'use client'

import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { useNotification } from '@/components/admin/NotificationProvider'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'
import { getPlatformConstraints } from '@/lib/social/provider/constraints'
import {
  SOCIAL_PLATFORM_LABELS,
  type SocialVariantEditorData,
} from '@/lib/social/types'
import { api } from '@/lib/trpc/client'
import type { GalleryPick, ShareCardSource } from './AttachmentSlot'
import { VariantEditor } from './VariantEditor'
import {
  editorValueFrom,
  toUpdateInput,
  type VariantEditorValue,
} from './variant-editor-model'

/** The organizer image upload route; returns the asset id of our dataset. */
const UPLOAD_ROUTE = '/api/admin/rich-text-image'

async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(UPLOAD_ROUTE, { method: 'POST', body: form })
  const json = (await res.json().catch(() => null)) as {
    assetId?: string
    error?: string
  } | null
  if (!res.ok || !json?.assetId) {
    throw new Error(json?.error ?? 'Upload failed.')
  }
  return json.assetId
}

/**
 * `VariantEditor` wired to the `social.*` procedures: loads the variant and
 * its post's images, saves with compare-and-set, and feeds the attachment
 * slot from an upload and the conference gallery. Share cards are an
 * injection point for the studio (spec §7).
 */
export function VariantEditorDialog({
  variantId,
  onClose,
  onSaved,
  shareCards,
}: {
  variantId: string | null
  onClose: () => void
  onSaved?: () => void
  shareCards?: ShareCardSource[]
}) {
  const isOpen = variantId !== null
  const editor = api.social.getVariantEditor.useQuery(
    { variantId: variantId ?? '' },
    { enabled: isOpen, refetchOnWindowFocus: false },
  )
  const [isDirty, setDirty] = useState(false)
  const data = editor.data
  const loaded = data && data.variant._id === variantId ? data : null

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="5xl"
      title={
        loaded
          ? `Edit ${SOCIAL_PLATFORM_LABELS[loaded.variant.platform]} variant`
          : 'Edit variant'
      }
      subtitle="The platform's rules are applied as you type"
      icon={<PencilSquareIcon className="h-5 w-5" />}
      confirmOnDirtyClose
      isDirty={isDirty}
    >
      {editor.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {editor.error.message}
        </p>
      ) : !loaded ? (
        <div className="h-96 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : (
        // Keyed on the variant: opening another variant starts a fresh form,
        // while a refetch of the SAME variant (after an image is added) keeps
        // the organizer's unsaved edits.
        <LoadedEditor
          key={loaded.variant._id}
          data={loaded}
          onClose={onClose}
          onSaved={onSaved}
          onDirtyChange={setDirty}
          shareCards={shareCards}
        />
      )}
    </ModalShell>
  )
}

function LoadedEditor({
  data,
  onClose,
  onSaved,
  onDirtyChange,
  shareCards,
}: {
  data: SocialVariantEditorData
  onClose: () => void
  onSaved?: () => void
  onDirtyChange: (dirty: boolean) => void
  shareCards?: ShareCardSource[]
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const variantId = data.variant._id
  const postId = data.variant.postId
  const [value, setValueState] = useState<VariantEditorValue>(() =>
    editorValueFrom(data),
  )
  const [error, setError] = useState<string | null>(null)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const gallery = api.gallery.admin.list.useQuery(
    { limit: 100 },
    { enabled: galleryOpen },
  )

  const setValue = (next: VariantEditorValue) => {
    setValueState(next)
    onDirtyChange(true)
  }

  const update = api.social.updateVariant.useMutation({
    onSuccess: () => {
      void utils.social.listVariants.invalidate()
      void utils.social.getVariantEditor.invalidate({ variantId })
      showNotification({ type: 'success', title: 'Variant saved' })
      onDirtyChange(false)
      onSaved?.()
      onClose()
    },
    onError: (err) => setError(err.message || 'Could not save.'),
  })
  const addAttachment = api.social.addPostAttachment.useMutation()

  /** Put an asset on the post, then select it on this variant. */
  const attachAsset = async (input: {
    assetId: string
    alt: string
    hotspot?: GalleryPick['hotspot']
    crop?: GalleryPick['crop']
  }) => {
    const { key } = await addAttachment.mutateAsync({ postId, ...input })
    await utils.social.getVariantEditor.invalidate({ variantId })
    setValueState((current) => ({
      ...current,
      attachments: [
        ...current.attachments,
        { source: key, crop: null, altOverride: null },
      ],
    }))
    onDirtyChange(true)
  }

  const galleryPicks: GalleryPick[] = (gallery.data ?? []).flatMap((image) => {
    const assetId = image.image?.asset?._ref
    if (!assetId) return []
    return [
      {
        id: image._id,
        assetId,
        alt: image.image.alt ?? image.imageAlt ?? '',
        hotspot: image.image.hotspot ?? null,
        crop: image.image.crop ?? null,
        thumbnailSrc: richTextImageUrl(assetId, 300),
      },
    ]
  })

  return (
    <VariantEditor
      platform={data.variant.platform}
      constraints={getPlatformConstraints(data.variant.platform)}
      postAttachments={data.post.attachments}
      postDefaultScheduledAt={data.post.defaultScheduledAt}
      value={value}
      onChange={setValue}
      saving={update.isPending}
      error={error}
      onCancel={onClose}
      onSave={() => {
        setError(null)
        const input = toUpdateInput(variantId, value)
        if (!input) {
          setError('Pick a date and time for the custom time.')
          return
        }
        update.mutate(input)
      }}
      sources={{
        onUpload: async (file, alt) => {
          const assetId = await uploadImage(file)
          await attachAsset({ assetId, alt })
        },
        gallery: {
          images: galleryPicks,
          isLoading: gallery.isLoading,
          onOpen: () => setGalleryOpen(true),
          onPick: (image) =>
            attachAsset({
              assetId: image.assetId,
              alt: image.alt || 'Conference photo',
              hotspot: image.hotspot,
              crop: image.crop,
            }),
        },
        shareCards,
        onAttachShareCard: shareCards
          ? async (card) => {
              const { blob, alt } = await card.render()
              const file = new File([blob], `${card.id}.png`, {
                type: blob.type || 'image/png',
              })
              const assetId = await uploadImage(file)
              await attachAsset({ assetId, alt })
            }
          : undefined,
      }}
    />
  )
}
