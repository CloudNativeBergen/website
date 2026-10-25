'use client'

import { useEffect, useState } from 'react'
import { AdminButton } from '@/components/admin/AdminButton'
import { ModalShell } from '@/components/ModalShell'
import { useNotification } from './NotificationProvider'
import { api } from '@/lib/trpc/client'

// Admin data: always refetch, so the preview follows the last save.
const fresh = { staleTime: 0 }
const NOTE_MAX = 1000

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** The value, settled for `ms`: previews refetch once typing pauses. */
function useDebounced<T>(value: T, ms = 400): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return settled
}

/**
 * The Speakers Slack Channel, edited where it is used. Saved alone, so the
 * other Communication settings are untouched; `#` is optional, as in
 * Settings. Saving refetches the panel, so the preview and post button follow.
 */
export function SlackChannelField({ current }: { current: string }) {
  const utils = api.useUtils()
  const [value, setValue] = useState(current)
  const save = api.conference.updateSpeakerSlackChannel.useMutation({
    onSuccess: () => {
      utils.conference.briefingSpeakers.invalidate()
      utils.conference.previewBriefingSlack.invalidate()
    },
  })
  const dirty = value.trim() !== current
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate({ speakerSlackChannel: value.trim() || null })
      }}
    >
      <label className="text-sm text-gray-700 dark:text-gray-300">
        Speakers Slack Channel
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            save.reset()
          }}
          placeholder="#conference-speakers"
          className="mt-1 block rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700"
        />
      </label>
      <AdminButton
        type="submit"
        variant="secondary"
        disabled={!dirty || save.isPending}
      >
        {save.isPending ? 'Saving…' : 'Save'}
      </AdminButton>
      {save.isSuccess && !dirty && (
        <span
          role="status"
          className="text-sm text-green-700 dark:text-green-400"
        >
          Saved
        </span>
      )}
      {save.error && (
        <span role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not save: {save.error.message}
        </span>
      )}
      {!current && !dirty && (
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Set a channel to post the speaker info to Slack.
        </span>
      )}
    </form>
  )
}

export interface SendSpeakerInfoDialogProps {
  isOpen: boolean
  onClose: () => void
  speakers: { _id: string; name: string }[]
  /** Confirmed speakers without the current version. */
  behind: number
  /** The saved channel, with or without `#`; empty when unset. */
  slackChannel: string
}

type Phase = 'compose' | 'sending' | 'slack-failed' | 'done'

/**
 * "Send speaker info" (#1592): choose email and/or Slack, the recipients and
 * an optional note, preview both, then send. Slack goes first (it is quick
 * and fails clearly); the email loop follows with progress and continues
 * across calls until nothing is left.
 */
