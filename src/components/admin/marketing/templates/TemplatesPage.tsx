'use client'

import { useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import { RectangleStackIcon } from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { AdminPageHeader } from '@/components/admin/AdminPageHeader'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { typeToConfirmMatches } from '@/components/admin/new-edition/wizardLogic'
import { OUTCOME_LABELS } from '@/lib/marketing/types'
import { formatDateSafe, formatDateTimeSafe } from '@/lib/time'
import { api } from '@/lib/trpc/client'
import {
  previewWindowWords,
  type TemplateSummary,
  type TemplateVersionRow,
} from './template-model'

const NOTE = 'text-sm text-gray-500 dark:text-gray-400'
const CARD =
  'rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900'
const inputClass =
  'mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

/** Rename one Template. The name is shared by every version (§2.4). */
function RenameTemplateDialog({
  template,
  onClose,
}: {
  template: TemplateSummary
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [name, setName] = useState(template.name)
  const rename = api.marketing.template.rename.useMutation({
    onSuccess: () => {
      void utils.marketing.template.invalidate()
      showNotification({ type: 'success', title: 'Template renamed' })
      onClose()
    },
  })
  return (
    <ModalShell
      isOpen
      onClose={rename.isPending ? () => {} : onClose}
      size="md"
      title="Rename Template"
      subtitle="Every version of the Template takes the new name."
    >
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim())
            rename.mutate({
              templateId: template.templateId,
              name: name.trim(),
            })
        }}
      >
        <label className="block text-sm text-gray-700 dark:text-gray-200">
          Name
          <input
            className={inputClass}
            value={name}
            maxLength={120}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {rename.error && (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {rename.error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <AdminButton
            type="button"
            variant="secondary"
            disabled={rename.isPending}
            onClick={onClose}
          >
            Cancel
          </AdminButton>
          <AdminButton
            type="submit"
            color="brand"
            disabled={rename.isPending || name.trim() === ''}
          >
            {rename.isPending ? 'Renaming…' : 'Rename Template'}
          </AdminButton>
        </div>
      </form>
    </ModalShell>
  )
}

/** The whole Template, every version. Seeded plans keep their stamped origin. */
function DeleteTemplateDialog({
  template,
  onClose,
}: {
  template: TemplateSummary
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const [typed, setTyped] = useState('')
  const remove = api.marketing.template.delete.useMutation({
    onSuccess: () => {
      void utils.marketing.template.invalidate()
      showNotification({ type: 'success', title: 'Template deleted' })
      onClose()
    },
  })
  return (
    <ConfirmationModal
      isOpen
      onClose={remove.isPending ? () => {} : onClose}
      onConfirm={() =>
        remove.mutate({
          templateId: template.templateId,
          confirmName: typed.trim(),
        })
      }
      title={`Delete the Template “${template.name}”?`}
      message={`All ${template.latestVersion} versions of “${template.name}” are permanently removed. Plans already seeded from it are untouched and keep their stamped origin.`}
      confirmButtonText="Delete Template"
      isLoading={remove.isPending}
      confirmDisabled={!typeToConfirmMatches(typed, template.name)}
    >
      <div className="mt-4 text-left text-sm text-gray-700 dark:text-gray-200">
        <label className="block">
          Type &ldquo;{template.name}&rdquo; to confirm
          <input
            className={inputClass}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </label>
        {remove.error && (
          <p role="alert" className="mt-2 text-red-700 dark:text-red-300">
            {remove.error.message}
          </p>
        )}
      </div>
    </ConfirmationModal>
  )
}

/** What one Template Version holds (§6.3): Campaigns, Task counts, Recipes. */
function VersionPreview({
  templateId,
  version,
}: {
  templateId: string
  version: number
}) {
  const preview = api.marketing.template.preview.useQuery({
    templateId,
    version,
  })
  if (preview.isPending)
    return (
      <div className="h-32 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
    )
  if (preview.error)
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-300">
        {preview.error.message}
      </p>
    )
  if (!preview.data) return null
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {preview.data.campaigns.map((campaign) => (
        <li key={campaign.key} className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white">
              {campaign.title}
            </p>
            {campaign.optional && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                Optional
              </span>
            )}
          </div>
          <p className={NOTE}>
            {OUTCOME_LABELS[campaign.primaryOutcome]} ·{' '}
            {previewWindowWords(campaign)} · {campaign.tasks} tasks
            {campaign.recipes.length > 0 && ' to start with'}
          </p>
          {campaign.recipes.length > 0 && (
            <p className={NOTE}>
              Plus what its Recipes create: {campaign.recipes.join(', ')}
            </p>
          )}
        </li>
      ))}
      {preview.data.campaigns.length === 0 && (
        <li className={clsx('py-3', NOTE)}>This version has no Campaigns.</li>
      )}
    </ul>
  )
}

