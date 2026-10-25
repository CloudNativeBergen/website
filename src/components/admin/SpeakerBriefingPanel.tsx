'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'
import { formatDateTimeSafe } from '@/lib/time'

// Admin data: always refetch, so the preview follows the last save.
const fresh = { staleTime: 0 }

/**
 * "Email speakers" (#1592): preview, test and send the briefing email, and
 * post the shared part to the speakers' Slack channel. Sending is manual and
 * idempotent per speaker and version.
 */
export function SpeakerBriefingPanel() {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const [speakerId, setSpeakerId] = useState<string>('')
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmSlack, setConfirmSlack] = useState(false)
  const [showSlack, setShowSlack] = useState(false)
  const [mentionChannel, setMentionChannel] = useState(false)

  const state = api.conference.briefingSpeakers.useQuery(undefined, fresh)
  const preview = api.conference.previewBriefing.useQuery(
    { speakerId: speakerId || undefined },
    fresh,
  )
  const slackPreview = api.conference.previewBriefingSlack.useQuery(
    { mentionChannel },
    { ...fresh, enabled: showSlack },
  )

  const fail = (title: string) => (error: { message: string }) =>
    showNotification({ type: 'error', title, message: error.message })

  const test = api.conference.sendBriefingTest.useMutation({
    onSuccess: ({ to }) =>
      showNotification({
        type: 'success',
        title: 'Test sent',
        message: `Sent to ${to}.`,
      }),
    onError: fail('Could not send the test'),
  })
  const send = api.conference.sendBriefing.useMutation()
  const [progress, setProgress] = useState<{
    sent: number
    of: number
  } | null>(null)

  /**
   * One call stops before the route's time limit and reports `remaining`,
   * so keep calling until nothing is left (or a call makes no progress).
   */
  async function runSend(of: number) {
    setConfirmSend(false)
    let sent = 0
    let skipped: number | undefined
    const failed = new Map<string, string>()
    const logFailed = new Set<string>()
    setProgress({ sent, of })
    try {
      for (;;) {
        const r = await send.mutateAsync()
        sent += r.sent
        skipped ??= r.skipped
        for (const f of r.failed) failed.set(f.name, f.error)
        for (const f of r.logFailed) logFailed.add(f.name)
        setProgress({ sent, of })
        if (r.remaining === 0 || r.sent === 0) break
      }
      const problems = [
        failed.size > 0 &&
          `Failed: ${[...failed].map(([n, e]) => `${n} (${e})`).join('; ')}.`,
        logFailed.size > 0 &&
          `Sent, but the send log failed for: ${[...logFailed].join(', ')}. They may get it again.`,
        !!skipped && 'Speakers who already had this version were skipped.',
      ].filter(Boolean)
      showNotification({
        type: failed.size || logFailed.size ? 'warning' : 'success',
        title: `Sent ${sent}${skipped ? `, skipped ${skipped}` : ''}`,
        message: problems.join(' ') || 'Done.',
      })
    } catch (e) {
      showNotification({
        type: 'error',
        title: `Stopped after sending ${sent} of ${of}`,
        message: (e as Error).message,
      })
    } finally {
      setProgress(null)
      utils.conference.briefingSpeakers.invalidate()
    }
  }
  const slack = api.conference.postBriefingToSlack.useMutation({
    onSuccess: ({ channel }) => {
      setConfirmSlack(false)
      utils.conference.briefingSpeakers.invalidate()
      showNotification({
        type: 'success',
        title: 'Posted to Slack',
        message: `Posted to #${channel}.`,
      })
    },
    onError: (e) => {
      setConfirmSlack(false)
      fail('Could not post to Slack')(e)
    },
  })

  const data = state.data
  const total = data?.speakers.length ?? 0
  const current = data?.history.currentCount ?? 0
  const behind = total - current
  const everSent = (data?.history.entries.length ?? 0) > 0
  // Entries are newest first.
  const changed =
    everSent && data?.history.entries[0]?.version !== data?.version
  const channel = data?.slackChannel?.replace(/^#/, '')

  return (
    <section className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
        Email speakers
      </h2>

      {everSent && behind > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-yellow-50 p-4 text-sm text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200">
          <span>
            {changed && 'Info changed since last send. '}
            {behind} confirmed speaker{behind === 1 ? '' : 's'} have not
            received the current version.
          </span>
          <AdminButton
            onClick={() => setConfirmSend(true)}
            disabled={!!progress}
          >
            {changed ? 'Send update' : 'Send to them'}
          </AdminButton>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700 dark:text-gray-300">
          Preview as
          <select
            className="mt-1 block rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700"
            value={speakerId}
            onChange={(e) => setSpeakerId(e.target.value)}
          >
            <option value="">Sample speaker (no talks)</option>
            {data?.speakers.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <AdminButton
          variant="secondary"
          onClick={() => test.mutate({ speakerId: speakerId || undefined })}
          disabled={test.isPending}
        >
          Send test to me
        </AdminButton>
        <AdminButton
          onClick={() => setConfirmSend(true)}
          disabled={total === 0 || !!progress}
        >
          Send to {total} confirmed speaker{total === 1 ? '' : 's'}
        </AdminButton>
      </div>

      {progress && (
        <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
          Sent {progress.sent} of {progress.of}…
        </p>
      )}

      <iframe
        title="Briefing email preview"
        sandbox=""
        srcDoc={preview.data?.html ?? ''}
        className="h-[600px] w-full rounded-md border border-gray-200 bg-white dark:border-gray-700"
      />

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
        {channel ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={mentionChannel}
                  onChange={(e) => setMentionChannel(e.target.checked)}
                />
                Add @channel
              </label>
              <AdminButton
                variant="secondary"
                onClick={() => setShowSlack((v) => !v)}
              >
                {showSlack ? 'Hide' : 'Preview'} Slack message
              </AdminButton>
              <AdminButton
                onClick={() => setConfirmSlack(true)}
                disabled={slack.isPending}
              >
                Post to #{channel}
              </AdminButton>
            </div>
            {data?.slackLastPostedAt && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Last posted {formatDateTimeSafe(data.slackLastPostedAt)}
              </p>
            )}
            {showSlack && (
              <pre className="max-h-96 overflow-auto rounded-md bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {slackPreview.data?.blocks
                  .map((b) => b.text?.text ?? '')
                  .join('\n\n')}
              </pre>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Set the speakers channel under{' '}
            <Link href="/admin/settings" className="underline">
              Settings, Communication
            </Link>{' '}
            to post the speaker info to Slack.
          </p>
        )}
      </div>

      <ConfirmationModal
        isOpen={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => runSend(behind)}
        title="Email confirmed speakers"
        message={`Send the briefing to ${total} confirmed speaker${total === 1 ? '' : 's'}? ${current} already have the current version and will be skipped.`}
        confirmButtonText="Send"
        variant="info"
        isLoading={!!progress}
      />
      <ConfirmationModal
        isOpen={confirmSlack}
        onClose={() => setConfirmSlack(false)}
        onConfirm={() => slack.mutate({ mentionChannel })}
        title="Post to Slack"
        message={`Post the speaker info to #${channel}${mentionChannel ? ' and notify everyone with @channel' : ''}?`}
        confirmButtonText="Post"
        variant="info"
        isLoading={slack.isPending}
      />
    </section>
  )
}
