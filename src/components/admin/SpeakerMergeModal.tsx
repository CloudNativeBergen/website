'use client'

import { useMemo, useState } from 'react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'
import { Button } from '@/components/Button'
import { ModalShell } from '@/components/ModalShell'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import { providerSummary } from '@/lib/speaker/providers'
import { useQueryClient } from '@tanstack/react-query'
import type {
  MergeFieldChoice,
  MergeFieldReason,
  MergeFieldSelections,
  MergeSide,
  SelectableMergeField,
} from '@/lib/speaker/merge'

/** Minimal speaker shape needed to pick merge candidates. */
export interface MergeCandidate {
  _id: string
  name: string
  email?: string | null
  /**
   * `providers[]` entries (`<provider>:<accountId>`). REQUIRED IN PRACTICE for
   * this picker to be usable: duplicates share a name and often have two
   * similar personal addresses, so the provider is the only field that visibly
   * tells the two rows apart. An empty array is meaningful — see
   * {@link NEVER_SIGNED_IN_LABEL}.
   */
  providers?: (string | null | undefined)[] | null
}

interface SpeakerMergeModalProps {
  isOpen: boolean
  onClose: () => void
  speakers: MergeCandidate[]
  onMerged?: () => void
  /**
   * Pre-selection from the duplicate-candidates panel (#267), so an organizer
   * goes from "these two are the same person" straight to the preview instead
   * of hunting for both names in a 348-entry dropdown. The dropdowns stay
   * editable — the panel's survivor is a suggestion, not a decision.
   *
   * RE-APPLIED ON EVERY OPEN, not just on mount. Closing the modal clears its
   * internal selection (`resetAndClose`), so seeding only at mount meant that
   * opening a suggested pair, closing it, and clicking the SAME pair again
   * produced an empty modal — a click that visibly does nothing, in the exact
   * flow this exists to add. Keying the modal on the pair did not help: an
   * identical key is not a remount. See the `isOpen` transition sync below.
   */
  initialSurvivorId?: string
  initialLoserId?: string
}

/**
 * `Ganesh Vasudevan · GitHub · ganesh.vasudevan@ericsson.com`.
 *
 * The provider sits BEFORE the email deliberately: in a list of duplicates the
 * name repeats and the addresses rhyme, so the provider is the first thing that
 * differs between two otherwise identical-looking options.
 */
function optionLabel(speaker: MergeCandidate): string {
  return [speaker.name, providerSummary(speaker.providers), speaker.email]
    .filter(Boolean)
    .join(' · ')
}

function EmailList({ emails }: { emails: string[] }) {
  if (emails.length === 0) {
    return <span className="text-brand-slate-gray/50 italic">none</span>
  }
  return <span>{emails.join(', ')}</span>
}

const FIELD_LABELS: Record<SelectableMergeField, string> = {
  email: 'Email',
  bio: 'Bio',
  title: 'Title',
  image: 'Uploaded image',
  imageURL: 'Profile image URL',
  gender: 'Gender',
  country: 'Country',
}

/**
 * Why the pre-selected side is pre-selected. The email reasons are the point of
 * this screen: a `knownEmails` entry is written ONLY by a login path, so it is
 * provably provider-verified, whereas the display `email` on a document nobody
 * has ever signed in to was typed by an organizer in `speaker.admin.create`.
 * That asymmetry is what used to be invisible — and what silently deleted the
 * real address whenever the placeholder happened to hold the talks.
 */
const REASON_LABELS: Record<MergeFieldReason, string> = {
  'only-value': 'the only value',
  'verified-known-account': 'verified via a linked account',
  'has-linked-account': 'from a signed-in account',
  'survivor-default': 'survivor kept by default',
}

/** Render any candidate value as something an organizer can compare at a glance. */
function fieldValueText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'object') {
    return Object.keys(value as object).length > 0 ? 'an uploaded image' : null
  }
  return String(value)
}

/**
 * Provenance for one side of the email row, derived from the SERVER's verdict.
 *
 * It must come from `choice.reason`, not from the candidate list: that list's
 * `providers[]` is a client-side projection that can be absent or miss the row
 * entirely, and the old lookup then asserted "typed by an organizer" — an
 * unverifiable provenance claim on the most safety-critical field. `reason`
 * explains the RECOMMENDED side, so the other side gets its negation; where the
 * server has no evidence either way (`survivor-default`) there is nothing
 * honest to say and the hint is omitted.
 */
