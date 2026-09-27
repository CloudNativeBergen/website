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
  nameIndex,
  tagOwners,
  type TagOwnership,
  type MentionIssue,
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
  /** `handle` is the tag in the body: the current one, or a recorded older one. */
  onUntag: (person: TaggablePerson, tag: TagOwnership) => void
  onFix: (issue: MentionIssue) => void
}) {
  const inBody = new Set(mentionTokens(body).map((t) => t.handle))
  // A note stands until the person is tagged after all, by any handle.
  const taggedIds = new Set(tagOwners(body, people, mentions).keys())
  const notes = mentions.filter(
    (m) =>
      m.status === 'unresolved' &&
      !inBody.has(m.handle) &&
      !taggedIds.has(m.speakerId),
  )
  if (people.length === 0 && notes.length === 0 && issues.length === 0)
    return null
  // Per speaker, not per handle: a team account two speakers share is
  // tagged for the one whose name it replaced.
  const owners = tagOwners(body, people, mentions)

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
              {issue.code !== 'plain-too-long' && (
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
              taggedAs={owners.get(person.speakerId) ?? null}
              pending={pending === person.speakerId}
              lookup={lookups[person.speakerId]}
              disabled={disabled || pending !== null}
              onTag={() => onTag(person)}
              onUntag={(tag) => onUntag(person, tag)}
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
  taggedAs,
  pending,
  lookup,
  disabled,
  onTag,
  onUntag,
}: {
  person: TaggablePerson
  body: string
  taggedAs: TagOwnership | null
  pending: boolean
  lookup: TagLookup | undefined
  disabled: boolean
  onTag: () => void
  onUntag: (tag: TagOwnership) => void
}) {
  const tagged = taggedAs !== null
  const nameInBody = nameIndex(body, person.name, person.handle) >= 0
  let status: { text: string; tone: 'muted' | 'warn' | 'error' } | null = null
  if (person.optedOut)
    status = { text: 'Asked not to be tagged', tone: 'muted' }
  else if (person.ownAccount)
    status = { text: "Links the conference's own account", tone: 'muted' }
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

  const canAct = tagged || (!person.optedOut && !!person.handle)
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 py-2 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium break-words text-gray-900 dark:text-gray-100">
          {person.name}
        </p>
        {(taggedAs?.handle ?? person.handle) && (
          <p className="font-mono text-xs break-all text-gray-500 dark:text-gray-400">
            @{taggedAs?.handle ?? person.handle}
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
            onClick={() => taggedAs && onUntag(taggedAs)}
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
