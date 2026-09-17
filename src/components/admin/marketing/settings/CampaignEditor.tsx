'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { MILESTONES } from '@/lib/marketing/milestones'
import { OUTCOME_LABELS, OUTCOMES } from '@/lib/marketing/types'
import { MILESTONE_LABELS } from '../timeline-model'
import {
  campaignFields,
  emptyCampaign,
  needsMeasurementWarning,
  windowChanged,
  type CampaignFields,
  type EditingCampaign,
} from './editor-model'

const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white'
export function CampaignEditorForm({
  campaign,
  pending = false,
  error,
  onSave,
  onClose,
}: {
  campaign?: EditingCampaign
  pending?: boolean
  error?: string
  onSave: (fields: CampaignFields) => void
  onClose: () => void
}) {
  const initial = campaign ? campaignFields(campaign) : emptyCampaign
  const [fields, setFields] = useState(initial)
  const [confirming, setConfirming] = useState(false)
  const setWindow = <K extends keyof CampaignFields['window']>(
    key: K,
    value: CampaignFields['window'][K],
  ) =>
    setFields((current) => ({
      ...current,
      window: { ...current.window, [key]: value },
    }))
  return (
    <>
      <ModalShell
        isOpen={!confirming}
        onClose={pending ? () => {} : onClose}
        size="lg"
      >
        <DialogTitle className="text-lg font-semibold">
          {campaign ? 'Edit Campaign' : 'Add Campaign'}
        </DialogTitle>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (pending) return
            if (campaign && needsMeasurementWarning(initial, fields))
              setConfirming(true)
            else onSave(fields)
          }}
        >
          <label className="block text-sm">
            Title
            <input
              className={inputClass}
              required
              maxLength={200}
              value={fields.title}
              onChange={(event) =>
                setFields({ ...fields, title: event.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Primary Outcome
            <select
              className={inputClass}
              value={fields.primaryOutcome}
              onChange={(event) =>
                setFields({
                  ...fields,
                  primaryOutcome: event.target
                    .value as CampaignFields['primaryOutcome'],
                })
              }
            >
              {OUTCOMES.map((outcome) => (
                <option key={outcome} value={outcome}>
                  {OUTCOME_LABELS[outcome]}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              Target
              <input
                className={inputClass}
                type="number"
                min={0}
                max={1000000}
                step={1}
                value={fields.target ?? ''}
                onChange={(event) =>
                  setFields({
                    ...fields,
                    target:
                      event.target.value === ''
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label className="block text-sm">
              Outcome page
              <input
                className={inputClass}
                placeholder="/tickets"
                value={fields.outcomeTargetPage ?? ''}
                onChange={(event) =>
                  setFields({
                    ...fields,
                    outcomeTargetPage: event.target.value || null,
                  })
                }
              />
            </label>
          </div>
          {(['start', 'end'] as const).map((edge) => (
            <fieldset key={edge} className="grid gap-3 sm:grid-cols-2">
              <legend className="font-medium capitalize">
                {edge} of window
              </legend>
              <label className="text-sm">
                Milestone
                <select
                  className={inputClass}
                  value={fields.window[`${edge}Milestone`]}
                  onChange={(event) =>
                    setWindow(
                      `${edge}Milestone`,
                      event.target
                        .value as CampaignFields['window']['startMilestone'],
                    )
                  }
                >
                  {MILESTONES.map((milestone) => (
                    <option key={milestone} value={milestone}>
                      {MILESTONE_LABELS[milestone]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Days from Milestone
                <input
                  className={inputClass}
                  type="number"
                  required
                  min={-365}
                  max={365}
                  step={1}
                  value={fields.window[`${edge}OffsetDays`]}
                  onChange={(event) =>
                    setWindow(`${edge}OffsetDays`, Number(event.target.value))
                  }
                />
              </label>
            </fieldset>
          ))}
          <p className="text-sm text-gray-500">
            Changing the Campaign window does not move its Tasks.
          </p>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <AdminButton
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              disabled={pending || !fields.title.trim()}
            >
              {pending ? 'Saving…' : 'Save Campaign'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          onSave(fields)
        }}
        title="Change the measurement window?"
        message="CFP submissions and ticket sales are measured inside the Campaign window. Changing it changes future readings; stored measurements keep their original numbers. Tasks will not move."
        confirmButtonText="Save window change"
        variant="warning"
      />
    </>
  )
}

export function CampaignEditor({
  campaignId,
  onClose,
}: {
  campaignId?: string
  onClose: () => void
}) {
  const query = api.marketing.campaign.editing.useQuery(
    { campaignId: campaignId ?? '' },
    { enabled: !!campaignId, refetchOnWindowFocus: false },
  )
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const saved = (result: { measurementWarning?: string | null }) => {
    void utils.marketing.plan.get.invalidate()
    void utils.marketing.campaign.invalidate()
    void utils.marketing.report.invalidate()
    showNotification({
      type: result.measurementWarning ? 'warning' : 'success',
      title: 'Campaign saved',
      message: result.measurementWarning ?? undefined,
    })
    onClose()
  }
  const create = api.marketing.campaign.create.useMutation({
    onSuccess: () => saved({}),
  })
  const update = api.marketing.campaign.update.useMutation({ onSuccess: saved })
  if (campaignId && (!query.data || query.isFetching))
    return (
      <ModalShell isOpen onClose={onClose}>
        <DialogTitle>Edit Campaign</DialogTitle>
        <p role={query.error ? 'alert' : undefined}>
          {query.error?.message ?? 'Loading Campaign…'}
        </p>
      </ModalShell>
    )
  return (
    <CampaignEditorForm
      key={query.data?._rev ?? 'new'}
      campaign={query.data ?? undefined}
      pending={create.isPending || update.isPending}
      error={create.error?.message ?? update.error?.message}
      onClose={onClose}
      onSave={(fields) => {
        if (query.data && campaignId) {
          const { window, ...rest } = fields
          update.mutate({
            campaignId,
            rev: query.data._rev,
            ...rest,
            ...(windowChanged(campaignFields(query.data), fields)
              ? { window }
              : {}),
          })
        } else create.mutate(fields)
      }}
    />
  )
}