/** One row of the version history, with Restore on anything but the latest. */
function VersionRow({
  row,
  latest,
  selected,
  onSelect,
  onRestore,
}: {
  row: TemplateVersionRow
  latest: number
  selected: boolean
  onSelect: () => void
  onRestore: () => void
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-w-0 flex-1 text-left"
      >
        <p
          className={clsx(
            'font-medium',
            selected
              ? 'text-brand-cloud-blue dark:text-blue-300'
              : 'text-gray-900 dark:text-white',
          )}
        >
          Version {row.version}
          {row.version === latest && ' · latest'}
        </p>
        <p className={NOTE}>
          {row.savedAt ? formatDateTimeSafe(row.savedAt) : 'No date'}
          {row.savedByName && ` · ${row.savedByName}`}
          {row.savedFromTitle && ` · from ${row.savedFromTitle}`}
          {row.restoredFrom !== null && ` · restored from v${row.restoredFrom}`}
        </p>
      </button>
      {row.version !== latest && (
        <AdminButton
          variant="secondary"
          onClick={onRestore}
          aria-label={`Restore version ${row.version}`}
        >
          Restore
        </AdminButton>
      )}
    </li>
  )
}

function TemplateDetail({ template }: { template: TemplateSummary }) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const versions = api.marketing.template.versions.useQuery({
    templateId: template.templateId,
  })
  const [picked, setPicked] = useState<number | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const restore = api.marketing.template.restore.useMutation({
    onSuccess: (result) => {
      void utils.marketing.template.invalidate()
      showNotification({
        type: 'success',
        title: `Restored as version ${result.version}`,
      })
      setPicked(null)
      setRestoring(null)
    },
    // Back to the page, where the error is shown: the confirmation has no place
    // for it, and behind its overlay nobody could read why Restore failed.
    onError: () => setRestoring(null),
  })

  const rows = versions.data ?? []
  const latest = rows[0]?.version ?? template.latestVersion
  // Only a version the history still lists: a pick a refetch dropped must not
  // be previewed against a version that is gone.
  const version =
    (rows.some((row) => row.version === picked) ? picked : null) ?? latest

  return (
    <div className={clsx(CARD, 'space-y-4')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {template.name}
          </h2>
          <p className={NOTE}>
            {template.latestVersion} versions · {template.campaigns} campaigns
            in the latest ·{' '}
            {template.savedAt
              ? `saved ${formatDateSafe(template.savedAt)}`
              : 'never saved'}
          </p>
        </div>
        <div className="flex gap-2">
          <AdminButton variant="secondary" onClick={() => setRenaming(true)}>
            Rename
          </AdminButton>
          <AdminButton color="red" onClick={() => setDeleting(true)}>
            Delete
          </AdminButton>
        </div>
      </div>

      <section className="border-t border-gray-100 pt-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Version history
        </h3>
        {versions.isPending && (
          <div className="mt-2 h-24 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
        )}
        {versions.error && (
          <p
            role="alert"
            className="mt-2 text-sm text-red-700 dark:text-red-300"
          >
            {versions.error.message}
          </p>
        )}
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {rows.map((row) => (
            <VersionRow
              key={row.version}
              row={row}
              latest={latest}
              selected={row.version === version}
              onSelect={() => setPicked(row.version)}
              onRestore={() => setRestoring(row.version)}
            />
          ))}
        </ul>
      </section>

      {/* Its own bordered band: without one the preview read as a continuation
          of the history list, and its heading repeated a version number that is
          also a row just above. */}
      <section className="border-t border-gray-100 pt-4 dark:border-gray-800">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          Preview of version {version}
        </h3>
        <p className={NOTE}>
          What a plan created from this version starts with. A Template&apos;s
          contents are not edited here — save a plan as a new version instead.
        </p>
        <VersionPreview templateId={template.templateId} version={version} />
      </section>

      {restore.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {restore.error.message}
        </p>
      )}

      <ConfirmationModal
        isOpen={restoring !== null}
        onClose={() => {
          if (!restore.isPending) setRestoring(null)
        }}
        onConfirm={() =>
          restoring !== null &&
          restore.mutate({
            templateId: template.templateId,
            version: restoring,
          })
        }
        isLoading={restore.isPending}
        variant="info"
        title={`Restore version ${restoring ?? ''}?`}
        message={`Restoring writes a NEW version with the contents of version ${restoring ?? ''}. Nothing is overwritten — the history is append-only, and every version stays seedable.`}
        confirmButtonText="Restore version"
      />
      {renaming && (
        <RenameTemplateDialog
          template={template}
          onClose={() => setRenaming(false)}
        />
      )}
      {deleting && (
        <DeleteTemplateDialog
          template={template}
          onClose={() => setDeleting(false)}
        />
      )}
    </div>
  )
}

