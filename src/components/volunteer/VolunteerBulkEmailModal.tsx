'use client'

import { useMemo, useState } from 'react'
import { EmailModal } from '@/components/admin/EmailModal'
import { VolunteerApprovalTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { fillVolunteerName } from '@/lib/volunteer/fillName'
import type { VolunteerWithConference } from '@/lib/volunteer/types'

export interface VolunteerBulkEmailModalProps {
  isOpen: boolean
  onClose: () => void
  /** The filtered list; deduped by email here, as the server does. */
  volunteers: VolunteerWithConference[]
  onSend: (data: {
    volunteerIds: string[]
    subject: string
    message: string
  }) => Promise<void>
}

export function VolunteerBulkEmailModal({
  isOpen,
  onClose,
  volunteers,
  onSend,
}: VolunteerBulkEmailModalProps) {
  const recipients = useMemo(() => {
    const seen = new Set<string>()
    return volunteers.filter((v) => {
      const key = v.email?.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [volunteers])
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const selected = recipients.filter((v) => !unticked.has(v._id))
  const conf = recipients[0]?.conference
  const fromAddress = conf?.contactEmail || conf?.cfpEmail || ''
  const label = `${selected.length} ${selected.length === 1 ? 'volunteer' : 'volunteers'}`

  const toggle = (id: string) =>
    setUnticked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <EmailModal
      isOpen={isOpen}
      onClose={onClose}
      title="Email Volunteers"
      fromAddress={fromAddress}
      brandColor={emailBrandColor(conf?.theme)}
      storageKey={`volunteer-bulk-${conf?._id || 'conf'}`}
      submitButtonText={`Send to ${label}`}
      helpText="Use {{name}} for each volunteer's name."
      initialValues={{ message: 'Hi {{name}},\n\n' }}
      recipientInfo={
        <details>
          <summary className="cursor-pointer text-sm text-gray-600 dark:text-gray-400">
            {label}
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {recipients.map((v) => (
              <li key={v._id}>
                <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 sm:min-h-0 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={!unticked.has(v._id)}
                    onChange={() => toggle(v._id)}
                  />
                  <span className="truncate">
                    {v.name} &lt;{v.email}&gt;
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </details>
      }
      onSend={async ({ subject, message }) => {
        if (selected.length === 0) throw new Error('No recipients selected')
        await onSend({
          volunteerIds: selected.map((v) => v._id),
          subject,
          message: JSON.stringify(message),
        })
      }}
      previewComponent={({ subject, message }) => {
        const name = selected[0]?.name ?? 'Volunteer'
        const eventUrl = conf ? conferenceBaseUrl(conf) : '#'
        return (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
            <p className="mb-2 text-sm font-semibold text-gray-900">
              {fillVolunteerName(subject, name)}
            </p>
            <VolunteerApprovalTemplate
              volunteerName={name}
              eventName={conf?.title || 'Conference'}
              eventLocation={
                conf?.city && conf?.country
                  ? `${conf.city}, ${conf.country}`
                  : 'Location TBA'
              }
              eventDate={
                conf?.startDate
                  ? formatConferenceDateLong(conf.startDate)
                  : 'TBD'
              }
              eventUrl={eventUrl}
              message={fillVolunteerName(JSON.stringify(message), name, true)}
              socialLinks={[]}
              brandColor={emailBrandColor(conf?.theme)}
            />
          </div>
        )
      }}
    />
  )
}
