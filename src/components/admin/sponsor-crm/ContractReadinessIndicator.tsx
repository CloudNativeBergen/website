'use client'

import { useState } from 'react'
import { api } from '@/lib/trpc/client'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import {
  groupMissingBySource,
  type MissingField,
  type ReadinessSource,
} from '@/lib/sponsor-crm/contract-readiness'

const SOURCE_LABELS: Record<ReadinessSource, string> = {
  organizer: 'Conference settings',
  sponsor: 'Sponsor (via onboarding)',
  pipeline: 'CRM pipeline',
}

const EDITABLE_ORG_FIELDS: Record<string, string> = {
  'conference.organizerOrgNumber': 'Org. number',
  'conference.organizerAddress': 'Address',
}

function OrgFieldEditor({
  conferenceId,
  missingFields,
  onSaved,
}: {
  conferenceId: string
  missingFields: MissingField[]
  onSaved: () => void
}) {
  const editableFields = missingFields.filter(
    (f) => f.field in EDITABLE_ORG_FIELDS,
  )
  const [values, setValues] = useState<Record<string, string>>({})
  const [isEditing, setIsEditing] = useState(false)

  const mutation =
    api.sponsor.contractTemplates.updateConferenceOrgInfo.useMutation({
      onSuccess: () => {
        setIsEditing(false)
        setValues({})
        onSaved()
      },
    })

  if (editableFields.length === 0) return null

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200"
      >
        <PencilSquareIcon className="h-3.5 w-3.5" />
        Set organizer details
      </button>
    )
  }

  const handleSave = () => {
    const update: {
      conferenceId: string
      organizerOrgNumber?: string
      organizerAddress?: string
    } = { conferenceId }
    const orgNumber = values['conference.organizerOrgNumber']?.trim()
    if (orgNumber) {
      update.organizerOrgNumber = orgNumber
    }
    const orgAddress = values['conference.organizerAddress']?.trim()
    if (orgAddress) {
      update.organizerAddress = orgAddress
    }
    if (!update.organizerOrgNumber && !update.organizerAddress) return
    mutation.mutate(update)
  }

  return (
    <div className="mt-2 space-y-2">
      {editableFields.map((f) => (
        <input
          key={f.field}
          type="text"
          placeholder={EDITABLE_ORG_FIELDS[f.field]}
          value={values[f.field] || ''}
          onChange={(e) =>
            setValues((prev) => ({ ...prev, [f.field]: e.target.value }))
          }
          className="block w-full rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
        />
      ))}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={mutation.isPending}
          className="rounded bg-amber-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {mutation.isPending ? 'Saving\u2026' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => {
            setIsEditing(false)
            setValues({})
          }}
          className="rounded px-2 py-0.5 text-xs text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function MissingFieldList({ items }: { items: MissingField[] }) {
  if (items.length === 0) return null
  return (
    <ul className="mt-1 space-y-0.5">
      {items.map((item) => (
        <li
          key={item.field}
          className="text-xs text-gray-600 dark:text-gray-400"
        >
          &bull; {item.label}
        </li>
      ))}
    </ul>
  )
}

export function ContractReadinessIndicator({
  sponsorForConferenceId,
  conferenceId,
}: {
  sponsorForConferenceId: string
  conferenceId: string
}) {
  const utils = api.useUtils()

  const { data: readiness, isLoading } =
    api.sponsor.contractTemplates.contractReadiness.useQuery(
      { id: sponsorForConferenceId },
      { enabled: !!sponsorForConferenceId },
    )

  if (isLoading || !readiness) return null

  if (readiness.ready) {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
        <div className="flex items-center gap-2">
          <CheckCircleIcon className="h-5 w-5 text-green-500" />
          <span className="text-sm font-medium text-green-800 dark:text-green-300">
            Contract ready
          </span>
        </div>
      </div>
    )
  }

  const grouped = groupMissingBySource(readiness.missing)

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
      <div className="flex items-center gap-2">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
          Missing data for contract
        </span>
      </div>
      <div className="mt-2 space-y-2 pl-7">
        {(Object.entries(grouped) as [ReadinessSource, MissingField[]][])
          .filter(([, items]) => items.length > 0)
          .map(([source, items]) => (
            <div key={source}>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {SOURCE_LABELS[source]}:
              </p>
              <MissingFieldList items={items} />
              {source === 'organizer' && conferenceId && (
                <OrgFieldEditor
                  conferenceId={conferenceId}
                  missingFields={items}
                  onSaved={() =>
                    utils.sponsor.contractTemplates.contractReadiness.invalidate()
                  }
                />
              )}
            </div>
          ))}
      </div>
    </div>
  )
}
