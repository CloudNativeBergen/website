'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { countOf, missingBuiltins, type BuiltinOffer } from '../recipes'
import { CampaignEditor } from './CampaignEditor'

type Mode = 'builtin' | 'own'

/** The two ways to add a Campaign; hidden when there is no built-in left. */
function ModeSwitch({
  mode,
  onChange,
  disabled = false,
}: {
  mode: Mode
  onChange: (mode: Mode) => void
  disabled?: boolean
}) {
  return (
    <div
      role="group"
      aria-label="How to add a Campaign"
      className="mt-3 inline-flex rounded-md border border-gray-300 p-0.5 dark:border-gray-600"
    >
      {(
        [
          ['builtin', 'Built-in'],
          ['own', 'Your own'],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          disabled={disabled}
          onClick={() => onChange(value)}
          className={
            mode === value
              ? 'rounded bg-brand-cloud-blue px-3 py-1 text-sm font-medium text-white disabled:opacity-50'
              : 'rounded px-3 py-1 text-sm font-medium text-gray-700 disabled:opacity-50 dark:text-gray-200'
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function BuiltinList({
  offers,
  addingKey,
  error,
  onAdd,
}: {
  offers: BuiltinOffer[]
  addingKey: string | null
  error?: string
  onAdd: (key: string) => void
}) {
  return (
    <>
      <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
        A built-in Campaign arrives fully formed — its Tasks, its copy and its
        Recipes — and is editable like any other.
      </p>
      <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
        {offers.map((offer) => (
          <li
            key={offer.key}
            className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
          >
            <div className="min-w-0">
              <p className="font-medium text-gray-900 dark:text-white">
                {offer.title}
                {offer.optional && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    Optional
                  </span>
                )}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {offer.window}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {countOf(offer.tasks, 'Task')}
                {offer.recipes.length > 0 &&
                  `, plus what its Recipes create: ${offer.recipes.join(', ')}`}
              </p>
            </div>
            <div className="flex sm:shrink-0">
              <AdminButton
                variant="secondary"
                disabled={!!addingKey}
                onClick={() => onAdd(offer.key)}
                aria-label={`Add ${offer.title}`}
              >
                {addingKey === offer.key ? 'Adding…' : 'Add'}
              </AdminButton>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
    </>
  )
}

/**
 * "Add Campaign": a built-in Campaign the plan does not have yet (Templates
 * spec §4.2), or one built by hand. The hand-built side is the existing
 * `CampaignEditor` with no id, so the create path has one implementation.
 */
export function AddCampaignDialog({
  campaignKeys,
  onClose,
}: {
  /** The plan's Campaign keys — what a built-in is matched against. */
  campaignKeys: readonly string[]
  onClose: () => void
}) {
  const offers = missingBuiltins(campaignKeys)
  const [mode, setMode] = useState<Mode>(offers.length ? 'builtin' : 'own')
  const [addingKey, setAddingKey] = useState<string | null>(null)
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const add = api.marketing.campaign.addBuiltin.useMutation({
    onSuccess: ({ tasks }) => {
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.campaign.invalidate()
      void utils.marketing.report.invalidate()
      // The Campaign arrives with draft posts: the Social Posts list is stale.
      void utils.social.listVariants.invalidate()
      showNotification({
        type: 'success',
        title: 'Campaign added',
        message: `${countOf(tasks, 'Task')} created.`,
      })
      onClose()
    },
    onError: () => setAddingKey(null),
  })
  const control = offers.length > 0 && (
    <ModeSwitch mode={mode} onChange={setMode} disabled={add.isPending} />
  )
  if (mode === 'own')
    return <CampaignEditor header={control} onClose={onClose} />
  return (
    <ModalShell isOpen onClose={add.isPending ? () => {} : onClose} size="lg">
      <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
        Add Campaign
      </DialogTitle>
      {control}
      <BuiltinList
        offers={offers}
        addingKey={addingKey}
        error={add.error?.message}
        onAdd={(key) => {
          setAddingKey(key)
          add.mutate({ key })
        }}
      />
      <div className="mt-6 flex justify-end">
        <AdminButton
          variant="secondary"
          disabled={add.isPending}
          onClick={onClose}
        >
          Cancel
        </AdminButton>
      </div>
    </ModalShell>
  )
}
