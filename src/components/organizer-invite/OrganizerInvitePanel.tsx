'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  EnvelopeIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'

/**
 * The organizer-invitation accept surface (platform#49).
 *
 * Every terminal state is a variant of ONE component so the page has a single
 * visual grammar and each state is inspectable in Storybook. The server decides
 * which state applies; this renders it and owns only the accept interaction.
 *
 * SESSION REFRESH IS PART OF THE FEATURE, not a nicety. Organizer standing is
 * derived at token-mint time (`organizerOrgIds` on the JWT), so a freshly
 * granted organizer would keep getting 403 from `/admin` until their next
 * sign-in. `useSession().update()` re-invokes the `jwt` callback with
 * `trigger: 'update'`, which re-reads the speaker and re-applies the claims.
 */

export type OrganizerInviteState =
  /** No token, a malformed one, or one that names nothing on this tenant. */
  | { kind: 'invalid' }
  /** Already accepted, or revoked by an organizer. */
  | { kind: 'inactive'; status: 'accepted' | 'revoked' }
  | { kind: 'expired' }
  /**
   * Signed in, but not as someone who has proved control of the invited
   * address. `maskedEmail` is deliberately masked: this branch is reachable by
   * anyone holding a forwarded link, and the full address is not theirs to see.
   */
  | {
      kind: 'wrong-identity'
      maskedEmail: string
      currentEmail: string
      signInHref: string
    }
  /** Ownership already proved — the accept button is live. */
  | {
      kind: 'ready'
      token: string
      conferenceName: string
      inviterName: string
      invitedEmail: string
      expiresAt: string
    }

export interface OrganizerInvitePanelProps {
  state: OrganizerInviteState
}

function Shell({
  tone,
  icon,
  title,
  children,
}: {
  tone: 'neutral' | 'danger' | 'success'
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const toneClasses = {
    neutral:
      'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/60',
    danger:
      'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30',
    success:
      'border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/30',
  }[tone]
  const iconClasses = {
    neutral: 'text-brand-cloud-blue dark:text-blue-400',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  }[tone]

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:py-16">
      <div className={`rounded-2xl border p-6 shadow-xs sm:p-8 ${toneClasses}`}>
        <div className={`mb-4 ${iconClasses}`}>{icon}</div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        <div className="mt-3 space-y-4 text-sm text-gray-700 dark:text-gray-300">
          {children}
        </div>
      </div>
    </div>
  )
}

export function OrganizerInvitePanel({ state }: OrganizerInvitePanelProps) {
  const { update } = useSession()
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mutation = api.organizerInvite.accept.useMutation({
    onSuccess: async () => {
      setError(null)
      setAccepted(true)
      // Re-mint the JWT so `organizerOrgIds` carries the new grant; without this
      // the person we just made an organizer is refused by `/admin`.
      try {
        await update()
      } catch {
        // A refresh failure costs a sign-out/sign-in, never the grant itself.
      }
    },
    onError: (err) =>
      setError(err.message || 'Could not accept the invitation.'),
  })

  if (accepted) {
    return (
      <Shell
        tone="success"
        icon={<CheckCircleIcon className="h-8 w-8" />}
        title="You are now an organizer"
      >
        <p>
          Your admin access is active. If a page still refuses you, sign out and
          back in once.
        </p>
        <Link
          href="/admin"
          className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-cloud-blue px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue"
        >
          Open the admin area
        </Link>
      </Shell>
    )
  }

  switch (state.kind) {
    case 'invalid':
      return (
        <Shell
          tone="danger"
          icon={<ExclamationTriangleIcon className="h-8 w-8" />}
          title="This invitation link is not valid"
        >
          <p>
            The link may have been mistyped, or it belongs to a different event.
            Ask whoever invited you to send a new one.
          </p>
        </Shell>
      )

    case 'inactive':
      return (
        <Shell
          tone="neutral"
          icon={<ExclamationTriangleIcon className="h-8 w-8" />}
          title={
            state.status === 'accepted'
              ? 'This invitation has already been accepted'
              : 'This invitation was withdrawn'
          }
        >
          <p>
            {state.status === 'accepted'
              ? 'Nothing more to do here. If you cannot reach the admin area, sign out and back in once.'
              : 'An organizer revoked this invitation. Ask them to send a new one if that was not intended.'}
          </p>
        </Shell>
      )

    case 'expired':
      return (
        <Shell
          tone="neutral"
          icon={<ExclamationTriangleIcon className="h-8 w-8" />}
          title="This invitation has expired"
        >
          <p>
            Organizer invitations are valid for a limited time. Ask an organizer
            to send you a fresh one.
          </p>
        </Shell>
      )

    case 'wrong-identity':
      return (
        <Shell
          tone="neutral"
          icon={<EnvelopeIcon className="h-8 w-8" />}
          title="Sign in with the invited address"
        >
          <p>
            You are signed in as{' '}
            <strong className="font-semibold">{state.currentEmail}</strong>.
            This invitation was sent to{' '}
            <strong className="font-semibold">{state.maskedEmail}</strong>.
          </p>
          <p>
            To accept it, request an <strong>email sign-in link</strong> for
            that address and open it. Receiving that link is what proves the
            invitation reached the right person — the invitation link on its own
            is not enough, because mail gets forwarded.
          </p>
          <Link
            href={state.signInHref}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-cloud-blue px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue"
          >
            Email me a sign-in link
          </Link>
        </Shell>
      )

    case 'ready':
      return (
        <Shell
          tone="neutral"
          icon={<ShieldCheckIcon className="h-8 w-8" />}
          title={`Join the organizer team for ${state.conferenceName}`}
        >
          <p>
            <strong className="font-semibold">{state.inviterName}</strong>{' '}
            invited{' '}
            <strong className="font-semibold">{state.invitedEmail}</strong> to
            organize {state.conferenceName}.
          </p>
          <p>
            Accepting gives you full access to the event admin area — proposals,
            speakers, sponsors and the schedule. It applies to this
            organization&apos;s events only.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Expires {state.expiresAt}
          </p>

          {error ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate({ token: state.token })}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-brand-cloud-blue px-4 py-2 font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:opacity-60"
          >
            {mutation.isPending ? 'Accepting…' : 'Accept invitation'}
          </button>
        </Shell>
      )
  }
}
