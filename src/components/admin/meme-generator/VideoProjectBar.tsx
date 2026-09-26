'use client'

import { useId } from 'react'
import {
  CheckCircleIcon,
  DocumentDuplicateIcon,
  ExclamationTriangleIcon,
  FolderOpenIcon,
  PlusIcon,
} from '@heroicons/react/24/outline'
import { AdminButton } from '@/components/admin/AdminButton'
import {
  VIDEO_PROJECT_MAX_TITLE,
  type VideoProjectRow,
} from '@/lib/video-project'
import { styles } from './meme-generator-config'

export type ProjectStatus = 'new' | 'saved' | 'unsaved'

export interface ProjectMessage {
  tone: 'error' | 'info'
  text: string
  /** Offered with a conflict; run against the editor's CURRENT video. */
  action?: 'save-as-new'
}

/**
 * The saved project above a video (docs/MARKETING_STUDIO_VIDEO_SPEC.md §7):
 * its title, Save, Duplicate, and opening another. Presentational — the
 * editor owns the project and every call.
 */
export function VideoProjectBar({
  title,
  onTitleChange,
  status,
  busy,
  isSaved,
  editionOnly,
  onEditionOnlyChange,
  rows,
  onOpen,
  onNew,
  onSave,
  onDuplicate,
  onSaveAsNew,
  message,
}: {
  title: string
  onTitleChange: (title: string) => void
  status: ProjectStatus
  /** A call in flight: every control waits for it. */
  busy: 'saving' | 'opening' | 'duplicating' | null
  /** Stored at least once: it can be duplicated and has an edition fixed. */
  isSaved: boolean
  editionOnly: boolean
  onEditionOnlyChange: (value: boolean) => void
  /** The organization's projects, or null while they load. */
  rows: VideoProjectRow[] | null
  onOpen: (id: string) => void
  onNew: () => void
  onSave: () => void
  onDuplicate: () => void
  onSaveAsNew: () => void
  message: ProjectMessage | null
}) {
  const ids = { title: useId(), open: useId(), edition: useId() }
  const statusText =
    busy === 'saving'
      ? 'Saving…'
      : busy === 'opening'
        ? 'Opening…'
        : busy === 'duplicating'
          ? 'Duplicating…'
          : status === 'saved'
            ? 'All changes saved'
            : status === 'unsaved'
              ? 'Unsaved changes'
              : 'Not saved yet'

  return (
    <section
      aria-label="Project"
      className={`${styles.panel} space-y-3`}
      aria-busy={busy !== null || undefined}
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <label htmlFor={ids.title} className={styles.label}>
            Project title
          </label>
          <input
            id={ids.title}
            type="text"
            value={title}
            maxLength={VIDEO_PROJECT_MAX_TITLE}
            onChange={(e) => onTitleChange(e.target.value)}
            // A save in flight stores the title it sent; an edit made
            // meanwhile would be shown as saved when it was not.
            readOnly={busy !== null}
            className={styles.input}
          />
        </div>
        <AdminButton
          type="button"
          color="brand"
          size="md"
          onClick={onSave}
          disabled={busy !== null || status === 'saved'}
        >
          Save
        </AdminButton>
        <AdminButton
          type="button"
          variant="secondary"
          size="md"
          onClick={onDuplicate}
          disabled={busy !== null || !isSaved || status !== 'saved'}
          title={
            isSaved && status !== 'saved'
              ? 'Save your changes before duplicating'
              : undefined
          }
          className="inline-flex items-center gap-1.5"
        >
          <DocumentDuplicateIcon aria-hidden="true" className="size-4" />
          Duplicate project
        </AdminButton>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm">
        <p
          className={`flex items-center gap-1.5 ${
            status === 'unsaved' && !busy
              ? 'text-amber-700 dark:text-amber-400'
              : 'text-brand-slate-gray dark:text-gray-400'
          }`}
        >
          {status === 'saved' && !busy && (
            <CheckCircleIcon aria-hidden="true" className="size-4" />
          )}
          <span>{statusText}</span>
        </p>
        {!isSaved && (
          <label
            htmlFor={ids.edition}
            className="flex items-center gap-2 text-brand-slate-gray dark:text-gray-300"
          >
            <input
              id={ids.edition}
              type="checkbox"
              checked={editionOnly}
              onChange={(e) => onEditionOnlyChange(e.target.checked)}
              className="size-4 rounded border-gray-300 text-brand-cloud-blue focus:ring-brand-cloud-blue dark:border-gray-600 dark:bg-gray-700"
            />
            For this edition only
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-brand-frosted-steel pt-3 dark:border-gray-700">
        <FolderOpenIcon
          aria-hidden="true"
          className="size-5 text-brand-slate-gray dark:text-gray-400"
        />
        <label htmlFor={ids.open} className="sr-only">
          Open a saved project
        </label>
        <select
          id={ids.open}
          value=""
          disabled={busy !== null || !rows || rows.length === 0}
          onChange={(e) => e.target.value && onOpen(e.target.value)}
          className={`${styles.input} min-w-0 flex-1 basis-48 py-1.5`}
        >
          <option value="">
            {rows === null
              ? 'Loading saved projects…'
              : rows.length === 0
                ? 'No saved projects yet'
                : 'Open a saved project…'}
          </option>
          {rows?.map((row) => (
            <option key={row._id} value={row._id}>
              {row.title || 'Untitled video'}
              {row.edition ? ` — ${row.edition}` : ''}
            </option>
          ))}
        </select>
        <AdminButton
          type="button"
          variant="ghost"
          size="sm"
          onClick={onNew}
          disabled={busy !== null}
          className="inline-flex items-center gap-1"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          New video
        </AdminButton>
      </div>

      {/* Mounted empty, so a message is announced when it arrives. */}
      <div role="alert" aria-live="assertive">
        {message?.tone === 'error' && (
          <div className="flex gap-2 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-900/30 dark:text-red-200">
            <ExclamationTriangleIcon
              aria-hidden="true"
              className="size-5 shrink-0"
            />
            <div className="space-y-2">
              <p>{message.text}</p>
              {message.action === 'save-as-new' && (
                <AdminButton
                  type="button"
                  variant="secondary"
                  size="xs"
                  onClick={onSaveAsNew}
                >
                  Save as a new project
                </AdminButton>
              )}
            </div>
          </div>
        )}
      </div>
      <p role="status" className="sr-only">
        {message?.tone === 'info' ? message.text : ''}
      </p>
      {message?.tone === 'info' && (
        <p
          aria-hidden="true"
          className="text-sm text-brand-slate-gray dark:text-gray-400"
        >
          {message.text}
        </p>
      )}
    </section>
  )
}
