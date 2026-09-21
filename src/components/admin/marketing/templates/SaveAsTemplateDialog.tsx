'use client'

import { useState } from 'react'
import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { useNotification } from '@/components/admin/NotificationProvider'
import { CONFERENCE_PLACEHOLDERS } from '@/lib/marketing/placeholders'
import type { Anchor } from '@/lib/marketing/template'
import { formatDateSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import { MilestoneAnchorFields } from '../anchor'
import {
  copyIssues,
  groupReview,
  saveDecisions,
  type AnchorReview,
  type CopyReview,
  type ReviewDrafts,
} from './template-model'

const NOTE = 'text-sm text-gray-500 dark:text-gray-400'
const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'
// A section heading outranks the Task titles under it; at text-sm it read as
// the smaller of the two and the list looked like a flat run of Tasks.
const SECTION = 'text-base font-semibold text-gray-900 dark:text-white'

/** The placeholders a static Task can still be given, as chips. */
function Placeholders() {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">
        Placeholders:
      </span>
      {CONFERENCE_PLACEHOLDERS.map((name) => (
        <code
          key={name}
          className="rounded bg-gray-100 px-1 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-200"
        >
          {`{${name}}`}
        </code>
      ))}
    </p>
  )
}

function ReviewHeading({
  task,
}: {
  task: Pick<AnchorReview, 'title' | 'campaignTitle'>
}) {
  return (
    <>
      <p className="text-sm font-medium text-gray-900 dark:text-white">
        {task.title}
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {task.campaignTitle}
      </p>
    </>
  )
}

/**
 * Save as Template (Templates spec §6.2): name a new Template or add a version
 * to one, answer the review list, save. The live plan is only read — nothing
 * here writes to it.
 */
