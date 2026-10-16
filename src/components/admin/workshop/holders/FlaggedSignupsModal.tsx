'use client'

import { useState } from 'react'
import { FlagIcon, TrashIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { DataTable, type Column } from '@/components/DataTable'
import { StatusBadge } from '@/components/StatusBadge'
import type { FlaggedPerson, HolderSignup } from '@/lib/workshop/holders'
import { SignupQuestions, type SignupQuestionTarget } from '../SignupQuestions'

const nameOf = (person: FlaggedPerson) => person.name || person.email || '—'

/**
 * The people who signed up without a ticket that grants workshop access
 * (#1333, spec §4), with the actions the sign-up list has: "Move to waitlist"
 * on a confirmed sign-up and "Delete participant". Nothing here happened
 * automatically, and nothing will: the organizer decides.
 */
export function FlaggedSignupsModal({
  isOpen,
  onClose,
  people,
  onMoveToWaitlist,
  onDeleteSignup,
  isMoving = false,
  isDeleting = false,
}: {
  isOpen: boolean
  onClose: () => void
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
    userName: signup.userName?.trim() || nameOf(person),
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
        <ul className="space-y-1">
          {person.signups.map((signup) => (
            <li
              key={signup._id}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span className="text-sm text-gray-900 dark:text-gray-200">
                {signup.workshop?.title || 'Unknown workshop'}
              </span>
              <StatusBadge
                label={signup.status === 'confirmed' ? 'Confirmed' : 'Waitlist'}
                color={signup.status === 'confirmed' ? 'green' : 'blue'}
              />
              <span className="ml-auto flex items-center gap-1">
                {signup.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => setMoveTarget(target(person, signup))}
                    disabled={busy}
                    className="min-h-11 px-2 text-sm text-blue-600 hover:text-blue-900 disabled:cursor-not-allowed disabled:opacity-50 dark:text-blue-400 dark:hover:text-blue-300"
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
      size="4xl"
      title="Flagged sign-ups"
      subtitle="Signed up without a ticket that grants workshop access. Nothing is cancelled automatically."
      icon={<FlagIcon className="size-6 text-red-600 dark:text-red-400" />}
    >
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
