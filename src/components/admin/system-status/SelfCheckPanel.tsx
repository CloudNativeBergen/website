'use client'

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/trpc/client'
import {
  ChatBubbleLeftRightIcon,
  EnvelopeIcon,
  CircleStackIcon,
  BellAlertIcon,
} from '@heroicons/react/24/outline'
import { ProbeCard, type ProbeState } from './ProbeCard'

export function SelfCheckPanel() {
  const [slackState, setSlackState] = useState<ProbeState | null>(null)
  const [emailState, setEmailState] = useState<ProbeState | null>(null)
  const [sanityState, setSanityState] = useState<ProbeState | null>(null)

  const slack = api.status.admin.probeSlack.useMutation()
  const email = api.status.admin.probeEmail.useMutation()
  const sanityWrite = api.status.admin.probeSanityWrite.useMutation()

  const runSlack = async () => {
    setSlackState(null)
    try {
      const res = await slack.mutateAsync()
      setSlackState(
        res.ok
          ? { tone: 'success', text: `Posted to ${res.channel}` }
          : { tone: 'warn', text: res.error ?? 'Slack probe failed' },
      )
    } catch (err) {
      setSlackState({ tone: 'warn', text: messageFromError(err) })
    }
  }

  const runEmail = async () => {
    setEmailState(null)
    try {
      const res = await email.mutateAsync()
      setEmailState(
        res.ok
          ? {
              tone: 'success',
              text: 'Test email sent to your address',
              detail: res.id ? `Resend id: ${res.id}` : undefined,
            }
          : { tone: 'warn', text: res.error ?? 'Email probe failed' },
      )
    } catch (err) {
      setEmailState({ tone: 'warn', text: messageFromError(err) })
    }
  }

  const runSanity = async () => {
    setSanityState(null)
    try {
      const res = await sanityWrite.mutateAsync()
      setSanityState(
        res.ok
          ? {
              tone: 'success',
              text: `Write round-trip OK (${res.latencyMs} ms)`,
            }
          : {
              tone: 'warn',
              text: res.error ?? 'Sanity write probe failed',
              detail: `${res.latencyMs} ms`,
            },
      )
    } catch (err) {
      setSanityState({ tone: 'warn', text: messageFromError(err) })
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-300">
        Active probes actually deliver — each is rate-limited to once every 30
        seconds per organizer.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ProbeCard
          icon={ChatBubbleLeftRightIcon}
          title="Slack"
          description="Post a test message to the weekly-update channel."
          actionLabel="Send Slack test"
          pending={slack.isPending}
          state={slackState}
          onRun={runSlack}
        />
        <ProbeCard
          icon={EnvelopeIcon}
          title="Email"
          description="Send a test email to your own address via Resend."
          actionLabel="Send test email"
          pending={email.isPending}
          state={emailState}
          onRun={runEmail}
        />
        <ProbeCard
          icon={CircleStackIcon}
          title="Sanity write"
          description="Create and delete a scratch document through the write client."
          actionLabel="Run write probe"
          pending={sanityWrite.isPending}
          state={sanityState}
          onRun={runSanity}
        />
      </div>
      <div className="rounded-lg bg-gray-50 p-4 ring-1 ring-gray-200 dark:bg-gray-800/50 dark:ring-gray-700">
        <div className="flex items-start gap-2">
          <BellAlertIcon className="mt-0.5 h-5 w-5 shrink-0 text-gray-400 dark:text-gray-500" />
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Web push is tested per-device.{' '}
            <Link
              href="/cfp/profile#notification-settings"
              className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Open your notification settings
            </Link>{' '}
            and use the &ldquo;Send test notification&rdquo; button there.
          </p>
        </div>
      </div>
    </div>
  )
}

function messageFromError(err: unknown): string {
  return err instanceof Error ? err.message : 'Probe failed'
}
