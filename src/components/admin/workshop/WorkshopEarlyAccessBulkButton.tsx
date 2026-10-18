'use client'

import { useState } from 'react'
import { EnvelopeIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import {
  EARLY_ACCESS_SEND_REFUSALS,
  earlyAccessCopiesBehindNotice,
} from '@/lib/sponsor-crm/early-access-email'
import type { EarlyAccessBulkResult } from '@/server/routers/sponsorEarlyAccess'

const sponsors = (n: number) => `${n} ${n === 1 ? 'sponsor' : 'sponsors'}`

/** The organizer is on the workshops page already: point at the field. */
const NO_WINDOW_HERE =
  'Set a Sponsor Early Access Opens time above, earlier than the time registration opens for everyone.'

/**
 * "Send early access to sponsors" (#1347): mails the workshop early-access
 * email to every Closed Won sponsor that has not had it, with the built-in
 * text, to each sponsor's primary contact.
 *
 * The server sends a batch at a time and says how many are left; the summary
 * below the button then offers to run it again, which continues where it
 * stopped. `refusal` is the server's answer for the whole conference (no
 * early-access period, the period over, no working portal) and is shown as
 * text, not a tooltip.
 */
export function WorkshopEarlyAccessBulkButton() {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const [confirming, setConfirming] = useState(false)
  const [summary, setSummary] = useState<EarlyAccessBulkResult | null>(null)
  const preview = api.workshop.admin.earlyAccessBulkPreview.useQuery({
    onlyUnsent: true,
  })
  const [showEmail, setShowEmail] = useState(false)
  const email = api.workshop.admin.earlyAccessBulkEmailPreview.useQuery(
    { onlyUnsent: true },
    { enabled: confirming && showEmail, staleTime: 0 },
  )

  const send = api.workshop.admin.sendEarlyAccessBulk.useMutation({
    onSuccess: (result) => {
      setConfirming(false)
      setSummary(result)
      void preview.refetch()
      // The next sponsor in line has changed; reload the email when shown.
      void utils.workshop.admin.earlyAccessBulkEmailPreview.invalidate()
    },
    onError: (error) => {
      setConfirming(false)
      void preview.refetch()
      void utils.workshop.admin.earlyAccessBulkEmailPreview.invalidate()
      const refused =
        error.data?.code === 'PRECONDITION_FAILED' ||
        error.data?.code === 'BAD_REQUEST'
      showNotification({
        type: 'error',
        title: refused ? 'Nothing was sent' : 'The send did not finish',
        message: refused
          ? error.message
          : `${error.message} Some emails may have gone out; the count below is refreshed.`,
      })
    },
  })

  const count = preview.data?.count ?? 0
  const disabledReason = preview.isPending
    ? null
    : preview.error
      ? `Could not count the sponsors: ${preview.error.message}`
      : preview.data?.refusal === EARLY_ACCESS_SEND_REFUSALS['no-window']
        ? NO_WINDOW_HERE
        : (preview.data?.refusal ??
          (count === 0
            ? 'Every Closed Won sponsor has been sent early access.'
            : null))

  return (
    <div className="flex flex-col items-start gap-2">
      <AdminButton
        variant="secondary"
        disabled={
          preview.isPending || disabledReason !== null || send.isPending
        }
        aria-describedby={
          disabledReason ? 'early-access-bulk-reason' : undefined
        }
        onClick={() => setConfirming(true)}
      >
        <EnvelopeIcon className="mr-1.5 inline size-4" />
        Send early access to sponsors
      </AdminButton>
      {disabledReason && (
        <p
          id="early-access-bulk-reason"
          className="max-w-md text-xs text-gray-500 dark:text-gray-400"
        >
          {disabledReason}
        </p>
      )}

      {summary && (
        <div
          role="status"
          className="w-full max-w-xl space-y-2 text-sm text-gray-700 dark:text-gray-300"
        >
          <p>
            Sent to {sponsors(summary.sent.length)}
            {summary.sent.length > 0 &&
              `: ${summary.sent.map((s) => s.name).join(', ')}`}
            .
          </p>
          {summary.sent
            .filter((s) => s.copiesBehind > 0)
            .map((s) => (
              <p key={s.id}>
                <span className="font-medium">{s.name}</span>:{' '}
                {earlyAccessCopiesBehindNotice(s.copiesBehind)}
              </p>
            ))}
          {summary.skipped.length > 0 && (
            <div>
              <p>Not sent to {sponsors(summary.skipped.length)}:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {summary.skipped.map((s) => (
                  <li key={s.id}>
                    <span className="font-medium">{s.name}</span>: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {summary.remaining > 0 && (
            <p className="flex flex-wrap items-center gap-2">
              {sponsors(summary.remaining)} remaining.
              <AdminButton
                variant="secondary"
                disabled={send.isPending}
                onClick={() =>
                  send.mutate({
                    sponsorIds: summary.remainingIds,
                    onlyUnsent: true,
                  })
                }
              >
                {send.isPending ? 'Sending…' : 'Run again'}
              </AdminButton>
            </p>
          )}
        </div>
      )}

      <ConfirmationModal
        isOpen={confirming}
        onClose={() => {
          setConfirming(false)
          setShowEmail(false)
        }}
        onConfirm={() => send.mutate({ onlyUnsent: true })}
        isLoading={send.isPending}
        variant="info"
        title="Send early access to sponsors?"
        message={`${sponsors(count)} with a won deal that have not had it get the workshop early-access email, with the standard text and their link, sent to their primary contact. Sponsors without a primary contact are skipped. At most 25 sponsors are sent per run; Run again continues with the rest.`}
        confirmButtonText="Send"
      >
        <AdminButton
          variant="secondary"
          disabled={count === 0}
          aria-expanded={showEmail}
          onClick={() => setShowEmail((v) => !v)}
        >
          {showEmail ? 'Hide email' : 'Preview email'}
        </AdminButton>
        {showEmail && (
          <div className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
            {email.isPending ? (
              <div className="h-48 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
            ) : email.error ? (
              <p>Could not load the preview: {email.error.message}</p>
            ) : !email.data ? (
              <p>No sponsor would be sent the email.</p>
            ) : (
              <>
                <p>
                  As sent to{' '}
                  <span className="font-medium">{email.data.sponsorName}</span>.
                  Subject:{' '}
                  <span className="font-medium">{email.data.subject}</span>
                </p>
                {email.data.placeholderLink && (
                  <p>
                    This sponsor has no link yet. The address shown is a
                    placeholder; the send creates the real link.
                  </p>
                )}
                <iframe
                  title={`Email preview: ${email.data.subject}`}
                  sandbox=""
                  srcDoc={email.data.html}
                  className="h-96 w-full rounded-md border border-gray-200 bg-white dark:border-gray-700"
                />
              </>
            )}
          </div>
        )}
      </ConfirmationModal>
    </div>
  )
}
