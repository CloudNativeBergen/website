'use client'

import { useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'
import {
  SendSpeakerInfoDialog,
  SlackChannelField,
} from './SendSpeakerInfoDialog'

/**
 * "Email speakers" (#1592): where the speaker info stands, and the one
 * "Send speaker info" dialog that previews, tests and sends the email and
 * the Slack post. Sending is manual and idempotent per speaker and version.
 */
export function SpeakerBriefingPanel() {
  const [open, setOpen] = useState(false)
  const state = api.conference.briefingSpeakers.useQuery(undefined, {
    staleTime: 0,
  })

  const data = state.data
  const total = data?.speakers.length ?? 0
  const current = data?.history.currentCount ?? 0
  const behind = total - current
  const everSent = (data?.history.entries.length ?? 0) > 0
  // Entries are newest first.
  const changed =
    everSent && data?.history.entries[0]?.version !== data?.version

  return (
    <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Email speakers
      </h2>

      {everSent && behind > 0 && (
        <div className="rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          {changed && 'The speaker info has changed since the last send. '}
          {behind} confirmed speaker{behind === 1 ? '' : 's'} have not received
          the current version.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <AdminButton onClick={() => setOpen(true)} disabled={!data}>
          {changed ? 'Send update…' : 'Send speaker info…'}
        </AdminButton>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {total === 0
            ? 'No confirmed speakers yet.'
            : `${current} of ${total} confirmed speakers have the current version.`}
        </span>
      </div>

      {everSent && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Send history
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {data?.history.entries.map((h) => (
              <li key={h.version}>
                {formatDateTimeSafe(h.lastSentAt)}: {h.count} speaker
                {h.count === 1 ? '' : 's'}, version {h.version}
                {h.version === data.version && ' (current)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3 border-t border-gray-200 pt-6 dark:border-gray-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Slack
        </h3>
        {data && <SlackChannelField current={data.slackChannel ?? ''} />}
        {data?.slackLastPostedAt && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Last posted {formatDateTimeSafe(data.slackLastPostedAt)}
          </p>
        )}
      </div>

      {data && (
        <SendSpeakerInfoDialog
          isOpen={open}
          onClose={() => setOpen(false)}
          speakers={data.speakers}
          behind={behind}
          slackChannel={data.slackChannel ?? ''}
        />
      )}
    </section>
  )
}