/**
 * The organization's Plan Templates (Templates spec §6.3): the list, one
 * Template's version history, and a preview of any version. Available whether
 * or not this edition has a plan.
 */
export function TemplatesPage() {
  const list = api.marketing.template.list.useQuery()
  const [picked, setPicked] = useState<string | null>(null)

  const templates = list.data ?? []
  const templateId =
    (templates.some((t) => t.templateId === picked) ? picked : null) ??
    templates[0]?.templateId ??
    null
  const selected = templates.find((t) => t.templateId === templateId) ?? null

  return (
    <div className="space-y-6">
      <Link href="/admin/marketing" className="text-sm text-brand-cloud-blue">
        ← Marketing plan
      </Link>
      <AdminPageHeader
        icon={<RectangleStackIcon />}
        title="Plan Templates"
        description="The Marketing Plan Templates this organization owns. Every version can seed a new edition's plan."
      />
      {list.isPending && (
        <div className="h-40 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      )}
      {list.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {list.error.message}
        </p>
      )}
      {list.data && templates.length === 0 && (
        <div className={clsx(CARD, 'text-center')}>
          <p className="text-gray-700 dark:text-gray-200">No Templates yet.</p>
          <p className={clsx('mt-2', NOTE)}>
            A Template is made with &ldquo;Save as Template&rdquo; on plan
            settings: it keeps the plan&apos;s Campaigns and their Recipes so a
            later edition can start from them.
          </p>
          <Link
            href="/admin/marketing/settings"
            className="mt-3 inline-block text-sm font-medium text-brand-cloud-blue dark:text-blue-300"
          >
            Go to plan settings
          </Link>
        </div>
      )}
      {templates.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          <ul className="space-y-2 lg:col-span-1">
            {templates.map((template) => {
              const on = template.templateId === templateId
              return (
                <li key={template.templateId}>
                  <button
                    type="button"
                    onClick={() => setPicked(template.templateId)}
                    aria-pressed={on}
                    className={clsx(
                      'w-full rounded-lg border px-3 py-2 text-left',
                      on
                        ? 'border-brand-cloud-blue bg-brand-sky-mist/40 dark:border-blue-400 dark:bg-blue-950/40'
                        : 'border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800',
                    )}
                  >
                    <span className="block font-medium text-gray-900 dark:text-white">
                      {template.name}
                    </span>
                    <span className={clsx('block', NOTE)}>
                      Version {template.latestVersion} · {template.campaigns}{' '}
                      campaigns
                    </span>
                    <span className={clsx('block', NOTE)}>
                      {template.savedAt
                        ? `Last saved ${formatDateSafe(template.savedAt)}`
                        : 'Never saved'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="lg:col-span-2">
            {selected && (
              <TemplateDetail key={selected.templateId} template={selected} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
