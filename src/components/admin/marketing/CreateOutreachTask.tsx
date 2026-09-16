'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusIcon } from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import {
  SpeakerCombobox,
  type SpeakerOption,
} from '@/components/messaging/SpeakerCombobox'
import { OWN_PAGES, sitePathIssue } from '@/lib/marketing/pages'
import { osloLocalInputToIso } from '@/lib/time'
import { api } from '@/lib/trpc/client'

const inputClass =
  'mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-200'

export function CreateOutreachTask({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <AdminButton
        color="blue"
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
      >
        <PlusIcon className="mr-1 size-4" /> Add outreach task
      </AdminButton>
      <ModalShell
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Add outreach task"
        size="lg"
      >
        {open && <CreateForm campaignId={campaignId} />}
      </ModalShell>
    </>
  )
}

function CreateForm({ campaignId }: { campaignId: string }) {
  const router = useRouter()
  const utils = api.useUtils()
  const [kind, setKind] = useState<'speakerOutreach' | 'sponsorOutreach'>(
    'speakerOutreach',
  )
  const [speaker, setSpeaker] = useState<SpeakerOption | null>(null)
  const [sponsorId, setSponsorId] = useState('')
  const [title, setTitle] = useState('Share the conference')
  const [targetPage, setTargetPage] = useState('/tickets')
  const [due, setDue] = useState('')
  const [created, setCreated] = useState(false)
  const sponsors = api.sponsor.crm.list.useQuery(
    {},
    { enabled: kind === 'sponsorOutreach' },
  )
  const create = api.marketing.task.create.useMutation({
    onSuccess: ({ taskId }) => {
      setCreated(true)
      void utils.marketing.plan.get.invalidate()
      void utils.marketing.campaign.get.invalidate({ campaignId })
      router.push(`/admin/marketing/tasks/${encodeURIComponent(taskId)}`)
    },
  })
  const subjectId = kind === 'speakerOutreach' ? speaker?._id : sponsorId
  const dueAt = osloLocalInputToIso(due)
  const pathIssue = sitePathIssue(targetPage)
  const busy = create.isPending || created

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy || !subjectId || !dueAt || pathIssue || !title.trim()) return
        create.mutate({ campaignId, kind, subjectId, title, targetPage, dueAt })
      }}
    >
      <fieldset disabled={busy} className="space-y-4">
        <div>
          <label htmlFor="outreach-kind" className={labelClass}>
            Recipient type
          </label>
          <select
            id="outreach-kind"
            className={inputClass}
            value={kind}
            onChange={(event) =>
              setKind(
                event.target.value === 'sponsorOutreach'
                  ? 'sponsorOutreach'
                  : 'speakerOutreach',
              )
            }
          >
            <option value="speakerOutreach">Speaker</option>
            <option value="sponsorOutreach">Sponsor</option>
          </select>
        </div>
        <div>
          <label htmlFor="outreach-recipient" className={labelClass}>
            Recipient
          </label>
          {kind === 'speakerOutreach' ? (
            <SpeakerCombobox
              id="outreach-recipient"
              value={speaker}
              onChange={setSpeaker}
              disabled={busy}
            />
          ) : (
            <>
              <select
                id="outreach-recipient"
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
        <div>
          <label htmlFor="outreach-title" className={labelClass}>
            Task title
          </label>
          <input
            id="outreach-title"
            className={inputClass}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            required
          />
        </div>
        <div>
          <label htmlFor="outreach-destination" className={labelClass}>
            Target page
          </label>
          <input
            id="outreach-destination"
            className={inputClass}
            list="outreach-pages"
            value={targetPage}
            onChange={(event) => setTargetPage(event.target.value)}
            maxLength={500}
            required
            aria-invalid={Boolean(pathIssue)}
          />
          <datalist id="outreach-pages">
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
        <div>
          <label htmlFor="outreach-due" className={labelClass}>
            Due date and time (Oslo)
          </label>
          <input
            id="outreach-due"
            type="datetime-local"
            className={inputClass}
            value={due}
            onChange={(event) => setDue(event.target.value)}
            required
          />
        </div>
      </fieldset>
      {create.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {create.error.message}
        </p>
      )}
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Review and edit the prefilled message in the task before sending.
      </p>
      <AdminButton
        color="blue"
        size="md"
        type="submit"
        disabled={
          busy || !subjectId || !dueAt || Boolean(pathIssue) || !title.trim()
        }
      >
        {busy ? 'Creating…' : 'Create task'}
      </AdminButton>
    </form>
  )
}
