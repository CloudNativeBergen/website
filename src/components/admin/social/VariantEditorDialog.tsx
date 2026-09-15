'use client'

import { useState } from 'react'
import { PencilSquareIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { SOCIAL_PLATFORM_LABELS } from '@/lib/social/types'
import { api } from '@/lib/trpc/client'
import type { ShareCardSource } from './AttachmentSlot'
import { ConnectedVariantEditor } from './ConnectedVariantEditor'

/**
 * The single-variant editor in a dialog (#1007), for the posts table: loads
 * the variant and hosts `ConnectedVariantEditor`, which does the saving.
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
  // Every close path (Escape, backdrop, header X, a save) goes through the
  // shell's dirty guard and then here, so the flag never leaks to the next
  // variant. The editor renders no Cancel of its own for the same reason.
  const close = () => {
    setDirty(false)
    onClose()
  }

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      size="5xl"
      title={
        loaded
          ? `Edit ${SOCIAL_PLATFORM_LABELS[loaded.variant.platform]} variant`
          : 'Edit variant'
      }
      subtitle="The platform's rules are applied as you type"
      icon={<PencilSquareIcon className="size-5" />}
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
        <ConnectedVariantEditor
          key={loaded.variant._id}
          data={loaded}
          onSaved={() => {
            onSaved?.()
            close()
          }}
          onDirtyChange={setDirty}
          shareCards={shareCards}
        />
      )}
    </ModalShell>
  )
}
