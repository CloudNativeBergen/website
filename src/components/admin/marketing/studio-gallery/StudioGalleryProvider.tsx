'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/lib/trpc/client'
import { FORMAT_CHANGED } from '@/components/common/DownloadableImage'
import {
  GallerySaveContext,
  type ExportedVideo,
  type GallerySave,
  type StudioCard,
  type VideoOrigin,
} from '@/components/common/image-capture'
import {
  blobAssetUploader,
  type AssetUploader,
} from '@/components/admin/marketing/assets/upload'
import { SaveToGalleryDialog, type CapturedCard } from './SaveToGalleryDialog'
import {
  SaveVideoToGalleryDialog,
  type CapturedVideo,
} from './SaveVideoToGalleryDialog'

/**
 * "Save to gallery" for every studio card (docs/MARKETING_ASSETS_SPEC.md
 * §4.2), with or without a render Task open: it sits OUTSIDE the Task's
 * attachment context, so the two never depend on each other.
 *
 * The card is captured when the organizer clicks, so the dialog shows exactly
 * what will be saved while they write its alt text. The upload goes through
 * the gallery's direct-to-Blob path, never the studio's multipart route, which
 * Vercel cuts at about 4.5 MB. `orgId` only NAMES the upload's pathname; the
 * server resolves the organization itself. `uploader` replaces the real path
 * in tests and Storybook.
 */
export function StudioGalleryProvider({
  orgId,
  uploader,
  children,
}: {
  orgId: string
  uploader?: AssetUploader
  children: React.ReactNode
}) {
  const upload = useMemo(
    () => uploader ?? blobAssetUploader(orgId),
    [uploader, orgId],
  )
  const utils = api.useUtils()
  const [capturing, setCapturing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)
  const [captured, setCaptured] = useState<CapturedCard | null>(null)
  // An exported video (#1182): its own dialog, never open with the image's.
  const [videoOpen, setVideoOpen] = useState(false)
  const [capturedVideo, setCapturedVideo] = useState<CapturedVideo | null>(null)
  // Each capture is a fresh form: nothing typed for one card carries over.
  const captures = useRef(0)
  // The dialog's preview of the last capture, revoked when replaced.
  const previewUrl = useRef<string | null>(null)
  const videoPreviewUrl = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      if (videoPreviewUrl.current) URL.revokeObjectURL(videoPreviewUrl.current)
    },
    [],
  )
  function replacePreview(blob: Blob | null): string | null {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    previewUrl.current = blob ? URL.createObjectURL(blob) : null
    return previewUrl.current
  }
  function replaceVideoPreview(blob: Blob | null): string | null {
    if (videoPreviewUrl.current) URL.revokeObjectURL(videoPreviewUrl.current)
    videoPreviewUrl.current = blob ? URL.createObjectURL(blob) : null
    return videoPreviewUrl.current
  }

  const value = useMemo<GallerySave>(
    () => ({
      busy: capturing || saving,
      async save(
        capture: () => Promise<Blob>,
        filename: string,
        card: StudioCard,
      ) {
        setCapturing(true)
        const mine = ++captures.current
        try {
          const blob = await capture()
          // Superseded by a video save while it ran: nothing of it is kept,
          // not the blob and not a preview URL nothing would revoke.
          if (captures.current !== mine) return
          setCaptured({
            id: mine,
            blob,
            previewUrl: replacePreview(blob),
            filename,
            card,
            error: null,
          })
        } catch (error) {
          if (captures.current !== mine) return
          console.error('Save to gallery: capture failed', error)
          setCaptured({
            id: mine,
            blob: null,
            previewUrl: replacePreview(null),
            filename,
            card,
            error:
              error instanceof Error && error.message === FORMAT_CHANGED
                ? error.message
                : 'The image could not be made. Close this and try again.',
          })
        } finally {
          setCapturing(false)
          // A video save that came while the capture ran is the newer ask:
          // its dialog stays, and this capture is not shown over it.
          if (captures.current === mine) {
            setVideoOpen(false)
            setOpen(true)
          }
        }
      },
      saveVideo(video: ExportedVideo, origin: VideoOrigin) {
        if (saving) return
        setCapturedVideo({
          id: ++captures.current,
          video,
          previewUrl: replaceVideoPreview(video.blob)!,
          origin,
        })
        setOpen(false)
        setVideoOpen(true)
      },
    }),
    [capturing, saving],
  )

  // A capture can be several MB: let it go once the dialog has faded out.
  function release() {
    replacePreview(null)
    setCaptured(null)
  }
  // A video can be tens of MB: the same, once its dialog has faded out.
  function releaseVideo() {
    replaceVideoPreview(null)
    setCapturedVideo(null)
  }
  function onSaved() {
    // The gallery and the studio's background picker show it next.
    void utils.marketingAsset.list.invalidate()
    void utils.marketingAsset.filters.invalidate()
  }

  return (
    <GallerySaveContext.Provider value={value}>
      {children}
      <SaveToGalleryDialog
        isOpen={open}
        captured={captured}
        uploader={upload}
        onSavingChange={setSaving}
        onClose={() => setOpen(false)}
        afterLeave={release}
        onSaved={onSaved}
      />
      <SaveVideoToGalleryDialog
        isOpen={videoOpen}
        captured={capturedVideo}
        uploader={upload}
        onSavingChange={setSaving}
        onClose={() => setVideoOpen(false)}
        afterLeave={releaseVideo}
        onSaved={onSaved}
      />
    </GallerySaveContext.Provider>
  )
}
