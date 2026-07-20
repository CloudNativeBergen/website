'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import {
  type TeamFormRow,
  TEAM_EMAIL_IDENTITY_OPTIONS,
  TEMP_KEY_PREFIX,
  slugifyTeamKey,
  validateTeams,
  buildTeamsPayload,
} from './editConferenceRefs'
import type { TeamEmailIdentity } from '@/lib/teams/types'

/**
 * SE-2 — the organizer Teams editor island.
 *
 * Teams are a SOFT LENS over the organizer set (routing / mail defaults), NEVER
 * an access boundary. Each team has a kebab-case `key` (auto-slugged from the
 * title, editable, unique), a title, ≥1 members drawn ONLY from the current
 * organizers, an optional Slack channel, and an optional email identity. The
 * member sub-picker is limited to organizers; the server ENFORCES that subset.
 */
export interface TeamStored {
  _key?: string
  key: string
  title: string
  /** Member speaker ids. */
  members: string[]
  slackChannel?: string
  emailIdentity?: TeamEmailIdentity[]
}

export interface TeamsEditorProps {
  teams: TeamStored[]
  /** The conference's current organizers (the only eligible team members). */
  organizers: { _id: string; name: string }[]
  defaultOpen?: boolean
}

let tempCounter = 0
const nextTempKey = () => `${TEMP_KEY_PREFIX}${++tempCounter}`

function toFormRows(teams: TeamStored[]): TeamFormRow[] {
  return teams.map((t) => ({
    _key: t._key ?? nextTempKey(),
    key: t.key ?? '',
    title: t.title ?? '',
    members: Array.isArray(t.members) ? t.members : [],
    slackChannel: t.slackChannel ?? '',
    emailIdentity: (t.emailIdentity?.[0] ?? '') as TeamFormRow['emailIdentity'],
  }))
}

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'

