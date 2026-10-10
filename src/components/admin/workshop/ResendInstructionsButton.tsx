'use client'

import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'

/**
 * "Resend sign-up instructions" (#1298): mails every workshop ticket holder
 * the sign-up instructions WITH the portal link. For tickets sold while the
 * main host could not sign in — their email went out without it.
 *
 * Disabled until the portal link works (`portalAvailable`, decided on the
 * server by the same rule the email uses); the server refuses then too, and
 * allows one resend an hour.
 */
export function ResendInstructionsButton({
  portalAvailable,
}: {
  portalAvailable: boolean
}) {
  const { showNotification } = useNotification()
  const [confirming, setConfirming] = useState(false)

  const resend = api.workshop.admin.resendSignupInstructions.useMutation({
    onSuccess: ({ sent, failed }) => {
      setConfirming(false)
      showNotification(
        failed === 0
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
      showNotification({
        type: 'error',
        title: 'Nothing was sent',
        message: error.message,
      })
    },
  })

  return (
    <>
      <AdminButton
        variant="secondary"
        disabled={!portalAvailable || resend.isPending}
        title={
          portalAvailable
            ? undefined
            : 'Available once attendees can sign in on the conference’s main host'
        }
        onClick={() => setConfirming(true)}
      >
        <EnvelopeIcon className="mr-1.5 inline size-4" />
        Resend sign-up instructions
      </AdminButton>
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => resend.mutate()}
        isLoading={resend.isPending}
        variant="info"
        title="Resend sign-up instructions?"
        message="Every workshop ticket holder gets the sign-up instructions again, now with the link to the workshop portal. Use it once, after sign-in starts working; it can be sent at most once an hour."
        confirmButtonText="Send to all holders"
      />
    </>
  )
}
