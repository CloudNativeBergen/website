'use client'

import { useState } from 'react'
import { EnvelopeIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import { Speaker } from '@/lib/speaker/types'
import { Format } from '@/lib/proposal/types'
import { SpeakerAvatars } from '@/components/SpeakerAvatars'
import { LoadingSpinner } from '@/components/LoadingSpinner'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { CoSpeakerInvitationMinimal } from '@/lib/cospeaker/types'
import {
  allowsCoSpeakers,
  daysUntilExpiry,
  getCoSpeakerLimit,
  getInvitationDisplayState,
  getTotalSpeakerLimit,
  reminderCooldownRemainingMs,
  summarizeSpeakerRoster,
  type InvitationDisplayState,
} from '@/lib/cospeaker/constants'
import { validateEmail } from '@/lib/cospeaker/client'
import { canonicalEmail, normalizeEmail } from '@/lib/speaker/email'
import { formatDateSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'

interface ProposalCoSpeakerProps {
  /**
   * Every speaker on the proposal, in proposal order: `speakers[0]` is the
   * primary. One ordered array, one list — the split into "Speakers" and
   * "Co-speakers" headings is what let the two halves drift apart.
   */
  speakers: Speaker[]
  /**
   * Invitations for this proposal. Accepted and canceled ones are dropped
   * here as well as server-side: an accepted invitee is already a row in
   * `speakers`, and a canceled invitation has no ongoing meaning.
   */
  invitations?: CoSpeakerInvitationMinimal[]
  format: Format
  proposalId?: string
  /**
   * Local-state path for adding and removing: called with the new ordered
   * speaker list, leaving persistence to whatever the host form submits.
   */
  onSpeakersChange?: (speakers: Speaker[]) => void
  /**
   * Persist the removal of one speaker (the `proposal.removeCoSpeaker`
   * mutation, which also cancels their accepted invitation). Takes precedence
   * over `onSpeakersChange`, so there is exactly ONE removal path per host.
   * May throw; the message is shown inline.
   */
  onRemoveSpeaker?: (speakerId: string) => Promise<void> | void
  /**
   * Speaker ids the server already has. Removal of anything NOT in this set is
   * local (it was added from search and is not saved yet), so the persisting
   * mutation is not called with an id the proposal never had. Omit it where
   * every listed speaker is persisted.
   */
  persistedSpeakerIds?: string[]
  onInvitationSent?: (invitation: CoSpeakerInvitationMinimal) => void
  onInvitationCanceled?: (invitationId: string) => void
  /**
   * Fresh invitations after a row action failed. `resend` can renew the
   * document and still fail to deliver the email, so local state would keep
   * offering Resend on a row that is open again — and its own error message
   * tells the operator to send a reminder instead.
   */
  onInvitationsRefreshed?: (invitations: CoSpeakerInvitationMinimal[]) => void
  /** Read-only contexts hide every row action and the add flow. */
  allowRemove?: boolean
  /**
   * Speaker id of the viewer. Their row is marked "You" and has no Remove —
   * self-removal is blocked server-side.
   */
  currentUserSpeakerId?: string
  /**
   * ADMIN CONTEXT ONLY. Adds the search-existing step, the "Make primary" row
   * action and the organizer copy. Searching the speaker directory must never
   * be offered to a CFP submitter, so the host passes this explicitly rather
   * than the component guessing from the route.
   */
  allowPickExisting?: boolean
  /**
   * ADMIN CONTEXT ONLY. Adds the last-resort step that fabricates a speaker
   * profile without that person's involvement. The real control is the
   * server's `adminProcedure` on `proposal.addCoSpeakerProfile`; this is
   * affordance.
   */
  allowDirectProfileCreation?: boolean
  /**
   * Whether the per-format speaker limit blocks adding. Organizers may exceed
   * it (#1030), so the admin host passes `false` and gets a notice instead.
   */
  enforceFormatLimit?: boolean
  /** Called with what the direct path persisted, including invitations it superseded. */
  onSpeakerCreated?: (result: {
    speaker: { _id: string; name: string; email: string; title?: string }
    supersededInvitationIds: string[]
  }) => void
}

type PillTone = 'neutral' | 'blue' | 'amber' | 'red'

const pillClasses: Record<PillTone, string> = {
  neutral:
    'bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-gray-400/10 dark:text-gray-200 dark:ring-gray-400/30',
  blue: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-400/40',
  amber:
    'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-400/10 dark:text-amber-200 dark:ring-amber-400/40',
  red: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-400/10 dark:text-red-200 dark:ring-red-400/40',
}

function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: PillTone
  children: React.ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${pillClasses[tone]}`}
    >
      {children}
    </span>
  )
}

function RowAction({
  onClick,
  disabled,
  children,
  tone = 'default',
  label,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  tone?: 'default' | 'danger'
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200'
          : 'text-brand-cloud-blue hover:text-brand-cloud-blue/80 dark:text-blue-300 dark:hover:text-blue-200'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * Whether a profile created for this address could ever be CLAIMED by signing
 * in with it. `invitation.send` accepts an address whose NFKC form differs from
 * its stored form (`oﬃce@x.com`); `addCoSpeakerProfile` refuses exactly those,
 * because login matches on the folded form and would never reach the document.
 *
 * So the upgrade is not offered for such an invitation. The alternative — an
 * editable address on the upgrade form — only leads to the mismatch refusal,
 * since the supersede is keyed on the invitation's own address. Cancel the
 * invitation and use the plain create step instead.
 */
const isClaimableAddress = (email: string) =>
  normalizeEmail(email) === canonicalEmail(email)

/** Dashed-ring stand-in for someone who has no profile yet. */
function InviteePlaceholder() {
  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-400 dark:border-gray-500"
      aria-hidden="true"
    >
      <EnvelopeIcon className="h-4 w-4 text-gray-500 dark:text-gray-300" />
    </span>
  )
}

function invitationPill(
  state: InvitationDisplayState,
  invitation: CoSpeakerInvitationMinimal,
) {
  if (state === 'declined') return <Pill tone="red">Declined</Pill>
  if (state === 'expired')
    return (
      <Pill tone="amber">Expired {formatDateSafe(invitation.expiresAt)}</Pill>
    )

  const days = daysUntilExpiry(invitation.expiresAt)
  const left =
    days <= 0
      ? 'expires today'
      : days === 1
        ? 'expires tomorrow'
        : `${days} days left`
  return <Pill tone="blue">Invited · {left}</Pill>
}

const inputClass =
  'block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-brand-cloud-blue sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500'

const labelClass = 'block text-sm font-medium text-gray-900 dark:text-white'

export function ProposalCoSpeaker({
  speakers,
  invitations = [],
  format,
  proposalId,
  onSpeakersChange,
  onRemoveSpeaker,
  persistedSpeakerIds,
  onInvitationSent,
  onInvitationCanceled,
  onInvitationsRefreshed,
  allowRemove = true,
  currentUserSpeakerId,
  allowPickExisting = false,
  allowDirectProfileCreation = false,
  enforceFormatLimit = true,
  onSpeakerCreated,
}: ProposalCoSpeakerProps) {
  const coSpeakerLimit = getCoSpeakerLimit(format)
  const totalLimit = getTotalSpeakerLimit(format)

  const [addOpen, setAddOpen] = useState(false)
  const [query, setQuery] = useState('')
  // null means "not edited yet", so the value keeps tracking the search query.
  const [emailEdit, setEmailEdit] = useState<string | null>(null)
  const [nameEdit, setNameEdit] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(null)
  // Row actions report on their own row: a refusal ("still inside the
  // cooldown", "the seat has since been filled") is about that invitation, and
  // a message 300 px away reads as a generic failure.
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(
    null,
  )
  // Set when the create step was opened FROM an invitation row. It is sent to
  // the server, which refuses a declined one and pins the address.
  const [upgradingInvitation, setUpgradingInvitation] =
    useState<CoSpeakerInvitationMinimal | null>(null)
  const [speakerPendingRemoval, setSpeakerPendingRemoval] =
    useState<Speaker | null>(null)
  const [isRemovingSpeaker, setIsRemovingSpeaker] = useState(false)
  const [removeError, setRemoveError] = useState('')

  const queryIsEmail = validateEmail(query.trim())
  const email = emailEdit ?? (queryIsEmail ? query.trim() : '')
  const name = nameEdit ?? (queryIsEmail ? '' : query.trim())

  const utils = api.useUtils()
  const sendInvitation = api.proposal.invitation.send.useMutation()
  const cancelInvitation = api.proposal.invitation.cancel.useMutation()
  const remindInvitation = api.proposal.invitation.remind.useMutation()
  const resendInvitation = api.proposal.invitation.resend.useMutation()
  const createProfile = api.proposal.addCoSpeakerProfile.useMutation()

  // Only organizers may browse the speaker directory; the query never runs in
  // the CFP form.
  //
  // NO `staleTime`. It was five minutes, and that window reopened the dead end
  // this directory exists to close: create a profile on one proposal, open the
  // picker on another a minute later, and the just-created person is missing —
  // so the create step refuses with "add that existing profile instead" and
  // there is again no way to follow the advice. `enabled` means this refetches
  // once per picker open, which is what the server read is sized for.
  const { data: directory = [], isLoading: directoryLoading } =
    api.speaker.admin.list.useQuery(undefined, {
      enabled: allowPickExisting && addOpen,
    })

  const shownInvitations = invitations
    .map(
      (invitation) =>
        [invitation, getInvitationDisplayState(invitation)] as const,
    )
    .filter(
      (
        entry,
      ): entry is readonly [
        CoSpeakerInvitationMinimal,
        InvitationDisplayState,
      ] => entry[1] !== null,
    )
    // An invitee who is already a speaker is represented by their speaker row.
    .filter(
      ([invitation]) =>
        !speakers.some(
          (s) =>
            s.email?.toLowerCase() === invitation.invitedEmail.toLowerCase(),
        ),
    )

  const counts = {
    confirmed: speakers.length,
    pending: shownInvitations.filter(([, s]) => s === 'pending').length,
    expired: shownInvitations.filter(([, s]) => s === 'expired').length,
    declined: shownInvitations.filter(([, s]) => s === 'declined').length,
  }
  const summary = summarizeSpeakerRoster(counts)

  // An expired invitation is dead and must NOT hold a slot: counting it is
  // what blocked organizers from inviting anyone else.
  const committed = counts.confirmed + counts.pending
  const atLimit = committed >= totalLimit
  // Only where the limit is advisory. Where it is enforced the "limit reached"
  // sentence already says it, and a speaker on a talk an organizer overfilled
  // must not be shown both.
  const overLimit = !enforceFormatLimit && speakers.length > totalLimit
  const canAdd =
    allowRemove &&
    (enforceFormatLimit ? allowsCoSpeakers(format) && !atLimit : true)

  const resetPanel = () => {
    setQuery('')
    setEmailEdit(null)
    setNameEdit(null)
    setTitle('')
    setCreating(false)
    setFormError('')
    setUpgradingInvitation(null)
  }

  const closePanel = () => {
    setAddOpen(false)
    resetPanel()
  }

  const directoryMatches = allowPickExisting
    ? directory.filter((candidate) => {
        if (speakers.some((s) => s._id === candidate._id)) return false
        const q = query.trim().toLowerCase()
        if (q.length < 2) return false
        return (
          candidate.name?.toLowerCase().includes(q) ||
          candidate.email?.toLowerCase().includes(q)
        )
      })
    : []

  // `!directoryLoading` matters: an in-flight directory read yields an empty
  // list, which would otherwise read as "no match" and open the invite and
  // create steps before the search has actually looked.
  const searchExhausted =
    query.trim().length >= 2 &&
    !directoryLoading &&
    directoryMatches.length === 0
  // Invitations and profiles hang off a saved proposal, so neither step can do
  // anything before one exists.
  const canCommitNewPerson = !!proposalId
  // The invite step is reachable for a speaker straight away; an organizer
  // passes a search that found nothing first. That ordering is the guard rail
  // against duplicate speaker profiles.
  const showInviteStep =
    canCommitNewPerson && !creating && (!allowPickExisting || searchExhausted)
  const showCreateStep =
    canCommitNewPerson && creating && allowDirectProfileCreation

  const handleAddExisting = (candidate: { _id: string; name: string }) => {
    onSpeakersChange?.([...speakers, candidate as unknown as Speaker])
    closePanel()
  }

  const handleMakePrimary = (speaker: Speaker) => {
    onSpeakersChange?.([
      speaker,
      ...speakers.filter((s) => s._id !== speaker._id),
    ])
  }

  const handleSendInvitation = async () => {
    if (!proposalId) {
      setFormError('Save the proposal as a draft before inviting a co-speaker.')
      return
    }
    setFormError('')
    try {
      const result = await sendInvitation.mutateAsync({
        proposalId,
        invitedEmail: email.trim(),
        invitedName: name.trim() || email.trim().split('@')[0],
      })
      onInvitationSent?.({
        _id: result._id,
        invitedEmail: result.invitedEmail,
        invitedName: result.invitedName,
        status: result.status,
        expiresAt: result.expiresAt,
      })
      setStatusMessage(`Invitation sent to ${email.trim()}.`)
      closePanel()
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Failed to send the invitation.',
      )
    }
  }

  const handleCreateProfile = async () => {
    if (!proposalId) {
      setFormError('Save the proposal as a draft before creating a profile.')
      return
    }
    setFormError('')
    try {
      const result = await createProfile.mutateAsync({
        proposalId,
        name: name.trim(),
        email: email.trim() || undefined,
        title: title.trim() || undefined,
        fromInvitationId: upgradingInvitation?._id,
      })
      onSpeakerCreated?.({
        speaker: result.speaker,
        supersededInvitationIds: result.supersededInvitationIds,
      })
      setStatusMessage(
        result.notificationSkipped
          ? `${result.speaker.name} is listed as a speaker. No email address was given, so nobody was told.`
          : result.notified
            ? `${result.speaker.name} is listed as a speaker and was told by email.`
            : `${result.speaker.name} is listed as a speaker, but the email could not be sent. Tell them yourself.`,
      )
      closePanel()
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Failed to create the profile.',
      )
    }
  }

  /**
   * Open the create step prefilled from an invitation, for a co-speaker who
   * will not act on theirs. Deliberately NOT one click: the operator sees the
   * consequence text and confirms, and supplies a name when the invitation
   * carried none (an address local part is not somebody's name).
   */
  const handleUpgradeInvitation = (invitation: CoSpeakerInvitationMinimal) => {
    setStatusMessage('')
    setRowError(null)
    setFormError('')
    setQuery('')
    setEmailEdit(invitation.invitedEmail)
    setNameEdit(invitation.invitedName ?? '')
    setTitle('')
    setUpgradingInvitation(invitation)
    setCreating(true)
    setAddOpen(true)
  }

  /**
   * One wrapper for every row action. The server writes complete sentences for
   * its refusals — cooldown not elapsed, invitation changed under you, the seat
   * filled while the invitation sat lapsed — so they are shown verbatim on the
   * row rather than flattened into "something went wrong".
   */
  const runRowAction = async (
    invitationId: string,
    fallback: string,
    action: () => Promise<void>,
  ) => {
    setStatusMessage('')
    setRowError(null)
    setBusyInvitationId(invitationId)
    try {
      await action()
    } catch (error) {
      setRowError({
        id: invitationId,
        text: error instanceof Error ? error.message : fallback,
      })
      // The write may have half-landed — `resend` renews the document and then
      // reports that the email did not go out — so re-read rather than trust
      // local state. Best effort: a failed re-read leaves the message standing.
      if (onInvitationsRefreshed && proposalId) {
        try {
          onInvitationsRefreshed(
            await utils.proposal.invitation.list.fetch({ id: proposalId }),
          )
        } catch {
          // keep the original failure on screen
        }
      }
    } finally {
      setBusyInvitationId(null)
    }
  }

  const handleCancelInvitation = (invitation: CoSpeakerInvitationMinimal) =>
    runRowAction(
      invitation._id,
      'Failed to cancel the invitation.',
      async () => {
        await cancelInvitation.mutateAsync({ invitationId: invitation._id })
        onInvitationCanceled?.(invitation._id)
      },
    )

  /** Same token, same expiry, one per invitation per 24 hours. */
  const handleRemind = (invitation: CoSpeakerInvitationMinimal) =>
    runRowAction(invitation._id, 'Failed to send the reminder.', async () => {
      await remindInvitation.mutateAsync({ invitationId: invitation._id })
      // Mirror the claimed cooldown so the action disables without a refetch.
      onInvitationSent?.({
        ...invitation,
        lastRemindedAt: new Date().toISOString(),
      })
      setStatusMessage(`Reminder sent to ${invitation.invitedEmail}.`)
    })

  /** Fresh token and a fresh window on the SAME document; lapsed only. */
  const handleResend = (invitation: CoSpeakerInvitationMinimal) =>
    runRowAction(
      invitation._id,
      'Failed to resend the invitation.',
      async () => {
        const { expiresAt } = await resendInvitation.mutateAsync({
          invitationId: invitation._id,
        })
        onInvitationSent?.({
          ...invitation,
          status: 'pending',
          expiresAt,
          lastRemindedAt: undefined,
        })
        setStatusMessage(`New invitation sent to ${invitation.invitedEmail}.`)
      },
    )

  const confirmRemoveSpeaker = async () => {
    if (!speakerPendingRemoval) return
    // ONE button, two implementations. A speaker the server has must go
    // through the mutation that also cancels their accepted invitation; one
    // added from search a moment ago has no server-side row yet, so calling it
    // would refuse with "not currently a speaker on this proposal" and strand
    // the organizer behind the dirty-close guard.
    const isPersisted =
      !persistedSpeakerIds ||
      persistedSpeakerIds.includes(speakerPendingRemoval._id)
    if (onRemoveSpeaker && isPersisted) {
      setIsRemovingSpeaker(true)
      try {
        await onRemoveSpeaker(speakerPendingRemoval._id)
      } catch (error) {
        setRemoveError(
          error instanceof Error
            ? error.message
            : 'Failed to remove the speaker.',
        )
      } finally {
        setIsRemovingSpeaker(false)
        setSpeakerPendingRemoval(null)
      }
      return
    }
    onSpeakersChange?.(
      speakers.filter((s) => s._id !== speakerPendingRemoval._id),
    )
    setSpeakerPendingRemoval(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm leading-6 font-medium text-gray-900 dark:text-white">
          Speakers
        </h3>
        <p
          className={`text-sm ${
            summary.tone === 'warn'
              ? 'text-amber-700 dark:text-amber-300'
              : 'text-green-700 dark:text-green-300'
          }`}
        >
          {summary.text}
        </p>
      </div>

      <ul className="divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {speakers.length === 0 && shownInvitations.length === 0 && (
          <li className="p-4 text-sm text-gray-600 dark:text-gray-400">
            No speakers yet. The first speaker added becomes the primary.
          </li>
        )}

        {speakers.map((speaker, index) => {
          const isPrimary = index === 0
          const isViewer = speaker._id === currentUserSpeakerId
          const canRemove = allowRemove && !isPrimary && !isViewer
          const canPromote =
            allowPickExisting && !!onSpeakersChange && allowRemove && !isPrimary

          return (
            <li
              key={speaker._id}
              className="p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-4 shrink-0 pt-1 text-xs text-gray-500 tabular-nums dark:text-gray-400">
                  {index + 1}
                </span>
                <SpeakerAvatars speakers={[speaker]} size="sm" maxVisible={1} />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                    {speaker.name}
                    {isPrimary && <Pill>Primary</Pill>}
                    {isViewer && <Pill>You</Pill>}
                  </p>
                  {(speaker.title || speaker.email) && (
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                      {speaker.title || speaker.email}
                    </p>
                  )}
                </div>
              </div>
              {(canRemove || canPromote) && (
                <div className="mt-2 ml-11 flex gap-4 sm:mt-0 sm:ml-0 sm:shrink-0">
                  {canPromote && (
                    <RowAction
                      onClick={() => handleMakePrimary(speaker)}
                      label={`Make ${speaker.name} the primary speaker`}
                    >
                      Make primary
                    </RowAction>
                  )}
                  {canRemove && (
                    <RowAction
                      tone="danger"
                      onClick={() => {
                        setRemoveError('')
                        setSpeakerPendingRemoval(speaker)
                      }}
                      label={`Remove ${speaker.name} from this proposal`}
                    >
                      Remove
                    </RowAction>
                  )}
                </div>
              )}
            </li>
          )
        })}

        {shownInvitations.map(([invitation, state]) => {
          const busy = busyInvitationId === invitation._id
          const cooldownMs = reminderCooldownRemainingMs(
            invitation.lastRemindedAt,
          )
          return (
            <li
              key={invitation._id}
              className="p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="w-4 shrink-0" aria-hidden="true" />
                <InviteePlaceholder />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-gray-900 dark:text-white">
                    {invitation.invitedName || invitation.invitedEmail}
                    {invitationPill(state, invitation)}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {invitation.invitedEmail}
                  </p>
                  {state === 'declined' && invitation.declineReason && (
                    <p className="mt-1 text-xs text-gray-600 italic dark:text-gray-300">
                      &quot;{invitation.declineReason}&quot;
                    </p>
                  )}
                  {rowError?.id === invitation._id && (
                    <p
                      role="alert"
                      className="mt-1 text-xs text-red-700 dark:text-red-300"
                    >
                      {rowError.text}
                    </p>
                  )}
                </div>
              </div>
              {allowRemove && (
                <div className="mt-2 ml-11 flex flex-wrap items-baseline gap-x-4 gap-y-1 sm:mt-0 sm:ml-0 sm:shrink-0 sm:flex-nowrap">
                  {/* Remind on an open invitation, Resend on a lapsed one —
                      never both. The server refuses the wrong one anyway. */}
                  {state === 'pending' &&
                    (cooldownMs > 0 ? (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        Reminded · again in{' '}
                        {Math.ceil(cooldownMs / (60 * 60 * 1000))}h
                      </span>
                    ) : (
                      <RowAction
                        onClick={() => handleRemind(invitation)}
                        disabled={busy}
                        label={`Remind ${invitation.invitedEmail}`}
                      >
                        Remind
                      </RowAction>
                    ))}
                  {state === 'expired' && (
                    <RowAction
                      onClick={() => handleResend(invitation)}
                      disabled={busy}
                      label={`Resend the invitation to ${invitation.invitedEmail}`}
                    >
                      Resend
                    </RowAction>
                  )}
                  {/* Organizers only, and never on a DECLINED row: turning an
                      explicit "no" into a speaker profile overrides the
                      answer. The server refuses it too. */}
                  {allowDirectProfileCreation &&
                    state !== 'declined' &&
                    isClaimableAddress(invitation.invitedEmail) && (
                      <RowAction
                        onClick={() => handleUpgradeInvitation(invitation)}
                        disabled={busy}
                        label={`Create a speaker profile for ${invitation.invitedEmail}`}
                      >
                        Create profile
                      </RowAction>
                    )}
                  <RowAction
                    tone="danger"
                    onClick={() => handleCancelInvitation(invitation)}
                    disabled={busy}
                    label={`Cancel the invitation to ${invitation.invitedEmail}`}
                  >
                    {state === 'pending' ? 'Cancel invitation' : 'Remove'}
                  </RowAction>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {overLimit && (
        <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
          {speakers.length} speakers; the format allows {totalLimit} at
          submission.
        </p>
      )}

      {statusMessage && (
        <p role="status" className="text-sm text-green-700 dark:text-green-300">
          {statusMessage}
        </p>
      )}
      {removeError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {removeError}
        </p>
      )}

      {!addOpen && canAdd && (
        <button
          type="button"
          onClick={() => {
            setStatusMessage('')
            setFormError('')
            setAddOpen(true)
          }}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 sm:w-auto dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
        >
          <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
          Add speaker
        </button>
      )}

      {!addOpen && !canAdd && allowRemove && enforceFormatLimit && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {allowsCoSpeakers(format)
            ? `Limit for this format reached (1 primary + ${coSpeakerLimit} co-speaker${coSpeakerLimit === 1 ? '' : 's'}).`
            : 'Lightning talks have one speaker.'}
        </p>
      )}

      {addOpen && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-600 dark:bg-gray-800">
          <div className="flex items-start justify-between gap-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              {upgradingInvitation
                ? `Create a profile for ${upgradingInvitation.invitedName || upgradingInvitation.invitedEmail}`
                : 'Add speaker'}
            </h4>
            <button
              type="button"
              onClick={closePanel}
              className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              Close
            </button>
          </div>

          {allowPickExisting && !creating && (
            <div className="space-y-2">
              <label htmlFor="speaker-search" className={labelClass}>
                Search by name or email
              </label>
              <input
                id="speaker-search"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setEmailEdit(null)
                  setNameEdit(null)
                }}
                placeholder="Name or email"
                className={inputClass}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Type at least two characters. Existing speakers are matched
                first.
              </p>
              {directoryLoading && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Loading speakers...
                </p>
              )}
              {directoryMatches.length > 0 && (
                <ul className="divide-y divide-gray-200 rounded-md border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-600 dark:bg-gray-700">
                  {directoryMatches.slice(0, 6).map((candidate) => (
                    <li
                      key={candidate._id}
                      className="flex items-center justify-between gap-3 p-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                          {candidate.name}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                          {candidate.email}
                        </p>
                      </div>
                      <RowAction
                        onClick={() => handleAddExisting(candidate)}
                        label={`Add ${candidate.name} to this proposal`}
                      >
                        Add
                      </RowAction>
                    </li>
                  ))}
                </ul>
              )}
              {searchExhausted && (
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  No existing speaker matches &quot;{query.trim()}&quot;.
                </p>
              )}
            </div>
          )}

          {!canCommitNewPerson && (
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {allowPickExisting
                ? 'Save the proposal before inviting someone or creating a profile. Existing speakers can be added now.'
                : 'Save the proposal as a draft before inviting a co-speaker.'}
            </p>
          )}

          {showInviteStep && (
            <div className="space-y-3">
              {allowPickExisting && (
                <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                  Invite by email
                </h5>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="invite-email" className={labelClass}>
                    Email
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmailEdit(e.target.value)}
                    placeholder="their.email@example.com"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label htmlFor="invite-name" className={labelClass}>
                    Name (optional)
                  </label>
                  <input
                    id="invite-name"
                    type="text"
                    value={name}
                    onChange={(e) => setNameEdit(e.target.value)}
                    placeholder="Their name"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  They get a link that is valid for 14 days. When they accept
                  they appear here as confirmed.
                </p>
                <button
                  type="button"
                  onClick={handleSendInvitation}
                  disabled={
                    sendInvitation.isPending || !validateEmail(email.trim())
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-brand-cloud-blue px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-brand-cloud-blue/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
                >
                  {sendInvitation.isPending ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
                      Send invitation
                    </>
                  )}
                </button>
              </div>
              {allowDirectProfileCreation && (
                <button
                  type="button"
                  onClick={() => {
                    setCreating(true)
                    setFormError('')
                  }}
                  className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  Cannot reach them? Create the profile yourself.
                </button>
              )}
            </div>
          )}

          {showCreateStep && (
            <div className="space-y-3">
              {/* The panel heading already names the person when upgrading,
                  so a second heading would only repeat it. */}
              {!upgradingInvitation && (
                <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                  Create profile without their involvement
                </h5>
              )}
              {upgradingInvitation && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {upgradingInvitation.invitedEmail} was invited and has not
                  answered. The invitation is canceled.
                </p>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label htmlFor="create-name" className={labelClass}>
                    Name
                  </label>
                  <input
                    id="create-name"
                    type="text"
                    value={name}
                    onChange={(e) => setNameEdit(e.target.value)}
                    placeholder="Their name"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
                <div>
                  <label htmlFor="create-email" className={labelClass}>
                    {upgradingInvitation ? 'Email' : 'Email (optional)'}
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmailEdit(e.target.value)}
                    placeholder="name@example.com"
                    // The address is the invitation's. Editing it here would
                    // create a profile for somebody else and leave the
                    // invitation standing; the server refuses that too.
                    readOnly={!!upgradingInvitation}
                    // The `read-only:` variant outranks the base `bg-white`;
                    // a flat `bg-gray-100` beside it does not and silently
                    // loses.
                    className={`mt-1 ${inputClass} read-only:bg-gray-100 dark:read-only:bg-white/10`}
                  />
                </div>
                <div>
                  <label htmlFor="create-title" className={labelClass}>
                    Title (optional)
                  </label>
                  <input
                    id="create-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Principal Engineer, Acme"
                    className={`mt-1 ${inputClass}`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  The profile is created now and {name.trim() || 'the person'}{' '}
                  is listed as a speaker at once. There is no acceptance step.
                  If they later sign in with this email, the profile becomes
                  theirs.{' '}
                  {upgradingInvitation
                    ? 'They are told by email that they are on the talk.'
                    : 'Without an email, nobody is told.'}
                </p>
                <button
                  type="button"
                  onClick={handleCreateProfile}
                  disabled={createProfile.isPending || !name.trim()}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white shadow-xs hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createProfile.isPending ? (
                    <>
                      <LoadingSpinner size="sm" color="white" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlusIcon className="h-4 w-4" aria-hidden="true" />
                      Create profile
                    </>
                  )}
                </button>
              </div>
              <button
                type="button"
                onClick={() =>
                  upgradingInvitation ? closePanel() : setCreating(false)
                }
                className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {upgradingInvitation
                  ? 'Leave the invitation as it is.'
                  : 'Add an existing speaker instead.'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Outside the panel: a failed Remind, Resend or Cancel happens with the
          panel closed, and an error nobody can see is no error at all. */}
      {formError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {formError}
        </p>
      )}

      {speakerPendingRemoval && (
        <ConfirmationModal
          isOpen={true}
          onClose={() => setSpeakerPendingRemoval(null)}
          onConfirm={confirmRemoveSpeaker}
          title="Remove speaker?"
          message={
            allowPickExisting
              ? `Remove ${speakerPendingRemoval.name} from this proposal? You can add them again from Add speaker.`
              : `Remove ${speakerPendingRemoval.name} from this proposal? They will need a new invitation to rejoin.`
          }
          confirmButtonText="Remove"
          variant="danger"
          isLoading={isRemovingSpeaker}
        />
      )}
    </div>
  )
}