export function TeamsEditor({
  teams,
  organizers,
  defaultOpen = false,
}: TeamsEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [rows, setRows] = useState<TeamFormRow[]>(() => toFormRows(teams))
  // Rows whose key the user typed by hand — those stop auto-slugging from title.
  const [manualKeys, setManualKeys] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)

  const organizerIds = organizers.map((o) => o._id)

  const baseline = JSON.stringify(toFormRows(teams).map(stripKey))
  const isDirty = JSON.stringify(rows.map(stripKey)) !== baseline

  const mutation = api.conference.updateTeams.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Teams updated',
        message: 'Organizer teams saved.',
      })
      setIsOpen(false)
    },
    onError: (err) => {
      setSubmitError(err.message || 'Failed to save teams.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: err.message || 'Failed to save teams.',
      })
    },
  })

  const reset = () => {
    setRows(toFormRows(teams))
    setManualKeys(new Set())
    setErrors({})
    setSubmitError(null)
  }
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const patchRow = (index: number, patch: Partial<TeamFormRow>) =>
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    )

  const setTitle = (index: number, title: string) => {
    const row = rows[index]
    const auto = !manualKeys.has(row._key)
    patchRow(index, {
      title,
      ...(auto ? { key: slugifyTeamKey(title) } : {}),
    })
  }

  const setKey = (index: number, key: string) => {
    setManualKeys((prev) => new Set(prev).add(rows[index]._key))
    patchRow(index, { key })
  }

  const toggleMember = (index: number, id: string) => {
    const row = rows[index]
    const members = row.members.includes(id)
      ? row.members.filter((m) => m !== id)
      : [...row.members, id]
    patchRow(index, { members })
  }

  const addTeam = () =>
    setRows((prev) => [
      ...prev,
      {
        _key: nextTempKey(),
        key: '',
        title: '',
        members: [],
        slackChannel: '',
        emailIdentity: '',
      },
    ])
  const removeTeam = (index: number) =>
    setRows((prev) => prev.filter((_, i) => i !== index))

  const handleSave = () => {
    setSubmitError(null)
    const errs = validateTeams(rows, organizerIds)
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    mutation.mutate({ teams: buildTeamsPayload(rows) })
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Teams"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="lg"
        title="Edit Teams"
        subtitle="Sub-teams of organizers for routing notifications and mail"
        icon={<PencilSquareIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty && !mutation.isPending}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            handleSave()
          }}
          className="space-y-4"
        >
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Teams are a soft lens for routing — they never change who can access
            the admin. Members must be current organizers.
          </p>

          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li
                key={row._key}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
                    Team {index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeTeam(index)}
                    aria-label={`Remove team ${index + 1}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <div>
                    <label
                      htmlFor={`team-${index}-title`}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      Title <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`team-${index}-title`}
                      type="text"
                      value={row.title}
                      onChange={(e) => setTitle(index, e.target.value)}
                      aria-invalid={errors[`${index}.title`] ? true : undefined}
                      className={inputClass}
                    />
                    {errors[`${index}.title`] ? (
                      <p
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {errors[`${index}.title`]}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label
                      htmlFor={`team-${index}-key`}
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      Key <span className="text-red-500">*</span>
                    </label>
                    <input
                      id={`team-${index}-key`}
                      type="text"
                      value={row.key}
                      onChange={(e) => setKey(index, e.target.value)}
                      aria-invalid={errors[`${index}.key`] ? true : undefined}
                      className={`${inputClass} font-mono`}
                    />
                    {errors[`${index}.key`] ? (
                      <p
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {errors[`${index}.key`]}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Lowercase kebab-case, unique. Well-known: cfp, sponsors,
                        volunteers, workshops.
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Members <span className="text-red-500">*</span>
                    </span>
                    <div className="max-h-40 space-y-1 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
                      {organizers.length === 0 ? (
                        <p className="px-1 text-sm text-gray-500 dark:text-gray-400">
                          No organizers to choose from.
                        </p>
                      ) : (
                        organizers.map((org) => {
                          const mid = `team-${index}-member-${org._id}`
                          return (
                            <label
                              key={org._id}
                              htmlFor={mid}
                              className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md px-1 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800"
                            >
                              <input
                                id={mid}
                                type="checkbox"
                                checked={row.members.includes(org._id)}
                                onChange={() => toggleMember(index, org._id)}
                                className="h-5 w-5 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue"
                              />
                              <span className="truncate">{org.name}</span>
                            </label>
                          )
                        })
                      )}
                    </div>
                    {errors[`${index}.members`] ? (
                      <p
                        role="alert"
                        className="mt-1 text-sm text-red-600 dark:text-red-400"
                      >
                        {errors[`${index}.members`]}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`team-${index}-slack`}
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        Slack channel
                      </label>
                      <input
                        id={`team-${index}-slack`}
                        type="text"
                        value={row.slackChannel}
                        onChange={(e) =>
                          patchRow(index, { slackChannel: e.target.value })
                        }
                        placeholder="#team-cfp"
                        className={inputClass}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor={`team-${index}-email`}
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        Email identity
                      </label>
                      <select
                        id={`team-${index}-email`}
                        value={row.emailIdentity}
                        onChange={(e) =>
                          patchRow(index, {
                            emailIdentity: e.target
                              .value as TeamFormRow['emailIdentity'],
                          })
                        }
                        className={inputClass}
                      >
                        <option value="">— Conference default —</option>
                        {TEAM_EMAIL_IDENTITY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addTeam}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
          >
            <PlusIcon className="h-5 w-5" />
            Add team
          </button>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={mutation.isPending}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={mutation.isPending || !isDirty}
              className="min-h-[44px]"
            >
              {mutation.isPending ? 'Saving…' : 'Save teams'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

/** Strip the client-only `_key` so dirty tracking follows content, not identity. */
function stripKey(row: TeamFormRow): Omit<TeamFormRow, '_key'> {
  const { _key: _drop, ...rest } = row
  void _drop
  return rest
}