function sideHint(choice: PreviewFieldChoice, side: MergeSide): string | null {
  const isRecommended = choice.recommended === side
  switch (choice.reason) {
    case 'verified-known-account':
      return isRecommended ? 'verified via a linked account' : 'not verified'
    case 'has-linked-account':
      return isRecommended ? 'from a signed-in account' : 'no linked account'
    case 'only-value':
      return isRecommended ? 'the only address' : null
    case 'survivor-default':
      return null
  }
}

function FieldChoiceRow({
  choice,
  selected,
  onSelect,
  prominent,
}: {
  choice: PreviewFieldChoice
  selected: MergeSide
  onSelect: (side: MergeSide) => void
  prominent?: boolean
}) {
  const sides: Array<{ side: MergeSide; text: string | null }> = [
    { side: 'survivor', text: fieldValueText(choice.survivorValue) },
    { side: 'loser', text: fieldValueText(choice.loserValue) },
  ]

  return (
    <div
      className={`rounded-lg border p-3 ${
        prominent
          ? 'border-brand-cloud-blue/40 bg-white dark:border-blue-500/40 dark:bg-gray-900/40'
          : 'border-brand-frosted-steel/70 dark:border-gray-700'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-space-grotesk text-sm font-semibold text-brand-slate-gray dark:text-white">
          {FIELD_LABELS[choice.field]}
        </span>
        <span className="text-xs text-brand-slate-gray/60 dark:text-gray-400">
          suggested: {REASON_LABELS[choice.reason]}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sides.map(({ side, text }) => (
          <label
            key={side}
            className={`flex cursor-pointer gap-2 rounded-md border p-2 text-sm ${
              selected === side
                ? 'border-brand-cloud-blue bg-brand-sky-mist/60 dark:border-blue-400 dark:bg-blue-900/20'
                : 'border-transparent bg-white/60 dark:bg-gray-800/40'
            }`}
          >
            <input
              type="radio"
              name={`merge-field-${choice.field}`}
              className="mt-1"
              checked={selected === side}
              onChange={() => onSelect(side)}
            />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-brand-slate-gray/70 uppercase dark:text-gray-400">
                {side === 'survivor' ? 'Survivor' : 'Duplicate'}
                {choice.recommended === side ? ' · recommended' : ''}
              </span>
              <span className="block break-words text-brand-slate-gray dark:text-gray-200">
                {text ?? (
                  <span className="text-brand-slate-gray/50 italic">empty</span>
                )}
              </span>
              {choice.field === 'email' && sideHint(choice, side) && (
                <span className="block text-xs text-brand-slate-gray/60 dark:text-gray-400">
                  {sideHint(choice, side)}
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * The preview crosses tRPC's serializer, which widens the `unknown` candidate
 * values to optional. Mirror that here rather than casting at every use.
 */
type PreviewFieldChoice = Omit<
  MergeFieldChoice,
  'survivorValue' | 'loserValue'
> & {
  survivorValue?: unknown
  loserValue?: unknown
}

/** The unions come back as `unknown[]`; render only the string members. */
function unionStrings(values?: unknown[]): string[] {
  return (values ?? []).filter((v): v is string => typeof v === 'string')
}

/** Fields where both sides are empty have nothing to review. */
function isReviewable(choice: PreviewFieldChoice): boolean {
  return (
    fieldValueText(choice.survivorValue) !== null ||
    fieldValueText(choice.loserValue) !== null
  )
}

export function SpeakerMergeModal({
  isOpen,
  onClose,
  speakers,
  onMerged,
  initialSurvivorId = '',
  initialLoserId = '',
}: SpeakerMergeModalProps) {
  const queryClient = useQueryClient()
  const { showNotification } = useNotification()

  const [survivorId, setSurvivorId] = useState(initialSurvivorId)
  const [loserId, setLoserId] = useState(initialLoserId)
  // A seeded pair goes straight to the preview: the organizer already made the
  // "these are the same person" call on the panel, and the preview is the only
  // screen that shows what the merge would actually repoint.
  const [previewRequested, setPreviewRequested] = useState(
    Boolean(initialSurvivorId && initialLoserId),
  )
  const [isConfirmOpen, setIsConfirmOpen] = useState(false)
  /**
   * Per-field overrides. Only fields the organizer actually flipped are held
   * here; everything else follows the server's recommendation, so a preview that
   * refreshes can never be overruled by stale UI state. Each entry is a SIDE,
   * never a value — the server resolves it against the two documents it reads.
   */
  const [selections, setSelections] = useState<MergeFieldSelections>({})

  // SEED ON EVERY OPEN. React's "adjust state when a prop changes" pattern
  // (set state during render, no effect, no extra commit): on the closed→open
  // transition the selection is re-derived from the incoming pair. That covers
  // reopening the SAME pair after a close — which a remount key cannot, since
  // an identical key is not a remount — and reopening with a DIFFERENT pair, and
  // reopening with NO pair from the "Merge Duplicates" button, which must clear
  // whatever the panel seeded last time.
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setSurvivorId(initialSurvivorId)
      setLoserId(initialLoserId)
      setPreviewRequested(Boolean(initialSurvivorId && initialLoserId))
      setIsConfirmOpen(false)
      setSelections({})
    }
  }

  const bothSelected = Boolean(survivorId && loserId)
  const sameSelected = bothSelected && survivorId === loserId

  const sortedSpeakers = useMemo(
    () => [...speakers].sort((a, b) => a.name.localeCompare(b.name)),
    [speakers],
  )

  const previewEnabled = previewRequested && bothSelected && !sameSelected

  // The selections go INTO the preview: the dry run must be the same plan the
  // mutation commits, or the operator confirms something the server never ran.
  const previewQuery = api.speaker.admin.mergePreview.useQuery(
    { survivorId, loserId, fieldSelections: selections },
    {
      enabled: previewEnabled,
      retry: false,
      // Flipping a field changes the query key; keep the previous plan on screen
      // while the new one computes instead of blanking the review rows.
      placeholderData: (previous) => previous,
    },
  )

  const mergeMutation = api.speaker.admin.merge.useMutation({
    onSuccess: (data) => {
      showNotification({
        type: 'success',
        title: 'Speakers merged',
        message: `Repointed references in ${data.preview.referencingDocCount} document(s) and deleted the duplicate.`,
      })
      queryClient.invalidateQueries({ queryKey: [['speaker']] })
      resetAndClose()
      onMerged?.()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Merge failed',
        message: error.message,
      })
    },
  })

  function resetState() {
    setSurvivorId('')
    setLoserId('')
    setPreviewRequested(false)
    setIsConfirmOpen(false)
    setSelections({})
  }

  function resetAndClose() {
    resetState()
    onClose()
  }

  const preview = previewQuery.data
  const survivor = sortedSpeakers.find((s) => s._id === survivorId)
  const loser = sortedSpeakers.find((s) => s._id === loserId)
  // Email first — it is the field that used to be decided invisibly, and the one
  // whose wrong answer is unrecoverable once the duplicate is deleted.
  const reviewableFields = useMemo(() => {
    const fields = (preview?.fields ?? []).filter(isReviewable)
    return [
      ...fields.filter((f) => f.field === 'email'),
      ...fields.filter((f) => f.field !== 'email'),
    ]
  }, [preview])

  return (
    <>
      <ModalShell
        isOpen={isOpen}
        onClose={resetAndClose}
        size="2xl"
        title="Merge duplicate speakers"
      >
        <p className="font-inter text-sm text-brand-slate-gray/70 dark:text-gray-400">
          Fold a duplicate speaker into a canonical one. All references are
          repointed to the survivor and the duplicate is deleted. This cannot be
          undone.
        </p>

        <div className="mt-6 grid grid-cols-1 items-end gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block">
            <span className="font-inter text-sm font-medium text-brand-slate-gray dark:text-gray-200">
              Survivor (kept, keeps its URL)
            </span>
            <select
              value={survivorId}
              onChange={(e) => {
                setSurvivorId(e.target.value)
                setPreviewRequested(false)
                setSelections({})
              }}
              className="mt-1 w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select survivor…</option>
              {sortedSpeakers.map((s) => (
                <option key={s._id} value={s._id} disabled={s._id === loserId}>
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <div className="hidden justify-center pb-2 sm:flex">
            <ArrowRightIcon className="h-5 w-5 text-brand-slate-gray/40" />
          </div>

          <label className="block">
            <span className="font-inter text-sm font-medium text-brand-slate-gray dark:text-gray-200">
              Duplicate (folded in, then deleted)
            </span>
            <select
              value={loserId}
              onChange={(e) => {
                setLoserId(e.target.value)
                setPreviewRequested(false)
                setSelections({})
              }}
              className="mt-1 w-full rounded-lg border border-brand-frosted-steel bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            >
              <option value="">Select duplicate…</option>
              {sortedSpeakers.map((s) => (
                <option
                  key={s._id}
                  value={s._id}
                  disabled={s._id === survivorId}
                >
                  {optionLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {sameSelected && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Survivor and duplicate must be different speakers.
          </p>
        )}

        <div className="mt-4">
          <Button
            variant="secondary"
            onClick={() => setPreviewRequested(true)}
            disabled={!bothSelected || sameSelected}
          >
            Preview changes
          </Button>
        </div>

        {previewEnabled && (
          <div className="mt-5 rounded-xl border border-brand-frosted-steel bg-brand-sky-mist/40 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            {previewQuery.isLoading && (
              <p className="font-inter text-sm text-brand-slate-gray/70 dark:text-gray-400">
                Computing preview…
              </p>
            )}
            {previewQuery.isError && (
              <p className="font-inter text-sm text-red-600 dark:text-red-400">
                {previewQuery.error.message}
              </p>
            )}
            {preview && (
              <div className="space-y-4 text-sm">
                <div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    References to repoint
                  </h4>
                  {preview.referencingDocCount === 0 ? (
                    <p className="text-brand-slate-gray/70 dark:text-gray-400">
                      No documents reference the duplicate.
                    </p>
                  ) : (
                    <ul className="mt-1 list-inside list-disc text-brand-slate-gray/80 dark:text-gray-300">
                      {Object.entries(preview.referenceRepointsByType).map(
                        ([type, count]) => (
                          <li key={type}>
                            <span className="font-medium">{type}</span>: {count}{' '}
                            reference{count === 1 ? '' : 's'}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>

                <div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    Fields on the survivor
                  </h4>
                  <p className="mt-1 text-brand-slate-gray/70 dark:text-gray-400">
                    The recommended value is pre-selected for each field. Flip
                    any of them — whatever you leave unpicked is what the
                    duplicate loses.
                  </p>
                  <div className="mt-2 space-y-2">
                    {reviewableFields.map((choice) => (
                      <FieldChoiceRow
                        key={choice.field}
                        choice={choice}
                        selected={
                          selections[choice.field] ?? choice.recommended
                        }
                        onSelect={(side) =>
                          setSelections((current) => ({
                            ...current,
                            [choice.field]: side,
                          }))
                        }
                        prominent={choice.field === 'email'}
                      />
                    ))}
                    {reviewableFields.length === 0 && (
                      <p className="text-brand-slate-gray/70 dark:text-gray-400">
                        Neither speaker has any profile field set.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-space-grotesk font-semibold text-brand-slate-gray dark:text-white">
                    Merged sets on survivor
                  </h4>
                  <p className="mt-1 text-brand-slate-gray/70 dark:text-gray-400">
                    These are unions — nothing here is a choice, and nothing
                    from the duplicate is dropped.
                  </p>
                  <dl className="mt-1 space-y-1 text-brand-slate-gray/80 dark:text-gray-300">
                    <div>
                      <dt className="inline font-medium">Providers: </dt>
                      <dd className="inline">
                        {preview.fieldChanges.providers.after.join(', ') ||
                          'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">
                        Verified known emails:{' '}
                      </dt>
                      <dd className="inline">
                        <EmailList
                          emails={preview.fieldChanges.knownEmails.after}
                        />
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Links: </dt>
                      <dd className="inline">
                        {unionStrings(preview.unions?.links.after).join(', ') ||
                          'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Flags: </dt>
                      <dd className="inline">
                        {unionStrings(preview.unions?.flags.after).join(', ') ||
                          'none'}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Organizations: </dt>
                      <dd className="inline">
                        {preview.unions?.organizations.after.length ?? 0}{' '}
                        membership
                        {(preview.unions?.organizations.after.length ?? 0) === 1
                          ? ''
                          : 's'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="pt-1">
                  <Button
                    variant="primary"
                    onClick={() => setIsConfirmOpen(true)}
                    className="!bg-red-600 hover:!bg-red-500 focus-visible:!outline-red-600 dark:!bg-red-700 dark:hover:!bg-red-600"
                  >
                    Merge and delete duplicate
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </ModalShell>

      <ConfirmationModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={() => {
          setIsConfirmOpen(false)
          mergeMutation.mutate({
            survivorId,
            loserId,
            fieldSelections: selections,
          })
        }}
        title="Merge speakers?"
        message={`This permanently deletes "${loser?.name ?? 'the duplicate'}" and repoints its references to "${survivor?.name ?? 'the survivor'}". This cannot be undone.`}
        confirmButtonText="Merge and delete"
        variant="danger"
        isLoading={mergeMutation.isPending}
      />
    </>
  )
}
