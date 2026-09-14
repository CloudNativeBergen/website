'use client'

import {
  ExclamationTriangleIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline'
import { CheckBadgeIcon } from '@heroicons/react/24/solid'
import { StatusBadge, type BadgeColor } from '@/components/StatusBadge'
import { formatDateSafe } from '@/lib/time'
import {
  NEVER_SIGNED_IN_LABEL,
  providerDisplayNames,
} from '@/lib/speaker/providers'
import {
  SIGNAL_LABEL,
  type DuplicateCandidateGroup,
  type DuplicateCandidateSpeaker,
  type DuplicateConfidence,
  type MergeBlockReason,
  type SurvivorReason,
} from '@/lib/speaker/duplicates'

/**
 * DUPLICATE-SPEAKER CANDIDATES (#267) — the "find" half of the merge tool.
 *
 * Presentational only: the page owns the tRPC query, so this renders in
 * Storybook from fixtures and the states below are all reachable there.
 *
 * THREE THINGS THIS SURFACE IS RESPONSIBLE FOR NOT GETTING WRONG:
 *
 *  1. A CERTAIN group and a GUESS must not look the same. A shared slug is a
 *     defect in the dataset; a shared name may be two real people. The tier is
 *     rendered as a coloured chip AND spelled out in the group's caption.
 *  2. The organizer must be able to pick the survivor from what is on screen.
 *     The incident (#267) turned on confirmed talks — merging by "newest" or
 *     "oldest" would have detached a confirmed talk from a live conference — so
 *     talk counts, providers, email and creation date are on every row, and the
 *     document holding confirmed talks is marked "Keep this one".
 *  3. It must never offer a merge that will be refused. A speaker another
 *     organization also holds cannot be deleted by us, so those rows show the
 *     reason instead of a button — including the SURVIVOR's row, since the merge
 *     needs exclusive standing on the kept document too, and a blocked survivor
 *     takes the whole group's merges down with it.
 */

interface DuplicateSpeakersListProps {
  groups: DuplicateCandidateGroup<DuplicateCandidateSpeaker>[]
  /** How many speaker documents in this organization were examined. */
  scannedCount: number
  isLoading?: boolean
  errorMessage?: string | null
  /** Hands the pair to the existing `SpeakerMergeModal`, pre-selected. */
  onMergePair: (pair: { survivorId: string; loserId: string }) => void
}

const CONFIDENCE_BADGE: Record<
  DuplicateConfidence,
  { label: string; color: BadgeColor }
> = {
  certain: { label: 'Certain', color: 'red' },
  likely: { label: 'Likely', color: 'yellow' },
  possible: { label: 'Possible', color: 'gray' },
}

const CONFIDENCE_CAPTION: Record<DuplicateConfidence, string> = {
  certain:
    'These documents share one public profile URL. Whoever they belong to, that is a defect — only one of them is reachable at that address.',
  likely:
    'These documents share a login identity key. Very likely the same person, but confirm before merging.',
  possible:
    'These documents only share a name. Two different people can share a name — check the talks and emails first.',
}

const SURVIVOR_CAPTION: Record<SurvivorReason, string> = {
  'confirmed-talks': 'holds the confirmed talk(s)',
  talks: 'holds the most talks',
  oldest: 'oldest account — no talks to separate them',
}

const BLOCK_REASON: Record<MergeBlockReason, string> = {
  'other-organization':
    'Another organization also has this speaker — only an organization that holds them alone may remove them.',
  'foreign-references':
    'Another organization’s documents still reference this speaker, so it cannot be deleted from here.',
  unknown:
    'Could not verify that this organization holds this speaker alone. Reload and try again.',
}

/** The suggested survivor is blocked, so no merge in this group can succeed. */
function isSurvivorBlocked(
  group: DuplicateCandidateGroup<DuplicateCandidateSpeaker>,
) {
  return group.members.some(
    (member) =>
      member._id === group.suggestedSurvivorId &&
      Boolean(member.mergeBlockedReason),
  )
}

function MemberCard({
  member,
  group,
  survivorBlocked,
  onMergePair,
}: {
  member: DuplicateCandidateSpeaker
  group: DuplicateCandidateGroup<DuplicateCandidateSpeaker>
  survivorBlocked: boolean
  onMergePair: DuplicateSpeakersListProps['onMergePair']
}) {
  const isSurvivor = member._id === group.suggestedSurvivorId
  // Shared with the merge picker's option labels so the same person reads the
  // same way in both places (`@/lib/speaker/providers`).
  const providerNames = providerDisplayNames(member.providers)
  const talkCount = member.talkCount ?? 0
  const confirmedTalkCount = member.confirmedTalkCount ?? 0

  return (
    <div
      className={`rounded-lg border p-4 ${
        isSurvivor
          ? 'border-green-300 bg-green-50/60 dark:border-green-800 dark:bg-green-900/10'
          : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-space-grotesk truncate font-semibold text-gray-900 dark:text-white">
            {member.name || 'Unnamed speaker'}
          </p>
          <p className="mt-0.5 font-mono text-xs break-all text-gray-400 dark:text-gray-500">
            {member._id}
          </p>
        </div>
        {isSurvivor && (
          <StatusBadge
            label="Keep this one"
            color="green"
            icon={CheckBadgeIcon}
          />
        )}
      </div>

      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500 dark:text-gray-400">
            Talks
          </dt>
          <dd className="min-w-0 text-gray-900 dark:text-gray-100">
            {talkCount === 0 ? (
              <span className="text-gray-400 italic dark:text-gray-500">
                none in this organization
              </span>
            ) : (
              <>
                {talkCount} talk{talkCount === 1 ? '' : 's'}
                {confirmedTalkCount > 0 ? (
                  <span className="ml-1 font-semibold text-green-700 dark:text-green-400">
                    · {confirmedTalkCount} confirmed
                  </span>
                ) : (
                  <span className="ml-1 text-gray-400 dark:text-gray-500">
                    · none confirmed
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500 dark:text-gray-400">
            Logins
          </dt>
          <dd className="flex min-w-0 flex-wrap items-center gap-1">
            {providerNames.length === 0 ? (
              // NOT a blank: an empty `providers[]` means this document was
              // created by an organizer and nobody has ever claimed it. Folding
              // a never-claimed placeholder into a real account is a different,
              // safer operation than folding two real accounts together, so it
              // is called out rather than left to look like missing data.
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                {NEVER_SIGNED_IN_LABEL}
              </span>
            ) : (
              providerNames.map((name) => (
                <span
                  key={name}
                  className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {name}
                </span>
              ))
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500 dark:text-gray-400">
            Email
          </dt>
          <dd className="min-w-0 break-all text-gray-900 dark:text-gray-100">
            {member.email || (
              <span className="text-gray-400 italic dark:text-gray-500">
                none
              </span>
            )}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-gray-500 dark:text-gray-400">
            Created
          </dt>
          <dd className="min-w-0 text-gray-900 dark:text-gray-100">
            {member._createdAt ? formatDateSafe(member._createdAt) : 'unknown'}
          </dd>
        </div>
      </dl>

      <div className="mt-3">
        {/* The survivor's own block is checked BEFORE the "keep this one"
            caption: `requireExclusive` applies to the survivor too, so a
            blocked survivor refuses every merge in the group, and saying
            "Suggested survivor" while hiding that is how the operator ended up
            discovering it as a BAD_REQUEST at preview time. */}
        {member.mergeBlockedReason ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <LockClosedIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {isSurvivor &&
                'Nothing can be merged into this document, so this whole group is stuck. '}
              {BLOCK_REASON[member.mergeBlockedReason]}
            </span>
          </p>
        ) : isSurvivor ? (
          <p className="text-xs text-green-800 dark:text-green-400">
            Suggested survivor — {SURVIVOR_CAPTION[group.survivorReason]}.
          </p>
        ) : survivorBlocked ? (
          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <LockClosedIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              The document we suggest keeping cannot take a merge — see its
              card.
            </span>
          </p>
        ) : (
          <button
            type="button"
            onClick={() =>
              onMergePair({
                survivorId: group.suggestedSurvivorId,
                loserId: member._id,
              })
            }
            className="inline-flex items-center rounded-md bg-brand-cloud-blue px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-cloud-blue/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-cloud-blue"
          >
            {/* Not "Merge into <name>": duplicates usually share a name, so
                naming the survivor reads as a no-op. The direction is what
                matters, and the modal shows both documents before anything
                happens. */}
            Merge into the kept document…
          </button>
        )}
      </div>
    </div>
  )
}

function GroupCard({
  group,
  onMergePair,
}: {
  group: DuplicateCandidateGroup<DuplicateCandidateSpeaker>
  onMergePair: DuplicateSpeakersListProps['onMergePair']
}) {
  const badge = CONFIDENCE_BADGE[group.confidence]
  const survivorBlocked = isSurvivorBlocked(group)
  const mergeableCount = survivorBlocked
    ? 0
    : group.members.filter(
        (member) =>
          member._id !== group.suggestedSurvivorId &&
          !member.mergeBlockedReason,
      ).length

  return (
    <li className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge label={badge.label} color={badge.color} />
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          {SIGNAL_LABEL[group.signal]}
        </span>
        <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs break-all text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          {group.value}
        </code>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          · {group.members.length} documents
        </span>
        {group.corroboratingSignals.length > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            (also{' '}
            {group.corroboratingSignals
              .map((signal) => SIGNAL_LABEL[signal].toLowerCase())
              .join(', ')}
            )
          </span>
        )}
      </div>

      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        {CONFIDENCE_CAPTION[group.confidence]}
      </p>

      {mergeableCount === 0 && group.members.length > 1 && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <ExclamationTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            None of these documents can be merged away from here — see the
            reasons below.
          </span>
        </p>
      )}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {group.members.map((member) => (
          <MemberCard
            key={member._id}
            member={member}
            group={group}
            survivorBlocked={survivorBlocked}
            onMergePair={onMergePair}
          />
        ))}
      </div>
    </li>
  )
}

export function DuplicateSpeakersList({
  groups,
  scannedCount,
  isLoading = false,
  errorMessage = null,
  onMergePair,
}: DuplicateSpeakersListProps) {
  const certainCount = groups.filter(
    (group) => group.confidence === 'certain',
  ).length
  const flaggedCount = new Set(
    groups.flatMap((group) => group.members.map((member) => member._id)),
  ).size

  // Open itself when there is something certain to act on — or when the scan
  // failed, which is not something to bury behind a chevron. The organizer's own
  // toggle always wins after that. Derived, so no effect has to chase the query.

  const summary = isLoading
    ? 'Scanning speakers…'
    : errorMessage
      ? 'Scan failed'
      : groups.length === 0
        ? `No duplicate candidates among ${scannedCount} speakers`
        : `${groups.length} candidate group${groups.length === 1 ? '' : 's'} covering ${flaggedCount} of ${scannedCount} speakers` +
          (certainCount > 0 ? ` · ${certainCount} certain` : '')

  return (
    <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-gray-700">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Possible duplicate speakers
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {summary}
          </p>
        </div>
        {certainCount > 0 && (
          <StatusBadge label={`${certainCount} certain`} color="red" />
        )}
      </div>

      <div id="duplicate-speakers-body">
        {isLoading ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Scanning this organization&apos;s speakers for duplicate documents…
          </p>
        ) : errorMessage ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            {errorMessage}
          </p>
        ) : groups.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No speaker documents in this organization share a profile URL, login
            account, email address or name.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Candidates are found by comparing profile URLs, login accounts,
              emails and names within this organization. They are a starting
              point, not a verdict — some may be test or placeholder accounts,
              and two people really can share a name. Check the talks before
              merging; merging deletes the duplicate document permanently.
            </p>
            <ul className="mt-6 space-y-4">
              {groups.map((group) => (
                <GroupCard
                  key={group.id}
                  group={group}
                  onMergePair={onMergePair}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
