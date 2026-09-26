'use client'

import {
  AtSymbolIcon,
  ExclamationTriangleIcon,
  NoSymbolIcon,
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import { AdminButton } from '@/components/admin/AdminButton'
import type { MentionRecord } from '@/lib/marketing/tagging/body'
import {
  mentionTokens,
  type TagIssue,
  type TaggablePerson,
} from '@/lib/marketing/tagging/checks'

/** What the last tag-button press learned about a handle, when it did not tag. */
export type TagLookup = 'not-found' | 'unreachable'

/**
 * The Task editor's Bluesky tags (tagging spec §2, §4.3, §4.4): a tag button
 * beside each person the post is about, the notes generation left for a link
 * that did not resolve, and the issues a refused save or approval carries —
 * each with its one-click fix. Presentational: the body is the form's, and
 * every change goes back through the callbacks.
 */
export function TagPanel({
  body,
  people,
  mentions,
  issues,
  pending,
  lookups,
  disabled = false,
  onTag,
  onUntag,
  onFix,
}: {
  body: string
  people: readonly TaggablePerson[]
  mentions: readonly MentionRecord[]
  issues: readonly TagIssue[]
  /** The speaker whose handle is being checked right now. */
  pending: string | null
  lookups: Readonly<Record<string, TagLookup>>
  disabled?: boolean
  onTag: (person: TaggablePerson) => void
  onUntag: (person: TaggablePerson) => void
  onFix: (issue: TagIssue) => void
}) {
  const inBody = new Set(mentionTokens(body).map((t) => t.handle))
  // A note stands until the person is tagged after all.
  const notes = mentions.filter(
    (m) => m.status === 'unresolved' && !inBody.has(m.handle),
  )
  if (people.length === 0 && notes.length === 0 && issues.length === 0)
    return null

  return (
    <section
      aria-label="Bluesky tags"
      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
        <AtSymbolIcon className="size-4 text-brand-cloud-blue" />
        Tags
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        A tag notifies the person on Bluesky. It swaps their name in the post
        for their handle.
      </p>

      {issues.length > 0 && (
        <ul className="mt-3 space-y-2" aria-label="Tag problems">
          {issues.map((issue) => (
            <li
              key={`${issue.code}:${issue.mentionKey ?? ''}`}
              role="alert"
              className="flex flex-col gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-900 dark:bg-red-900/20 dark:text-red-200"
            >
              <span className="min-w-0 break-words">{issue.message}</span>
              {issue.handle && issue.name && (
                <AdminButton
                  variant="secondary"
                  size="xs"
                  className="shrink-0 self-start sm:self-auto"
                  disabled={disabled}
                  onClick={() => onFix(issue)}
                >
                  Use the plain name
                </AdminButton>
              )}
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map((m) => (
            <li
              key={m._key}
              className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-200"
            >
              <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">
                {m.name}&apos;s Bluesky link does not resolve
              </span>
            </li>
          ))}
        </ul>
      )}

      {people.length > 0 && (
        <ul className="mt-3 divide-y divide-gray-100 dark:divide-gray-800">
          {people.map((person) => (
            <PersonRow
              key={person.speakerId}
              person={person}
              body={body}
              tagged={!!person.handle && inBody.has(person.handle)}
              pending={pending === person.speakerId}
              lookup={lookups[person.speakerId]}
              disabled={disabled || pending !== null}
              onTag={() => onTag(person)}
              onUntag={() => onUntag(person)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonRow({
  person,
  body,
  tagged,
  pending,
  lookup,
  disabled,
  onTag,
  onUntag,
}: {
  person: TaggablePerson
  body: string
  tagged: boolean
  pending: boolean
  lookup: TagLookup | undefined
  disabled: boolean
  onTag: () => void
  onUntag: () => void
}) {
  const nameInBody = person.name !== '' && body.includes(person.name)
  let status: { text: string; tone: 'muted' | 'warn' | 'error' } | null = null
  if (person.optedOut)
    status = { text: 'Asked not to be tagged', tone: 'muted' }
  else if (!person.handle)
    status = { text: 'No Bluesky link on their profile', tone: 'muted' }
  else if (!tagged && lookup === 'not-found')
    status = { text: `@${person.handle} does not resolve`, tone: 'error' }
  else if (!tagged && lookup === 'unreachable')
    status = {
      text: 'Could not reach Bluesky. Try again.',
      tone: 'warn',
    }
  else if (!tagged && !nameInBody)
    status = { text: 'Their name is not in the post', tone: 'muted' }

  const canAct = !person.optedOut && !!person.handle
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words text-gray-900 dark:text-gray-100">
          {person.name}
        </p>
        {person.handle && (
          <p className="font-mono text-xs break-all text-gray-500 dark:text-gray-400">
            @{person.handle}
          </p>
        )}
        {status && (
          <p
            className={clsx(
              'mt-0.5 flex items-center gap-1 text-xs',
              status.tone === 'muted' && 'text-gray-500 dark:text-gray-400',
              status.tone === 'warn' && 'text-amber-700 dark:text-amber-300',
              status.tone === 'error' && 'text-red-700 dark:text-red-300',
            )}
          >
            {person.optedOut && <NoSymbolIcon className="size-3.5 shrink-0" />}
            {status.text}
          </p>
        )}
      </div>
      {canAct &&
        (tagged ? (
          <AdminButton
            variant="secondary"
            size="xs"
            disabled={disabled}
            onClick={onUntag}
            aria-label={`Use ${person.name}'s name instead of the tag`}
          >
            Use name
          </AdminButton>
        ) : (
          <AdminButton
            color="brand"
            size="xs"
            disabled={disabled || !nameInBody}
            onClick={onTag}
            aria-label={`Tag ${person.name}`}
          >
            <AtSymbolIcon className="size-3.5" />
            {pending ? 'Checking…' : 'Tag'}
          </AdminButton>
        ))}
    </li>
  )
}
