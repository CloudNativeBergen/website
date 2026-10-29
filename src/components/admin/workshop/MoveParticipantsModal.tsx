'use client'

import { useEffect, useState } from 'react'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { StatusBadge } from '@/components/StatusBadge'
import type { MoveCandidate } from '@/lib/workshop/move'

interface MoveParticipantsModalProps {
  isOpen: boolean
  onClose: () => void
  workshopTitle: string
  /** The listed workshops a sign-up can be moved to. */
  targets: { _id: string; title: string }[]
  targetId: string
  onTargetChange: (targetId: string) => void
  /** For the chosen target; undefined while read. */
  candidates?: MoveCandidate[]
  seatsFree?: number
  onSubmit: (signupIds: string[]) => void
  isSubmitting?: boolean
}

/**
 * "Move participants" of a canceled or withdrawn workshop to a listed one.
 * Those already signed up for the target cannot be picked; a time clash with
 * another of their workshops is shown, not refused.
 */
export function MoveParticipantsModal({
  isOpen,
  onClose,
  workshopTitle,
  targets,
  targetId,
  onTargetChange,
  candidates,
  seatsFree,
  onSubmit,
  isSubmitting = false,
}: MoveParticipantsModalProps) {
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Everyone movable is picked for each new target
    setPicked(
      new Set(
        (candidates ?? []).filter((c) => !c.inTarget).map((c) => c.signupId),
      ),
    )
  }, [candidates])

  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const count = picked.size
  const waitlisted =
    seatsFree === undefined ? 0 : Math.max(0, count - seatsFree)

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title="Move participants"
      subtitle={workshopTitle}
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="move-target"
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Move to
          </label>
          <select
            id="move-target"
            value={targetId}
            onChange={(e) => onTargetChange(e.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          >
            <option value="">Choose a workshop</option>
            {targets.map((t) => (
              <option key={t._id} value={t._id}>
                {t.title}
              </option>
            ))}
          </select>
          {targetId && seatsFree !== undefined && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {seatsFree} seat{seatsFree === 1 ? '' : 's'} free. Those beyond go
              on its waitlist.
            </p>
          )}
        </div>

        {targetId && candidates && (
          <ul className="max-h-80 divide-y divide-gray-200 overflow-y-auto rounded-md border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {candidates.map((c) => (
              <li key={c.signupId} className="flex items-start gap-3 p-3">
                <input
                  type="checkbox"
                  id={`move-${c.signupId}`}
                  checked={picked.has(c.signupId)}
                  disabled={c.inTarget}
                  onChange={() => toggle(c.signupId)}
                  className="mt-1"
                />
                <label
                  htmlFor={`move-${c.signupId}`}
                  className="flex-1 text-sm text-gray-900 dark:text-white"
                >
                  {c.userName}{' '}
                  <span className="text-gray-500 dark:text-gray-400">
                    {c.userEmail}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    <StatusBadge
                      label={
                        c.status === 'confirmed' ? 'Confirmed' : 'Waitlist'
                      }
                      color={c.status === 'confirmed' ? 'green' : 'blue'}
                    />
                    {c.inTarget && (
                      <StatusBadge label="Already signed up" color="gray" />
                    )}
                    {c.conflict && (
                      <StatusBadge
                        label={`Clashes with ${c.conflict}`}
                        color="yellow"
                      />
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {count > 0 && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Each person moved gets an email
            {waitlisted > 0 ? `; ${waitlisted} will be on the waitlist.` : '.'}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <AdminButton
            variant="secondary"
            size="md"
            onClick={onClose}
            disabled={isSubmitting}
            className="min-h-11"
          >
            Cancel
          </AdminButton>
          <AdminButton
            color="brand"
            size="md"
            onClick={() => onSubmit([...picked])}
            disabled={isSubmitting || count === 0}
            className="min-h-11"
          >
            {isSubmitting
              ? 'Moving...'
              : `Move ${count} ${count === 1 ? 'person' : 'people'}`}
          </AdminButton>
        </div>
      </div>
    </ModalShell>
  )
}
