'use client'

import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'

/** Server refusals: each means nothing was sent. */
const REFUSALS = new Set(['PRECONDITION_FAILED', 'TOO_MANY_REQUESTS'])

/**
 * "Resend sign-up instructions" (#1298): mails every workshop ticket holder
 * the sign-up instructions WITH the portal link. For tickets sold while the
 * main host could not sign in — their email went out without it.
 *
 * `disabledReason` is decided on the server by the rule the resend itself
 * applies (no working link, or registration closed) and shown as text, not a
 * tooltip: a disabled button cannot be focused to reveal one. The server
 * refuses then too, and allows one resend an hour.
 */
export function ResendInstructionsButton({
  disabledReason,
}: {
  disabledReason: string | null
}) {
  const { showNotification } = useNotification()
  const [confirming, setConfirming] = useState(false)

  const resend = api.workshop.admin.resendSignupInstructions.useMutation({
    onSuccess: ({ sent, failed }) => {
      setConfirming(false)
      showNotification(
        sent + failed === 0
          ? {
              type: 'info',
              title: 'Nothing to send',
              message: 'No one holds a workshop ticket yet.',
            }
          : failed === 0
            ? {
                type: 'success',
                title: 'Instructions sent',
                message: `Sent to ${sent} workshop ticket holder${sent === 1 ? '' : 's'}.`,
              }
            : {
                type: 'warning',
                title: 'Instructions partly sent',
                message: `Sent to ${sent}; ${failed} could not be sent.`,
              },
      )
    },
    onError: (error) => {
      setConfirming(false)
      showNotification(
        REFUSALS.has(error.data?.code ?? '')
          ? { type: 'error', title: 'Nothing was sent', message: error.message }
          : {
              type: 'error',
              title: 'The resend did not finish',
              message:
                'Some emails may have been sent. Check with an attendee before trying again.',
            },
      )
    },
  })

  return (
    <div className="flex flex-col items-end gap-1">
      <AdminButton
        variant="secondary"
        disabled={disabledReason !== null || resend.isPending}
        aria-describedby={
          disabledReason ? 'resend-instructions-reason' : undefined
        }
        onClick={() => setConfirming(true)}
      >
        <EnvelopeIcon className="mr-1.5 inline size-4" />
        Resend sign-up instructions
      </AdminButton>
      {disabledReason && (
        <p
          id="resend-instructions-reason"
          className="max-w-xs text-right text-xs text-gray-500 dark:text-gray-400"
        >
          {disabledReason}
        </p>
      )}
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => resend.mutate()}
        isLoading={resend.isPending}
        variant="info"
        title="Resend sign-up instructions?"
        message="Every workshop ticket holder gets the sign-up instructions, with the link to the workshop portal. Use it once, after sign-in starts working; it can be sent at most once an hour."
        confirmButtonText="Send to all holders"
      />
    </div>
  )
}
