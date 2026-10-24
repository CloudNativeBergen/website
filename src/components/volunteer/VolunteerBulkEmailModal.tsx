'use client'

import { useMemo, useState } from 'react'
import { EmailModal } from '@/components/admin/EmailModal'
import { VolunteerMessageTemplate } from '@/components/email/VolunteerApprovalTemplate'
import { emailBrandColor } from '@/lib/branding/theme'
import { conferenceBaseUrl } from '@/lib/conference/baseUrl'
import { formatConferenceDateLong } from '@/lib/time'
import { fillVolunteerName } from '@/lib/volunteer/fillName'
import type { VolunteerWithConference } from '@/lib/volunteer/types'
import {
  sendInChunks,
  VOLUNTEER_EMAIL_CHUNK,
  type VolunteerSendFailure,
} from '@/lib/volunteer/chunkedSend'
import { VOLUNTEER_BULK_EMAIL_MAX } from '@/server/schemas/volunteer'

export interface VolunteerBulkEmailModalProps {
  isOpen: boolean
  onClose: () => void
  /** The filtered list; deduped by email here, as the server does. */
  volunteers: VolunteerWithConference[]
  /** Sends one chunk (at most VOLUNTEER_EMAIL_CHUNK ids). */
  onSend: (data: {
    volunteerIds: string[]
    subject: string
    message: string
  }) => Promise<{ failed: VolunteerSendFailure[] }>
  /** Called once every selected volunteer was mailed without failures. */
  onComplete?: (sent: number) => void
}

export function VolunteerBulkEmailModal({
  isOpen,
  onClose,
  volunteers,
  onSend,
  onComplete,
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
  // Ids already mailed in this modal session; a retry skips them.
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<string | null>(null)
  const [failed, setFailed] = useState<VolunteerSendFailure[]>([])
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
      recipientInfo={
        <div className="min-w-0 space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Up to {VOLUNTEER_BULK_EMAIL_MAX} recipients, sent{' '}
            {VOLUNTEER_EMAIL_CHUNK} at a time. Each email starts with &quot;Dear
            name,&quot;.
          </p>
          {progress && (
            <p
              role="status"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {progress}
            </p>
          )}
          {failed.length > 0 && (
            <div className="text-sm text-red-700 dark:text-red-400">
              <p>Not sent to:</p>
              <ul>
                {failed.map((f) => (
                  <li key={f.id} className="min-w-0 truncate">
                    {f.email}: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                    <span className="min-w-0 truncate">
                      {v.name} &lt;{v.email}&gt;
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </details>
        </div>
      }
      onSend={async ({ subject, message }) => {
        if (selected.length === 0) throw new Error('No recipients selected')
        if (selected.length > VOLUNTEER_BULK_EMAIL_MAX) {
          throw new Error(
            `Select at most ${VOLUNTEER_BULK_EMAIL_MAX} volunteers per send.`,
          )
        }
        if (!fromAddress) {
          throw new Error(
            'The conference has no contact email set. Add one in the conference settings before sending.',
          )
        }
        const pending = selected
          .filter((v) => !sentIds.has(v._id))
          .map((v) => v._id)
        const total = selected.length
        const already = total - pending.length
        const body = JSON.stringify(message)
        const failedIds = new Set<string>()
        setProgress(`Sent ${already} of ${total}`)
        const result = await sendInChunks(
          pending,
          async (volunteerIds) => {
            const res = await onSend({ volunteerIds, subject, message: body })
            res.failed.forEach((f) => failedIds.add(f.id))
            const ok = volunteerIds.filter((id) => !failedIds.has(id))
            setSentIds((prev) => new Set([...prev, ...ok]))
            return res
          },
          (done) => setProgress(`Sent ${already + done} of ${total}`),
        )
        setFailed(result.failed)
        if (result.error) {
          throw new Error(
            `Stopped after ${already + result.done} of ${total}: ${result.error.message}. Send again to continue with the rest.`,
          )
        }
        if (result.failed.length > 0) {
          throw new Error(
            `${result.failed.length} could not be sent: ${result.failed.map((f) => f.email).join(', ')}. Send again to retry them.`,
          )
        }
        onComplete?.(total)
      }}
      previewComponent={({ subject, message }) => {
        const name = selected[0]?.name ?? 'Volunteer'
        const eventUrl = conf ? conferenceBaseUrl(conf) : '#'
        return (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-700 dark:bg-gray-900">
            <p className="mb-2 text-sm font-semibold text-gray-900">
              {fillVolunteerName(subject, name)}
            </p>
            <VolunteerMessageTemplate
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
