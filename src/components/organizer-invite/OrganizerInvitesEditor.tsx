'use client'

import { useState } from 'react'
import {
  EnvelopeIcon,
  TrashIcon,
  PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { formatDate } from '@/lib/time'
import type { OrganizerInvitationMinimal } from '@/lib/organizer-invite/types'

/**
 * The "invite an organizer by email" island (platform#49).
 *
 * It sits beside {@link OrganizersEditor}, which can only PICK an existing
 * speaker document from a corpus of *this conference's confirmed speakers plus
 * its current organizers*. On a fresh tenant that corpus is exactly the founder,
 * so the picker cannot grow a committee at all — this is the door that makes
 * team growth possible without a hand-edit in Sanity.
 *
 * The list here shows INVITATIONS, not organizers. An accepted invitation adds a
 * row to the organizers card instead; nothing in this modal can remove a sitting
 * organizer, so the `min(1)` floor on `organizers[]` is untouchable from here.
 */

export interface OrganizerInvitesEditorProps {
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
  /** Seed rows so stories render without a network round trip. */
  initialInvitations?: OrganizerInvitationMinimal[]
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  revoked: 'Revoked',
  expired: 'Expired',
}

const STATUS_CLASS: Record<string, string> = {
  pending:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  accepted:
    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  revoked: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  expired: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

export function OrganizerInvitesEditor({
  defaultOpen = false,
  initialInvitations,
}: OrganizerInvitesEditorProps) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const list = api.organizerInvite.list.useQuery(undefined, {
    enabled: isOpen,
    initialData: initialInvitations,
  })

  const invite = api.organizerInvite.invite.useMutation({
    onSuccess: (created) => {
      setEmail('')
      setName('')
      setError(null)
      void utils.organizerInvite.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Invitation sent',
        message: `We emailed ${created.invitedEmail} a link to join the organizer team.`,
      })
    },
    onError: (err) => setError(err.message || 'Could not send the invitation.'),
  })

  const [revokingId, setRevokingId] = useState<string | null>(null)

  const revoke = api.organizerInvite.revoke.useMutation({
    onSuccess: () => {
      void utils.organizerInvite.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Invitation revoked',
        message: 'That link can no longer be accepted.',
      })
    },
    onError: (err) =>
      showNotification({
        type: 'error',
        title: 'Could not revoke',
        message: err.message || 'Failed to revoke the invitation.',
      }),
    onSettled: () => setRevokingId(null),
  })

  const rows = list.data ?? []

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null)
          setIsOpen(true)
        }}
        aria-label="Invite an organizer by email"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <EnvelopeIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        size="lg"
        title="Invite an organizer"
        subtitle="Send an email invitation to join the organizer team"
        icon={<EnvelopeIcon className="h-5 w-5" />}
      >
        <div className="space-y-5">
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">
            The invitee accepts by signing in with an email link sent to the
            address you enter — that is what proves the invitation reached the
            right person. Organizer access covers this organization&apos;s
            events, and appears once their session refreshes.
          </p>

          <form
            noValidate
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              setError(null)
              invite.mutate({ email, name: name.trim() || undefined })
            }}
          >
            <div>
              <label
                htmlFor="organizer-invite-email"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Email address
              </label>
              <input
                id="organizer-invite-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="organizer-invite-name"
                className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Name <span className="text-gray-400">(optional)</span>
              </label>
              <input
                id="organizer-invite-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-base text-gray-900 focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
            </div>

            {error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}

            <div className="flex justify-end">
              <AdminButton
                type="submit"
                color="blue"
                size="md"
                disabled={invite.isPending || email.trim().length === 0}
                className="min-h-[44px]"
              >
                <PaperAirplaneIcon className="mr-2 h-4 w-4" />
                {invite.isPending ? 'Sending…' : 'Send invitation'}
              </AdminButton>
            </div>
          </form>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
              Invitations
            </h3>
            {/*
              LOADING and ERROR are distinguished from EMPTY on purpose.
              `listOrganizerInvitations` deliberately does not catch, so a Sanity
              outage arrives here as a query error — and painting that as "No
              invitations yet" would tell an organizer that nobody was invited
              when in fact we could not look. That is the absence-vs-value trap
              in UI form, and it ends with a duplicate invitation.
            */}
            {list.isPending ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Loading invitations…
              </p>
            ) : list.isError ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
              >
                We could not load the invitations. This is not the same as there
                being none — reload before inviting anyone again.
              </p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No invitations yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((row) => (
                  <li
                    key={row._id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 p-2 dark:border-gray-700"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {row.invitedName
                          ? `${row.invitedName} · ${row.invitedEmail}`
                          : row.invitedEmail}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        <span
                          className={`mr-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[row.status] ?? STATUS_CLASS.revoked}`}
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                        {row.status === 'pending'
                          ? `Expires ${formatDate(row.expiresAt)}`
                          : row.invitedByName
                            ? `Invited by ${row.invitedByName}`
                            : null}
                      </p>
                    </div>
                    {row.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRevokingId(row._id)
                          revoke.mutate({ invitationId: row._id })
                        }}
                        // Only the row being revoked is disabled — a single
                        // `revoke.isPending` froze every row at once.
                        disabled={revokingId === row._id}
                        aria-label={`Revoke the invitation for ${row.invitedEmail}`}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ModalShell>
    </>
  )
}
