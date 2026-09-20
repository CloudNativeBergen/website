'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useNotification } from '@/components/admin/NotificationProvider'
import {
  TASK_KINDS,
  TASK_KIND_LABELS,
  MARKETING_CHANNELS,
  MARKETING_CHANNEL_LABELS,
  type TaskKind,
  type MarketingChannel,
} from '@/lib/marketing/types'
import { PlusIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import {
  SpeakerCombobox,
  type SpeakerOption,
} from '@/components/messaging/SpeakerCombobox'
import { OWN_PAGES, sitePathIssue } from '@/lib/marketing/pages'
import {
  formatConferenceDateLong,
  osloLocalInputToIso,
  osloTodayDateString,
} from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { MilestoneAnchorFields } from '../anchor'
import type { ResolvedMilestones } from '@/lib/marketing/milestones'
import {
  anchoredSlot,
  clampOffset,
  describeAnchor,
  initialAnchor,
  suggestAnchor,
} from './when-model'

const inputClass =
  'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200'

export function CreateTask({
  campaignId,
  milestones,
}: {
  campaignId: string
  /** Null when the conference dates cannot anchor: bare dates only. */
  milestones: ResolvedMilestones | null
}) {
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  return (
    <>
      <AdminButton
        color="blue"
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="mr-1 size-4" /> Add task
      </AdminButton>
      {/* CLOSING IS IGNORED WHILE A CREATION IS IN FLIGHT.
          The form is unmounted when the modal closes, so an organizer who
          submitted and then dismissed with Escape, the backdrop or the X got a
          fresh form on reopening — with no memory of the request still running.
          Submitting again created the Task, its post and its variant a second
          time, and the first create is atomic so neither is a partial to clean
          up. The modal stays put until the mutation settles. */}
      <ModalShell
        isOpen={open}
        onClose={() => {
          if (!creating) setOpen(false)
        }}
        title="Add task"
        size="lg"
      >
        {open && (
          <CreateForm
            campaignId={campaignId}
            milestones={milestones}
            onCreatingChange={setCreating}
          />
        )}
      </ModalShell>
    </>
  )
}

function CreateForm({
  campaignId,
  milestones,
  onCreatingChange,
}: {
  campaignId: string
  milestones: ResolvedMilestones | null
  /** Reported up so the modal can refuse to close mid-flight. */
  onCreatingChange: (creating: boolean) => void
}) {
  const router = useRouter()
  const utils = api.useUtils()
  const [kind, setKind] = useState<TaskKind>('publishing')
  const [channel, setChannel] = useState<MarketingChannel>('bluesky')
  const [alsoCreateSibling, setAlsoCreateSibling] = useState(false)
  const [instructions, setInstructions] = useState('')
  const { showNotification } = useNotification()
  const [speaker, setSpeaker] = useState<SpeakerOption | null>(null)
  const [sponsorId, setSponsorId] = useState('')
  const [title, setTitle] = useState('')
  const [targetPage, setTargetPage] = useState('/tickets')
  const [due, setDue] = useState('')
  // Follows a Milestone by default: such a Task moves with the edition, and
  // is what a saved Template can carry (§2.2).
  const [anchor, setAnchor] = useState(() =>
    milestones ? initialAnchor(osloTodayDateString(), milestones) : null,
  )
  const [followsMilestone, setFollowsMilestone] = useState(anchor !== null)
  const [created, setCreated] = useState(false)
  const sponsors = api.sponsor.crm.list.useQuery(
    {},
    { enabled: kind === 'sponsorOutreach' },
  )
  const create = api.marketing.task.create.useMutation({
    onSuccess: ({ taskId, ceilingWarnings }) => {
      if (ceilingWarnings.length)
        showNotification({
          type: 'warning',
          title: 'Task created — Channel ceiling exceeded',
          message: ceilingWarnings.join(' · '),
        })
      setCreated(true)
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.campaign.get.invalidate({ campaignId })
      // The Report derives plan-health totals, Channel aggregates and Task
      // rankings from the Task list, so a report already loaded when the Task
      // was created served its cached pre-creation figures for the rest of the
      // shared 60-second stale window.
      void utils.marketing.report.invalidate()
      // A publishing Task creates a draft post and variant in the same
      // transaction, so the Social Posts list is stale too — it polls every 30
      // seconds, but a return within the shared stale window showed a list
      // missing the draft that was just made. Manual post creation and Task
      // deletion already invalidate it.
      void utils.social.listVariants.invalidate()
      router.push(`/admin/marketing/tasks/${encodeURIComponent(taskId)}`)
    },
    // Released on FAILURE only. A success navigates away and keeps the modal
    // shut in the meantime, so lifting the block there would let a stray close
    // race the navigation.
    onError: () => onCreatingChange(false),
  })
  const outreach = kind === 'speakerOutreach' || kind === 'sponsorOutreach'
  const publishing = kind === 'publishing'
  const subjectId = kind === 'speakerOutreach' ? speaker?._id : sponsorId
  const needsPage = outreach || publishing
  const dueAt = osloLocalInputToIso(due)
  const pathIssue = needsPage ? sitePathIssue(targetPage) : null
  const anchored = followsMilestone && milestones ? anchor : null
  const slot =
    anchored && milestones
      ? anchoredSlot(anchored, milestones, kind, channel)
      : null
  const suggestion =
    !followsMilestone && milestones ? suggestAnchor(due, milestones) : null
  const when = anchored ? { anchor: anchored } : dueAt ? { dueAt } : null
  const busy = create.isPending || created

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (
          busy ||
          (outreach && !subjectId) ||
          !when ||
          pathIssue ||
          !title.trim()
        )
          return
        onCreatingChange(true)
        create.mutate({
          campaignId,
          kind,
          title,
          ...when,
          ...(outreach ? { subjectId } : {}),
          ...(needsPage ? { targetPage } : {}),
          ...(publishing ? { channel, alsoCreateSibling } : {}),
          ...(instructions.trim() ? { instructions } : {}),
        })
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <div>
          <label htmlFor="create-task-kind" className={labelClass}>
            Kind
          </label>
          <select
            id="create-task-kind"
            className={inputClass}
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as TaskKind)
              setAlsoCreateSibling(false)
            }}
          >
            {TASK_KINDS.map((value) => (
              <option key={value} value={value}>
                {TASK_KIND_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        {outreach && (
          <div>
            <label htmlFor="create-task-recipient" className={labelClass}>
              Recipient
            </label>
            {kind === 'speakerOutreach' ? (
              <SpeakerCombobox
                id="create-task-recipient"
                value={speaker}
                onChange={setSpeaker}
                disabled={busy}
              />
            ) : (
              <>
                <select
                  id="create-task-recipient"
                  className={inputClass}
                  value={sponsorId}
                  onChange={(event) => setSponsorId(event.target.value)}
                  required
                >
                  <option value="">
                    {sponsors.isLoading
                      ? 'Loading sponsors…'
                      : 'Choose a sponsor'}
                  </option>
                  {(sponsors.data ?? []).map((sfc) => (
                    <option key={sfc._id} value={sfc.sponsor._id}>
                      {sfc.sponsor.name}
                    </option>
                  ))}
                </select>
                {sponsors.error && (
                  <p role="alert" className="mt-1 text-sm text-red-700">
                    {sponsors.error.message}
                  </p>
                )}
                {sponsors.data?.length === 0 && (
                  <p className="mt-1 text-sm text-gray-500">
                    Add a sponsor to this conference before creating outreach.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {publishing && (
          <div className="space-y-3">
            <label className={labelClass}>
              Channel
              <select
                className={inputClass}
                value={channel}
                onChange={(event) =>
                  setChannel(event.target.value as MarketingChannel)
                }
              >
                {MARKETING_CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {MARKETING_CHANNEL_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
              <input
                type="checkbox"
                checked={alsoCreateSibling}
                onChange={(event) => setAlsoCreateSibling(event.target.checked)}
              />
              Also create a sibling for{' '}
              {channel === 'bluesky' ? 'LinkedIn' : 'Bluesky'}
            </label>
          </div>
        )}
        <div>
          <label htmlFor="create-task-title" className={labelClass}>
            Task title
          </label>
          <input
            id="create-task-title"
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </div>
        {needsPage && (
          <div>
            <label htmlFor="create-task-destination" className={labelClass}>
              Target page
            </label>
            <input
              id="create-task-destination"
              className={inputClass}
              list="create-task-pages"
              value={targetPage}
              onChange={(event) => setTargetPage(event.target.value)}
              maxLength={500}
              required
              aria-invalid={Boolean(pathIssue)}
            />
            <datalist id="create-task-pages">
              {OWN_PAGES.map((page) => (
                <option key={page.key} value={page.path}>
                  {page.label}
                </option>
              ))}
            </datalist>
            {pathIssue && (
              <p role="alert" className="mt-1 text-sm text-red-700">
                {pathIssue}
              </p>
            )}
          </div>
        )}
        <label className={labelClass}>
          Instructions
          <textarea
            className={inputClass}
            rows={3}
            maxLength={5000}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        <fieldset className="space-y-3">
          <legend className={labelClass}>When</legend>
          {milestones && (
            <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-200">
              {(
                [
                  [true, 'Follow a Milestone'],
                  [false, 'Fixed date'],
                ] as const
              ).map(([value, label]) => (
                <label key={label} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="create-task-when"
                    checked={followsMilestone === value}
                    onChange={() => {
                      // Carry the typed date across, so switching is not a reset.
                      if (value && suggestion) setAnchor(suggestion)
                      setFollowsMilestone(value)
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
          {anchored && slot ? (
            <>
              <div className="grid gap-3 text-gray-700 sm:grid-cols-2 dark:text-gray-200">
                <MilestoneAnchorFields
                  milestone={anchored.milestone}
                  offsetDays={anchored.offsetDays}
                  onMilestoneChange={(milestone) =>
                    setAnchor({ ...anchored, milestone })
                  }
                  onOffsetDaysChange={(offsetDays) =>
                    setAnchor({
                      ...anchored,
                      offsetDays: clampOffset(offsetDays),
                    })
                  }
                />
              </div>
              <p
                aria-live="polite"
                className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-800/60 dark:text-gray-200"
              >
                <span className="font-medium">
                  {formatConferenceDateLong(slot.date)} at {slot.time}
                </span>{' '}
                (Oslo). Moves with the Milestone if the conference dates change.
                {slot.provisional && (
                  <span className="mt-1 block text-amber-700 dark:text-amber-300">
                    This Milestone has no date yet, so the day is provisional.
                  </span>
                )}
              </p>
            </>
          ) : (
            <div>
              <label htmlFor="create-task-due" className="sr-only">
                Due date and time (Oslo)
              </label>
              <input
                id="create-task-due"
                type="datetime-local"
                className={inputClass}
                value={due}
                onChange={(event) => setDue(event.target.value)}
                required
              />
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Oslo time. A fixed date stays put when the conference dates
                move.
              </p>
              {suggestion && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700 dark:text-gray-200">
                  That is {describeAnchor(suggestion)}.
                  <button
                    type="button"
                    className="font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-200"
                    onClick={() => {
                      setAnchor(suggestion)
                      setFollowsMilestone(true)
                    }}
                  >
                    Follow that Milestone instead
                  </button>
                </p>
              )}
            </div>
          )}
        </fieldset>
      </fieldset>
      {create.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {create.error.message}
        </p>
      )}
      {outreach && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Review and edit the prefilled message in the task before sending.
        </p>
      )}
      <AdminButton
        color="blue"
        size="md"
        type="submit"
        disabled={
          busy ||
          (outreach && !subjectId) ||
          !when ||
          Boolean(pathIssue) ||
          !title.trim()
        }
      >
        {busy ? 'Creating…' : 'Create task'}
      </AdminButton>
    </form>
  )
}
