'use client'

import { useState } from 'react'
import { FlagIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import type { FlaggedPerson, HolderSignup } from '@/lib/workshop/holders'
import { SignupQuestions, type SignupQuestionTarget } from '../SignupQuestions'

const nameOf = (person: FlaggedPerson) =>
  person.name || person.email || 'No name'

/**
 * The people who signed up without a ticket that grants workshop access
 * (#1333, spec §4), with the actions the sign-up list has: "Move to waitlist"
 * on a confirmed sign-up and "Delete participant". Nothing here happened
 * automatically, and nothing will: the organizer decides.
 */
export function FlaggedSignupsModal({
  isOpen,
  onClose,
  afterLeave,
  people,
  onMoveToWaitlist,
  onDeleteSignup,
  isMoving = false,
  isDeleting = false,
}: {
  isOpen: boolean
  onClose: () => void
  /** Runs once the list has closed and let go of focus (see `ModalShell`). */
  afterLeave?: () => void
  people: FlaggedPerson[]
  onMoveToWaitlist: (signupId: string, userName: string) => void
  onDeleteSignup: (signupId: string, userName: string) => void
  isMoving?: boolean
  isDeleting?: boolean
}) {
  const [moveTarget, setMoveTarget] = useState<SignupQuestionTarget | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<SignupQuestionTarget | null>(
    null,
  )
  const busy = isMoving || isDeleting

  const target = (person: FlaggedPerson, signup: HolderSignup) => ({
    signupId: signup._id,
    // Said in the question and the notice: never a placeholder.
    userName:
      signup.userName?.trim() || person.name || person.email || 'this person',
    workshopTitle: signup.workshop?.title || 'this workshop',
  })

  const columns: Column<FlaggedPerson>[] = [
    {
      key: 'name',
      header: 'Name',
      primary: true,
      render: (person) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {nameOf(person)}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (person) => (
        <span className="text-sm break-all text-gray-600 dark:text-gray-400">
          {person.email || 'No email address'}
        </span>
      ),
    },
    {
      key: 'workshops',
      header: 'Workshops',
      render: (person) => (
        // One shape per sign-up, at every width: the workshop, then its
        // status with the actions on it. Left-aligned, also in a phone card,
        // where the cell would otherwise sit at the right edge.
        <ul className="w-full min-w-0 divide-y divide-gray-100 text-left sm:min-w-64 dark:divide-gray-800">
          {person.signups.map((signup) => (
            <li key={signup._id} className="py-1 first:pt-0 last:pb-0">
              <span className="block text-sm text-gray-900 dark:text-gray-200">
                {signup.workshop?.title || 'Unknown workshop'}
              </span>
              <span className="flex flex-wrap items-center justify-between gap-x-2">
                <StatusBadge
                  label={
                    signup.status === 'confirmed' ? 'Confirmed' : 'Waitlist'
                  }
                  color={signup.status === 'confirmed' ? 'green' : 'blue'}
                />
                <span className="ml-auto flex items-center gap-1">
                  {signup.status === 'confirmed' && (
                    <button
                      type="button"
                      onClick={() => setMoveTarget(target(person, signup))}
                      disabled={busy}
                      className="min-h-11 px-2 text-sm whitespace-nowrap text-blue-600 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Move to waitlist
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(target(person, signup))}
                    disabled={busy}
                    title="Delete participant"
                    aria-label={`Delete ${nameOf(person)}'s signup for ${signup.workshop?.title || 'this workshop'}`}
                    className="flex size-11 items-center justify-center rounded-md text-gray-600 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                  >
                    <TrashIcon className="size-4" />
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      ),
    },
  ]

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      afterLeave={afterLeave}
      size="4xl"
      title="Flagged sign-ups"
      icon={<FlagIcon className="size-6 text-red-600 dark:text-red-400" />}
    >
      {/* In the body, not the header's subtitle: a phone cuts that to one
          line, and the second sentence is the one that matters. */}
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        These people signed up without a ticket that grants workshop access.
        Nothing is cancelled automatically: move or delete a sign-up here if it
        should not stand.
      </p>
      <DataTable<FlaggedPerson>
        data={people}
        columns={columns}
        keyExtractor={(person) => person.email || person.signups[0]._id}
        emptyState={{ title: 'Nobody is flagged' }}
      />

      <SignupQuestions
        moveTarget={moveTarget}
        deleteTarget={deleteTarget}
        onCloseMove={() => setMoveTarget(null)}
        onCloseDelete={() => setDeleteTarget(null)}
        onMoveToWaitlist={onMoveToWaitlist}
        onDeleteSignup={onDeleteSignup}
        isMoving={isMoving}
        isDeleting={isDeleting}
      />
    </ModalShell>
  )
}