export function SendSpeakerInfoDialog({
  isOpen,
  onClose,
  speakers,
  behind,
  slackChannel,
}: SendSpeakerInfoDialogProps) {
  const { showNotification } = useNotification()
  const utils = api.useUtils()
  const channel = slackChannel.replace(/^#/, '')
  const total = speakers.length

  const [email, setEmail] = useState(true)
  const [slack, setSlack] = useState(!!channel)
  const [everyone, setEveryone] = useState(false)
  const [mentionChannel, setMentionChannel] = useState(false)
  const [note, setNote] = useState('')
  const [tab, setTab] = useState<'email' | 'slack'>('email')
  const [speakerId, setSpeakerId] = useState('')
  const [phase, setPhase] = useState<Phase>('compose')
  const [progress, setProgress] = useState({ sent: 0, of: 0 })
  const [summary, setSummary] = useState<string[]>([])
  const [slackError, setSlackError] = useState('')

  const settledNote = useDebounced(note).trim() || undefined
  const preview = api.conference.previewBriefing.useQuery(
    { speakerId: speakerId || undefined, note: settledNote },
    { ...fresh, enabled: isOpen && tab === 'email' },
  )
  const slackPreview = api.conference.previewBriefingSlack.useQuery(
    { mentionChannel, note: settledNote },
    { ...fresh, enabled: isOpen && tab === 'slack' && !!channel },
  )
  const test = api.conference.sendBriefingTest.useMutation({
    onSuccess: ({ to }) =>
      showNotification({
        type: 'success',
        title: 'Test sent',
        message: `Sent to ${to}.`,
      }),
    onError: (e) =>
      showNotification({
        type: 'error',
        title: 'Could not send the test',
        message: e.message,
      }),
  })
  const sendEmail = api.conference.sendBriefing.useMutation()
  const post = api.conference.postBriefingToSlack.useMutation()

  const useSlack = slack && !!channel
  const recipients = everyone ? total : behind
  const trimmedNote = note.trim() || undefined
  const reason =
    !email && !useSlack
      ? 'Choose email, Slack or both.'
      : email && recipients === 0
        ? 'All confirmed speakers have the current version.'
        : ''
  const label = [
    email && `Email ${plural(recipients, 'speaker')}`,
    useSlack && `${email ? 'post' : 'Post'} to #${channel}`,
  ]
    .filter(Boolean)
    .join(' and ')

  /** The email loop, as the email button had it; returns summary lines. */
  async function runEmail(): Promise<string[]> {
    const of = recipients
    // One run id per send: a forced continuation skips whom it reached.
    const runId = crypto.randomUUID().replace(/-/g, '')
    let sent = 0
    let skipped: number | undefined
    const failed = new Map<string, string>()
    const logFailed = new Set<string>()
    setProgress({ sent, of })
    try {
      for (;;) {
        const r = await sendEmail.mutateAsync({
          note: trimmedNote,
          ...(everyone ? { force: true as const, runId } : {}),
        })
        sent += r.sent
        skipped ??= r.skipped
        for (const f of r.failed) failed.set(f.name, f.error)
        for (const f of r.logFailed) logFailed.add(f.name)
        setProgress({ sent, of })
        if (r.remaining === 0 || r.sent === 0) break
      }
      return [
        `Emailed ${plural(sent, 'speaker')}.`,
        failed.size > 0 &&
          `Failed: ${[...failed].map(([n, e]) => `${n} (${e})`).join('; ')}.`,
        logFailed.size > 0 &&
          `Sent to ${[...logFailed].join(', ')}, but the send log failed, so they may receive it again on the next send.`,
        !!skipped && 'Speakers who already had this version were skipped.',
      ].filter((l): l is string => !!l)
    } catch (e) {
      return [
        `Stopped after sending ${sent} of ${of}. ${(e as Error).message} Fix the error and send again. Speakers who already got it are skipped.`,
      ]
    } finally {
      utils.conference.briefingSpeakers.invalidate()
    }
  }

  async function finishWithEmail(lines: string[]) {
    setPhase('sending')
    setSummary([...lines, ...(await runEmail())])
    setPhase('done')
  }

  async function send() {
    setPhase('sending')
    const lines: string[] = []
    if (useSlack) {
      try {
        const r = await post.mutateAsync({ mentionChannel, note: trimmedNote })
        lines.push(`Posted to #${r.channel}.`)
        utils.conference.briefingSpeakers.invalidate()
      } catch (e) {
        const message = (e as Error).message
        if (email) {
          // Never send the email silently after a Slack failure: ask.
          setSlackError(message)
          setPhase('slack-failed')
          return
        }
        setSummary([`Slack failed: ${message}`])
        setPhase('done')
        return
      }
    }
    if (email) return finishWithEmail(lines)
    setSummary(lines)
    setPhase('done')
  }

  function close() {
    if (phase === 'sending') return
    setPhase('compose')
    setSummary([])
    setSlackError('')
    onClose()
  }

  const box = 'flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={close}
      size="4xl"
      title="Send speaker info"
    >
      {phase === 'compose' && (
        <div className="space-y-5">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-gray-900 dark:text-white">
              Channels
            </legend>
            <label className={box}>
              <input
                type="checkbox"
                checked={email}
                onChange={(e) => setEmail(e.target.checked)}
              />
              Email to confirmed speakers
            </label>
            <label className={box}>
              <input
                type="checkbox"
                checked={useSlack}
                disabled={!channel}
                onChange={(e) => setSlack(e.target.checked)}
              />
              {channel ? `Post to #${channel}` : 'Post to Slack'}
              {!channel && (
                <span className="text-gray-500">(no channel set)</span>
              )}
            </label>
            <SlackChannelField current={slackChannel} />
          </fieldset>

          {email && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-gray-900 dark:text-white">
                Email recipients
              </legend>
              <label className={box}>
                <input
                  type="radio"
                  name="recipients"
                  checked={!everyone}
                  onChange={() => setEveryone(false)}
                />
                Only speakers without the current version ({behind})
              </label>
              <label className={box}>
                <input
                  type="radio"
                  name="recipients"
                  checked={everyone}
                  onChange={() => setEveryone(true)}
                />
                All confirmed speakers ({total})
              </label>
            </fieldset>
          )}

          {useSlack && (
            <label className={box}>
              <input
                type="checkbox"
                checked={mentionChannel}
                onChange={(e) => setMentionChannel(e.target.checked)}
              />
              Add @channel
            </label>
          )}

          <label className="block text-sm text-gray-700 dark:text-gray-300">
            Note from the organizers (optional)
            <textarea
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700"
            />
            <span className="text-xs text-gray-500">
              {note.length}/{NOTE_MAX}. Shown at the top of the email and the
              Slack post.
            </span>
          </label>

          <div>
            <div role="tablist" className="flex gap-2">
              {(['email', 'slack'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1 text-sm ${tab === t ? 'bg-gray-200 font-semibold dark:bg-gray-700' : 'text-gray-600 dark:text-gray-400'}`}
                >
                  {t === 'email' ? 'Email' : 'Slack'}
                </button>
              ))}
            </div>
            {tab === 'email' ? (
              <div className="mt-3 space-y-3">
                <label className="text-sm text-gray-700 dark:text-gray-300">
                  Preview as
                  <select
                    className="mt-1 block rounded-md border-gray-300 text-sm dark:border-gray-600 dark:bg-gray-700"
                    value={speakerId}
                    onChange={(e) => setSpeakerId(e.target.value)}
                  >
                    <option value="">Sample speaker (no talks)</option>
                    {speakers.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <iframe
                  title="Speaker info email preview"
                  sandbox=""
                  srcDoc={preview.data?.html ?? ''}
                  className="h-[480px] w-full rounded-md border border-gray-200 bg-white dark:border-gray-700"
                />
              </div>
            ) : (
              <pre className="mt-3 max-h-96 overflow-auto rounded-md bg-gray-50 p-4 text-xs whitespace-pre-wrap text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                {channel
                  ? slackPreview.data?.blocks
                      .map((b) => b.text?.text ?? '')
                      .join('\n\n')
                  : 'Set the Speakers Slack Channel above to preview the post.'}
              </pre>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            {reason && (
              <span className="mr-auto text-sm text-gray-600 dark:text-gray-400">
                {reason}
              </span>
            )}
            <AdminButton
              variant="secondary"
              disabled={test.isPending}
              onClick={() =>
                test.mutate({
                  speakerId: speakerId || undefined,
                  note: trimmedNote,
                })
              }
            >
              Send test email to me
            </AdminButton>
            <AdminButton variant="ghost" onClick={close}>
              Cancel
            </AdminButton>
            <AdminButton disabled={!!reason} onClick={send}>
              {label || 'Send'}
            </AdminButton>
          </div>
        </div>
      )}

      {phase === 'sending' && (
        <p role="status" className="text-sm text-gray-700 dark:text-gray-300">
          {post.isPending
            ? `Posting to #${channel}…`
            : `Sent ${progress.sent} of ${progress.of}…`}
        </p>
      )}

      {phase === 'slack-failed' && (
        <div className="space-y-4">
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">
            Slack failed: {slackError} Send the email anyway?
          </p>
          <div className="flex justify-end gap-3">
            <AdminButton variant="ghost" onClick={close}>
              Cancel
            </AdminButton>
            <AdminButton
              onClick={() => finishWithEmail([`Slack failed: ${slackError}`])}
            >
              Send the email anyway
            </AdminButton>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <div className="space-y-4">
          <ul
            role="status"
            className="space-y-1 text-sm text-gray-700 dark:text-gray-300"
          >
            {summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="flex justify-end">
            <AdminButton onClick={close}>Close</AdminButton>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