export function SaveAsTemplateDialog({ onClose }: { onClose: () => void }) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const preview = api.marketing.template.savePreview.useQuery(undefined, {
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  })
  const [target, setTarget] = useState<'new' | 'version'>('new')
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<ReviewDrafts>({ anchors: {}, copy: {} })

  const templates = preview.data?.templates ?? []
  // Only a Template the list still offers: a pick a refetch dropped must not be
  // submitted with no radio showing it.
  const templateId =
    (templates.some((t) => t.templateId === picked) ? picked : null) ??
    templates[0]?.templateId ??
    null
  const chosen = templates.find((t) => t.templateId === templateId) ?? null
  // Nothing to version yet: the choice is not offered rather than disabled.
  const mode = templates.length === 0 ? 'new' : target

  const save = api.marketing.template.save.useMutation({
    onSuccess: (result) => {
      void utils.marketing.template.invalidate()
      showNotification({
        type: 'success',
        title: `Saved “${mode === 'new' ? name.trim() : (chosen?.name ?? '')}” as version ${result.version}`,
      })
      onClose()
    },
  })

  const review = preview.data?.review ?? []
  const { anchors, copy } = groupReview(review)
  const issues = copyIssues(copy, drafts.copy)
  const anchorOf = (item: AnchorReview): Anchor =>
    drafts.anchors[item.taskId] ?? item.anchor
  const textOf = (item: CopyReview): string =>
    drafts.copy[item.taskId] ?? item.text
  const setAnchor = (taskId: string, anchor: Anchor) =>
    setDrafts((prev) => ({
      ...prev,
      anchors: { ...prev.anchors, [taskId]: anchor },
    }))
  const setCopy = (taskId: string, text: string) =>
    setDrafts((prev) => ({ ...prev, copy: { ...prev.copy, [taskId]: text } }))

  const named = mode === 'new' ? name.trim() !== '' : templateId !== null
  // `isFetching`, not only "has data": reopened within the cache lifetime the
  // dialog shows the PREVIOUS review list while the forced refetch runs. The
  // server saves the plan as it is NOW, so saving on the stale list would put
  // newly literal copy or newly unanchored Tasks into an immutable version
  // without their review ever having been shown.
  const blocked =
    save.isPending ||
    preview.isFetching ||
    !preview.data ||
    !named ||
    Object.keys(issues).length > 0

  const submit = () => {
    if (blocked) return
    const decisions = saveDecisions(review, drafts)
    if (mode === 'version' && templateId)
      save.mutate({ target: { type: 'version', templateId }, decisions })
    else if (mode === 'new')
      save.mutate({ target: { type: 'new', name: name.trim() }, decisions })
  }

  return (
    <ModalShell
      isOpen
      onClose={save.isPending ? () => {} : onClose}
      size="2xl"
      title="Save as Template"
      subtitle="Reuse this plan in a later edition."
      icon={<ArchiveBoxArrowDownIcon className="size-5" />}
    >
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <p className={NOTE}>
          Saving never changes this plan. A Template holds Campaigns and their
          Recipes, never Tasks, assignees or published posts.
        </p>

        <fieldset className="space-y-2">
          <legend className={SECTION}>Save to</legend>
          <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
            <input
              type="radio"
              name="target"
              value="new"
              checked={mode === 'new'}
              onChange={() => setTarget('new')}
            />
            New Template
          </label>
          {mode === 'new' && (
            <label className="block text-sm text-gray-700 dark:text-gray-200">
              Template name
              <input
                className={inputClass}
                value={name}
                maxLength={120}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          {templates.length > 0 && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-900 dark:text-gray-100">
                <input
                  type="radio"
                  name="target"
                  value="version"
                  checked={mode === 'version'}
                  onChange={() => setTarget('version')}
                />
                New version of…
              </label>
              {mode === 'version' && (
                <label className="block text-sm text-gray-700 dark:text-gray-200">
                  Template
                  <select
                    className={inputClass}
                    value={templateId ?? ''}
                    onChange={(event) => setPicked(event.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.templateId} value={t.templateId}>
                        {t.name} — will become version {t.latestVersion + 1}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </fieldset>

        {preview.isPending && (
          <div className="h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
        )}
        {preview.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {preview.error.message}
          </p>
        )}
        {preview.data && preview.isFetching && (
          <p aria-live="polite" className={NOTE}>
            Checking the plan for changes since this list was made…
          </p>
        )}
        {(preview.data?.unsavedTargets.length ?? 0) > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            <p className="font-medium">These Targets will not be saved</p>
            <p className="mt-1">
              A Template keeps a Target as a share of ticket capacity, and this
              edition has no ticket capacity set. Set it in the conference
              settings first, or save without{' '}
              {preview
                .data!.unsavedTargets.map(
                  (t) => `${t.campaignTitle} (${t.target})`,
                )
                .join(', ')}
              .
            </p>
          </div>
        )}

        {preview.data && review.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
            Nothing needs a decision. Every Task is anchored to a Milestone and
            keeps the copy skeleton it was created from.
          </p>
        )}

        {anchors.length > 0 && (
          <section className="space-y-3">
            <h3 className={SECTION}>Unanchored Tasks</h3>
            <p className={NOTE}>
              A Template stores dates as a Milestone and an offset, so these
              Tasks — moved by hand, or given a plain date — need an anchor.
              Confirm the suggestion or change it.
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {anchors.map((item) => {
                const anchor = anchorOf(item)
                return (
                  <li key={`anchor-${item.taskId}`} className="py-3">
                    <ReviewHeading task={item} />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {item.date
                        ? `Now on ${formatDateSafe(item.date)}`
                        : 'No date on the plan'}
                    </p>
                    <fieldset className="mt-2 grid gap-3 text-gray-700 sm:grid-cols-2 dark:text-gray-200">
                      <legend className="sr-only">
                        Anchor for {item.title}
                      </legend>
                      <MilestoneAnchorFields
                        milestone={anchor.milestone}
                        offsetDays={anchor.offsetDays}
                        onMilestoneChange={(milestone) =>
                          setAnchor(item.taskId, { ...anchor, milestone })
                        }
                        onOffsetDaysChange={(offsetDays) =>
                          setAnchor(item.taskId, { ...anchor, offsetDays })
                        }
                      />
                    </fieldset>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {copy.length > 0 && (
          <section className="space-y-3">
            <h3 className={SECTION}>Tasks carrying literal copy</h3>
            <p className={NOTE}>
              This copy was written for this edition. Replace anything
              edition-specific with a placeholder — &ldquo;12 November
              2026&rdquo; becomes <code>{'{date}'}</code> — and it is filled in
              for the next one. Text left as it is here is saved word for word,
              and the Task it seeds is flagged for review.
            </p>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {copy.map((item) => (
                <li key={`copy-${item.taskId}`} className="py-3">
                  <ReviewHeading task={item} />
                  <label className="mt-2 block text-sm text-gray-700 dark:text-gray-200">
                    <span className="sr-only">Copy for {item.title}</span>
                    <textarea
                      className={inputClass}
                      rows={5}
                      maxLength={3000}
                      aria-label={`Copy for ${item.title}`}
                      value={textOf(item)}
                      onChange={(event) =>
                        setCopy(item.taskId, event.target.value)
                      }
                    />
                  </label>
                  <Placeholders />
                  {issues[item.taskId] && (
                    <p
                      role="alert"
                      className="mt-1 text-sm text-red-700 dark:text-red-300"
                    >
                      {issues[item.taskId]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {save.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {save.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <AdminButton
            type="button"
            variant="secondary"
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancel
          </AdminButton>
          <AdminButton type="submit" color="brand" disabled={blocked}>
            {save.isPending ? 'Saving…' : 'Save as Template'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}
