'use client'

import clsx from 'clsx'
import {
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { api } from '@/lib/trpc/client'
import type {
  CommunicationRecipient,
  SponsorActivityExpanded,
} from '@/lib/sponsor-crm/types'
import { COMMUNICATION_KIND_LABELS } from '@/lib/sponsor-crm/communication'
import { formatDate } from '@/lib/time'

function RecipientChip({ recipient }: { recipient: CommunicationRecipient }) {
  return (
    <span
      className="font-inter inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      title={recipient.email}
    >
      <span className="font-medium">{recipient.name}</span>
      <span className="text-gray-500 dark:text-gray-400">
        {recipient.email}
      </span>
      {recipient.role && (
        <span className="text-gray-400 dark:text-gray-500">
          · {recipient.role}
        </span>
      )}
      {recipient.isDefault && (
        <span className="rounded-sm bg-brand-sky-mist px-1 text-[10px] font-semibold tracking-wide text-brand-cloud-blue uppercase dark:bg-indigo-900/50 dark:text-indigo-300">
          Default
        </span>
      )}
    </span>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="font-space-grotesk w-24 shrink-0 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200">
        {children}
      </dd>
    </div>
  )
}

/**
 * The full audit record of one sent email (#1261), rendered under its
 * timeline line on expand. The summary fields come with the activity; the
 * rendered body and attachments are loaded here, on demand, and the body is
 * shown in a sandboxed frame so the email's own styles cannot leak into the
 * admin page — or the other way round.
 */
export function SponsorCommunicationRecord({
  activity,
}: {
  activity: SponsorActivityExpanded
}) {
  const {
    data: record,
    isLoading,
    isError,
  } = api.sponsor.crm.activities.get.useQuery({ id: activity._id })

  const failed = activity.deliveryStatus === 'failed'
  const kind = activity.communicationKind
  const recipients = activity.recipients ?? []

  return (
    <div
      className={clsx(
        'mt-2 rounded-lg border p-4',
        failed
          ? 'border-red-200 bg-red-50/60 dark:border-red-900/50 dark:bg-red-950/30'
          : 'border-gray-200 bg-gray-50/70 dark:border-gray-700 dark:bg-gray-800/60',
      )}
      data-testid="communication-record"
    >
      {failed && (
        <div className="mb-3 flex items-start gap-2 text-sm text-red-700 dark:text-red-300">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">This email was not delivered.</p>
            {activity.error && (
              <p className="mt-0.5 font-mono text-xs break-all">
                {activity.error}
              </p>
            )}
          </div>
        </div>
      )}

      <dl className="space-y-2">
        <Field label="Kind">
          {kind ? COMMUNICATION_KIND_LABELS[kind] : 'Email'}
        </Field>
        <Field label="To">
          <div className="flex flex-wrap gap-1.5">
            {recipients.map((r) => (
              <RecipientChip key={r.contactKey} recipient={r} />
            ))}
          </div>
        </Field>
        <Field label="Subject">
          <span className="font-medium">{activity.subject}</span>
        </Field>
        <Field label="Sent">
          {formatDate(activity.createdAt)}
          {activity.createdBy
            ? ` by ${activity.createdBy.name}`
            : ' automatically'}
        </Field>
        {activity.template !== undefined && (
          <Field label="Template">
            {activity.template ? activity.template.title : 'Deleted template'}
            {activity.templateEdited ? (
              <span className="ml-2 rounded-sm bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase dark:bg-amber-900/40 dark:text-amber-300">
                Edited before sending
              </span>
            ) : (
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                sent as written
              </span>
            )}
          </Field>
        )}
        {record?.attachments && record.attachments.length > 0 && (
          <Field label="Links">
            <ul className="space-y-0.5">
              {record.attachments.map((a, i) => (
                <li key={i}>
                  {a.url ? (
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-brand-cloud-blue hover:underline dark:text-indigo-300"
                    >
                      {a.label}
                      <ArrowTopRightOnSquareIcon className="size-3.5" />
                    </a>
                  ) : (
                    a.label
                  )}
                </li>
              ))}
            </ul>
          </Field>
        )}
        {activity.providerMessageId && (
          <Field label="Message id">
            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
              {activity.providerMessageId}
            </span>
          </Field>
        )}
      </dl>

      <div className="mt-4">
        <p className="font-space-grotesk mb-1.5 text-xs font-medium tracking-wide text-gray-500 uppercase dark:text-gray-400">
          Body as sent
        </p>
        {isLoading ? (
          <div className="h-48 animate-pulse rounded-md bg-gray-200 dark:bg-gray-700" />
        ) : isError || !record?.body ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            The body of this email could not be loaded.
          </p>
        ) : (
          <iframe
            title={`Email body: ${activity.subject ?? ''}`}
            sandbox=""
            srcDoc={record.body}
            className="h-96 w-full rounded-md border border-gray-200 bg-white dark:border-gray-700"
          />
        )}
      </div>
    </div>
  )
}
