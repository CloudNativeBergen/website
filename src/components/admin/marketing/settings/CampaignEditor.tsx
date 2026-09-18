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
  needsOutcomePage,
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
  /** `loaded` is the Campaign the form MOUNTED with — see `onSave` below. */
  onSave: (fields: CampaignFields, loaded?: EditingCampaign) => void
  onClose: () => void
}) {
  const initial = campaign ? campaignFields(campaign) : emptyCampaign
  const [fields, setFields] = useState(initial)
  // `useState` ignores later arguments, so this is the copy the form was built
  // from and stays put while `campaign` is refetched underneath it. The save
  // goes out against THIS revision, so a concurrent edit fails the server's
  // compare-and-set and the organizer is told to reload — rather than the old
  // field values being written under the new revision, silently erasing it.
  const [loaded] = useState(campaign)
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
            else onSave(fields, loaded)
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
            <NumberField
              label="Target"
              min={0}
              max={1000000}
              step={1}
              allowEmpty
              value={fields.target}
              onChange={(target) => setFields({ ...fields, target })}
            />
            <label className="block text-sm">
              Outcome page
              {needsOutcomePage(fields) && (
                <span className="ml-1 text-xs text-amber-700 dark:text-amber-300">
                  required for this Outcome
                </span>
              )}
              <input
                className={inputClass}
                placeholder="/tickets"
                required={needsOutcomePage(fields)}
                aria-invalid={needsOutcomePage(fields) || undefined}
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
              <NumberField
                label="Days from Milestone"
                required
                min={-365}
                max={365}
                step={1}
                value={fields.window[`${edge}OffsetDays`]}
                onChange={(days) => setWindow(`${edge}OffsetDays`, days ?? 0)}
              />
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
              disabled={
                pending || !fields.title.trim() || needsOutcomePage(fields)
              }
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
          onSave(fields, loaded)
        }}
        title="Change the measurement window?"
        message="CFP submissions and ticket sales are measured inside the Campaign window. Changing it changes future readings; stored measurements keep their original numbers. Tasks will not move."
        confirmButtonText="Save window change"
        variant="warning"
      />
    </>
  )
}

/**
 * A controlled number input that can actually be typed into.
 *
 * `<input type="number">` reports an EMPTY string while its value is a partial
 * number, so a plain `Number(event.target.value)` turns the first `-` into 0
 * (or NaN) and the field fights back. Campaign offsets are usually negative —
 * "14 days BEFORE the Milestone" — so that made the common case untypeable.
 * Keeping the raw draft here lets the intermediate states exist; the numeric
 * value only travels up when it parses.
 */
function NumberField({
  label,
  value,
  onChange,
  allowEmpty = false,
  ...rest
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  allowEmpty?: boolean
} & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
>) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : String(value))
  return (
    <label className="block text-sm">
      {label}
      <input
        {...rest}
        className={inputClass}
        type="number"
        value={shown}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          if (raw === '') {
            if (allowEmpty) onChange(null)
            return
          }
          const parsed = Number(raw)
          if (Number.isFinite(parsed)) onChange(parsed)
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
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
    {
      enabled: !!campaignId,
      // An open editor is a form being typed into: nothing may replace its
      // contents behind the organizer's back.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  )
  // THE CAMPAIGN THE FORM WAS BUILT FROM, latched on first load.
  //
  // Keying the form off `_rev` remounted it — discarding whatever the organizer
  // had typed — as soon as a background refetch returned a new revision,
  // because anyone else's save changes `_rev`. Keying off the id alone fixes
  // that but introduces a worse bug: the form would keep the stale draft while
  // `query.data._rev` advanced, so saving would send the OLD field values under
  // the NEW revision and silently overwrite the other person's change.
  //
  // So the form is keyed by identity and saves against the revision it LOADED.
  // A concurrent edit then fails the server's compare-and-set and the organizer
  // is told to reload — their typing is intact and nobody's work is lost.

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
  // `isFetching` is true for BACKGROUND refetches too, so keying the form off
  // it swapped away a half-typed Campaign on any reconnect or invalidation —
  // and `key={_rev}` then remounted it empty. Only the FIRST load has nothing
  // to show; a refetch keeps the form the organizer is typing into.
  if (campaignId && !query.data)
    return (
      <ModalShell isOpen onClose={onClose}>
        <DialogTitle className="text-lg font-semibold">
          Edit Campaign
        </DialogTitle>
        <p className="mt-4 text-sm" role={query.error ? 'alert' : undefined}>
          {query.error?.message ?? 'Loading Campaign…'}
        </p>
        {/* A visible way out. Escape and the backdrop already close this, but
            neither is discoverable, and a failed load otherwise looks stuck. */}
        <div className="mt-6 flex justify-end">
          <AdminButton variant="secondary" onClick={onClose}>
            Close
          </AdminButton>
        </div>
      </ModalShell>
    )
  return (
    <CampaignEditorForm
      // Keyed by IDENTITY, not by revision. `key={_rev}` remounted the form —
      // discarding whatever the organizer had typed — as soon as a background
      // refetch returned a new revision, and anyone else's save changes it.
      key={campaignId ?? 'new'}
      campaign={query.data ?? undefined}
      pending={create.isPending || update.isPending}
      error={create.error?.message ?? update.error?.message}
      onClose={onClose}
      onSave={(fields, loaded) => {
        if (loaded && campaignId) {
          const { window, ...rest } = fields
          update.mutate({
            campaignId,
            rev: loaded._rev,
            ...rest,
            ...(windowChanged(campaignFields(loaded), fields)
              ? { window }
              : {}),
          })
        } else create.mutate(fields)
      }}
    />
  )
}
