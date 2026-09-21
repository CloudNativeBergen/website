'use client'

import { useState } from 'react'
import { DialogTitle } from '@headlessui/react'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { ConfirmationModal } from '@/components/admin/ConfirmationModal'
import { useNotification } from '@/components/admin/NotificationProvider'
import { api } from '@/lib/trpc/client'
import type { LibraryId, RecipeEdits } from '@/lib/marketing/library'
import { useCeilingWarningToast } from '../useCeilingWarningToast'
import { RecipeForm } from './RecipeForm'
import { countOf, recipeSummary, type LibraryEntryView } from './recipe-model'

/**
 * The Recipe Library on one Campaign (Templates spec §5): what is attached,
 * what the Library still offers, and the form for both.
 *
 * Its own dialog, deliberately NOT part of the Campaign editor: a Recipe write
 * bumps the Campaign `_rev`, and that form latches the revision it opened with,
 * so the two together would conflict on every second save. Here a FORM latches
 * the revision it opened on (what was typed belongs to that revision, so a
 * concurrent write must lose the compare-and-set rather than be overwritten),
 * while the list — which holds no typed state — removes against the freshest.
 */
export function CampaignRecipesDialog({
  campaignId,
  onClose,
}: {
  campaignId: string
  onClose: () => void
}) {
  const utils = api.useUtils()
  const { showNotification } = useNotification()
  const ceilingToast = useCeilingWarningToast()
  const editing = api.marketing.campaign.editing.useQuery(
    { campaignId },
    { refetchOnMount: 'always', refetchOnWindowFocus: false },
  )
  const library = api.marketing.campaign.recipes.library.useQuery()
  const [open, setOpen] = useState<{ entry: LibraryId; rev: string } | null>(
    null,
  )
  const [removing, setRemoving] = useState<LibraryEntryView | null>(null)

  const saved = (title: string) => (result: { ceilingWarnings: string[] }) => {
    // `campaign.invalidate()` covers `campaign.editing`, so this IS the refetch
    // that gives the next mutation a current revision.
    void utils.marketing.campaign.invalidate()
    void utils.marketing.plan.get.invalidate()
    void utils.marketing.report.invalidate()
    // Attaching the countdown creates draft posts: the Social Posts list too.
    void utils.social.listVariants.invalidate()
    showNotification({ type: 'success', title })
    ceilingToast(result)
    remove.reset()
    setOpen(null)
    setRemoving(null)
  }
  const attach = api.marketing.campaign.recipes.attach.useMutation({
    onSuccess: (result) => {
      saved(
        result.created > 0
          ? `Recipe attached · ${countOf(result.created, 'Task')} created`
          : 'Recipe attached',
      )(result)
    },
  })
  const update = api.marketing.campaign.recipes.update.useMutation({
    onSuccess: saved('Recipe saved'),
  })
  const remove = api.marketing.campaign.recipes.remove.useMutation({
    onSuccess: () => saved('Recipe removed')({ ceilingWarnings: [] }),
    // Back to the list, where the error is shown: the confirmation has no
    // place for it, and staying there only re-enabled its button.
    onError: () => setRemoving(null),
  })
  const reload = () => {
    attach.reset()
    update.reset()
    remove.reset()
    void editing.refetch()
  }

  const campaign = editing.data
  const entries = library.data
  if (!campaign || !entries || editing.isError || library.isError)
    return (
      <ModalShell isOpen onClose={onClose} size="lg">
        <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Recipes
        </DialogTitle>
        <p
          className="mt-4 text-sm text-gray-700 dark:text-gray-200"
          role={editing.error || library.error ? 'alert' : undefined}
        >
          {editing.isFetching || library.isFetching
            ? 'Loading Recipes…'
            : (editing.error?.message ??
              library.error?.message ??
              'Loading Recipes…')}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          {(editing.isError || library.isError) && (
            <AdminButton
              variant="secondary"
              disabled={editing.isFetching || library.isFetching}
              onClick={() => {
                void editing.refetch()
                void library.refetch()
              }}
            >
              Try again
            </AdminButton>
          )}
          <AdminButton variant="secondary" onClick={onClose}>
            Close
          </AdminButton>
        </div>
      </ModalShell>
    )

  const byId = (id: LibraryId) => entries.find((entry) => entry.id === id)!
  const attached = campaign.attached
  const available = entries.filter(
    (entry) => !attached.some((row) => row.entry === entry.id),
  )
  const editingRow = open && attached.find((row) => row.entry === open.entry)
  const failure = attach.error ?? update.error
  const pending = attach.isPending || update.isPending
  // Between a save and its refetch the list still holds the OLD revision: a
  // form opened then would latch it and conflict on its first save.
  // …and while a removal is in flight, a second write would go out against
  // the revision that removal is about to move.
  const stale = editing.isFetching || remove.isPending

  if (open) {
    const entry = byId(open.entry)
    const submit = (edits: RecipeEdits) => {
      const input = { campaignId, rev: open.rev, entry: entry.id, edits }
      if (editingRow) update.mutate(input)
      else attach.mutate(input)
    }
    return (
      <RecipeForm
        key={entry.id}
        entry={entry}
        initial={editingRow ? editingRow.edits : entry.defaults}
        attached={!!editingRow}
        pending={pending}
        error={
          failure && (
            <>
              {failure.message}
              {/* Only a lost compare-and-set is cured by reloading; a refused
                  edit is fixed in the form. */}
              {failure.data?.code === 'CONFLICT' && (
                <>
                  {' '}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => {
                      // Back to the list: reopening the form shows what is stored
                      // now, instead of saving stale fields under a fresh revision.
                      reload()
                      setOpen(null)
                    }}
                  >
                    Reload the Campaign
                  </button>
                </>
              )}
            </>
          )
        }
        onSubmit={submit}
        onCancel={() => {
          reload()
          setOpen(null)
        }}
      />
    )
  }

  return (
    <>
      <ModalShell isOpen={!removing} onClose={onClose} size="lg">
        <DialogTitle className="text-lg font-semibold text-gray-900 dark:text-white">
          Recipes
        </DialogTitle>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {campaign.title}
        </p>
        <section className="mt-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            On this Campaign
          </h3>
          {attached.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              No Recipes yet. Add one from the Library below.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
              {attached.map((row) => (
                <li
                  key={row.entry}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {row.edits.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {byId(row.entry).description}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {recipeSummary(row.edits)}
                    </p>
                  </div>
                  <div className="flex gap-2 sm:shrink-0">
                    <AdminButton
                      variant="secondary"
                      disabled={stale}
                      onClick={() =>
                        setOpen({ entry: row.entry, rev: campaign._rev })
                      }
                      aria-label={`Edit ${row.edits.title}`}
                    >
                      Edit
                    </AdminButton>
                    <AdminButton
                      variant="secondary"
                      disabled={stale}
                      onClick={() => setRemoving(byId(row.entry))}
                      aria-label={`Remove ${row.edits.title}`}
                    >
                      Remove
                    </AdminButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            Add from the Recipe Library
          </h3>
          {available.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Every Library Recipe is already on this Campaign.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 dark:divide-gray-800">
              {available.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {entry.title}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {entry.description}
                    </p>
                  </div>
                  <div className="flex sm:shrink-0">
                    <AdminButton
                      variant="secondary"
                      disabled={stale}
                      onClick={() =>
                        setOpen({ entry: entry.id, rev: campaign._rev })
                      }
                      aria-label={`Attach ${entry.title}`}
                    >
                      Attach
                    </AdminButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
          Changes apply to Tasks created from now on; existing Tasks are never
          rewritten.
        </p>
        {remove.error && (
          <p
            role="alert"
            className="mt-2 text-sm text-red-700 dark:text-red-300"
          >
            {remove.error.message}{' '}
            <button
              type="button"
              className="font-medium underline underline-offset-2"
              onClick={reload}
            >
              Reload the Campaign
            </button>
          </p>
        )}
        <div className="mt-6 flex justify-end">
          <AdminButton variant="secondary" onClick={onClose}>
            Close
          </AdminButton>
        </div>
      </ModalShell>
      <ConfirmationModal
        isOpen={!!removing}
        // Escape and the backdrop must not dismiss a removal that is running:
        // it cannot be undone, and its outcome is reported here.
        onClose={() => {
          if (!remove.isPending) setRemoving(null)
        }}
        onConfirm={() =>
          removing &&
          remove.mutate({
            campaignId,
            rev: campaign._rev,
            entry: removing.id,
          })
        }
        isLoading={remove.isPending}
        title={`Remove the ${removing?.title ?? ''} Recipe?`}
        message="Removing it stops creation. The Tasks it has already created stay in the Campaign."
        confirmButtonText="Remove Recipe"
        variant="danger"
      />
    </>
  )
}
