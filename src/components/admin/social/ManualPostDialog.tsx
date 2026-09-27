'use client'

import { useEffect, useState } from 'react'
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { useNotification } from '@/components/admin/NotificationProvider'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/types'
import { api } from '@/lib/trpc/client'
import { ManualPostView } from './ManualPostView'

/**
 * The copy-ready view wired to `social.*` (#1006): loads the variant with
 * its post's images through the editor read, and completes it with
 * `markPosted` — the server checks the URL against the platform domain
 * again and compare-and-sets on the revision it reads.
 */
export function ManualPostDialog({
  variantId,
  onClose,
  onPosted,
}: {
  variantId: string | null
  onClose: () => void
  onPosted?: () => void
}) {
  const isOpen = variantId !== null
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const editor = api.social.getVariantEditor.useQuery(
    { variantId: variantId ?? '' },
    { enabled: isOpen, refetchOnWindowFocus: false },
  )
  const [error, setError] = useState<string | null>(null)
  // Every opening runs the tag check afresh (tagging spec §4.4, review T4).
  // The dialog stays mounted while closed and queries stay fresh for 60 s,
  // so a reopen would show the body checked for an EARLIER opening — before
  // a speaker opted out. Each opening notes how old the cached answer is,
  // asks again, and shows (and offers to copy) only an answer newer than
  // that. Set during render, the React way to follow a prop change, so no
  // frame shows the cached answer.
  const [opening, setOpening] = useState({
    variantId: null as string | null,
    staleAt: 0,
  })
  if (opening.variantId !== variantId) {
    setOpening({ variantId, staleAt: editor.dataUpdatedAt })
  }
  const { refetch } = editor
  const hadCached = editor.dataUpdatedAt > 0
  useEffect(() => {
    // A first opening fetches on its own; a reopen must ask again.
    if (variantId && hadCached) void refetch()
    // Only on opening: `hadCached` is read as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantId, refetch])
  const data =
    opening.variantId === variantId && editor.dataUpdatedAt > opening.staleAt
      ? editor.data
      : undefined
  const loaded = data && data.variant._id === variantId ? data : null

  const markPosted = api.social.markPosted.useMutation({
    onSuccess: (_result, variables) => {
      void utils.social.listVariants.invalidate()
      void utils.social.getVariantEditor.invalidate({
        variantId: variables.variantId,
      })
      onPosted?.()
      // The organizer may have closed this and opened another variant while
      // the request was in flight: only the view for THAT variant closes.
      if (variables.variantId !== variantId) return
      showNotification({ type: 'success', title: 'Marked as posted' })
      setError(null)
      onClose()
    },
    onError: (err, variables) => {
      const message = err.message || 'Could not mark as posted.'
      // The view for that variant is gone: the failure still needs a voice.
      if (variables.variantId !== variantId) {
        showNotification({
          type: 'error',
          title: 'Could not mark as posted',
          message,
        })
        return
      }
      setError(message)
    },
  })

  const close = () => {
    setError(null)
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      size="3xl"
      title={
        loaded
          ? `Post by hand on ${SOCIAL_PLATFORM_LABELS[loaded.variant.platform]}`
          : 'Post by hand'
      }
      subtitle="Copy what you need, post it on the platform, then paste the post address"
      icon={<ClipboardDocumentListIcon className="size-5" />}
    >
      {editor.error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {editor.error.message}
        </p>
      ) : !loaded ? (
        <div className="h-72 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ) : (
        <ManualPostView
          key={loaded.variant._id}
          variant={loaded.variant}
          postAttachments={loaded.post.attachments}
          conferenceDomains={loaded.conferenceDomains}
          platformZone={loaded.platformZone ?? null}
          manualBody={loaded.manualBody ?? null}
          saving={
            markPosted.isPending &&
            markPosted.variables?.variantId === loaded.variant._id
          }
          error={error}
          onMarkPosted={(url) => {
            setError(null)
            markPosted.mutate({ variantId: loaded.variant._id, url })
          }}
        />
      )}
    </ModalShell>
  )
}
