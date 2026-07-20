'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { InlineSvg } from '@/components/InlineSvg'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import type { BrandingSlot } from '@/server/schemas/conference'

/**
 * SE-3 — the Branding logos editor island + read-only preview grid.
 *
 * The conference stores four `inlineSvg` logo slots as raw SVG STRINGS. This
 * island uploads/replaces/removes them: a `.svg` file is read to text, dry-run
 * sanitized via `conference.sanitizeSvgPreview` (so the organizer sees the
 * exact stored markup AND what was stripped BEFORE saving), then persisted
 * per-slot via `conference.updateBrandingLogo`. The server is the authority —
 * it re-sanitizes on write regardless of what the preview showed.
 */

export interface BrandingValues {
  logoBright?: string | null
  logoDark?: string | null
  logomarkBright?: string | null
  logomarkDark?: string | null
}

interface SlotMeta {
  slot: BrandingSlot
  label: string
  /** Which background this logo is designed to sit on. */
  tone: 'light' | 'dark'
  variant: 'horizontal' | 'mark'
  hint: string
}

const SLOTS: readonly SlotMeta[] = [
  {
    slot: 'logoBright',
    label: 'Logo — Light Mode',
    tone: 'light',
    variant: 'horizontal',
    hint: 'Horizontal logo for light backgrounds.',
  },
  {
    slot: 'logoDark',
    label: 'Logo — Dark Mode',
    tone: 'dark',
    variant: 'horizontal',
    hint: 'Horizontal logo for dark backgrounds.',
  },
  {
    slot: 'logomarkBright',
    label: 'Logo Mark — Light Mode',
    tone: 'light',
    variant: 'mark',
    hint: 'Icon-only mark for light backgrounds.',
  },
  {
    slot: 'logomarkDark',
    label: 'Logo Mark — Dark Mode',
    tone: 'dark',
    variant: 'mark',
    hint: 'Icon-only mark for dark backgrounds.',
  },
]

/**
 * A logo preview on a checkerboard so transparency is obvious, tinted for the
 * background the slot targets (light vs dark). Renders an empty placeholder when
 * the slot is unset.
 */
export function BrandingLogoFrame({
  svg,
  tone,
  variant,
}: {
  svg?: string | null
  tone: 'light' | 'dark'
  variant: 'horizontal' | 'mark'
}) {
  // A CSS checkerboard — light and dark variants use different tile colors.
  const checker =
    tone === 'dark'
      ? 'repeating-conic-gradient(#1f2937 0 25%, #111827 0 50%)'
      : 'repeating-conic-gradient(#e5e7eb 0 25%, #f9fafb 0 50%)'
  return (
    <div
      className={`flex items-center justify-center overflow-hidden rounded-md border ${
        tone === 'dark' ? 'border-gray-700' : 'border-gray-200'
      } ${variant === 'mark' ? 'h-24 w-24' : 'h-24 w-full'}`}
      style={{ backgroundImage: checker, backgroundSize: '16px 16px' }}
    >
      {svg ? (
        <InlineSvg
          value={svg}
          style={{ maxHeight: '72px', maxWidth: '90%', width: 'auto' }}
        />
      ) : (
        <span
          className={`text-xs font-medium ${
            tone === 'dark' ? 'text-gray-400' : 'text-gray-500'
          }`}
        >
          Not set
        </span>
      )}
    </div>
  )
}

/**
 * Read-only 2×2 grid of the four branding slots — rendered in the settings
 * InfoCard body. Server-supplied values; refreshes after a save.
 */
export function BrandingPreviewGrid({ values }: { values: BrandingValues }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {SLOTS.map((meta) => (
        <div key={meta.slot} className="space-y-1.5">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {meta.label}
          </p>
          <BrandingLogoFrame
            svg={values[meta.slot]}
            tone={meta.tone}
            variant={meta.variant}
          />
        </div>
      ))}
    </div>
  )
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'))
    reader.readAsText(file)
  })
}

/** A pending change to one slot. `svg: null` means "remove". */
export interface SlotDraft {
  svg: string | null
  removed: string[]
  error?: string
}

export interface BrandingEditorProps {
  initialValues: BrandingValues
  /** Render the modal open on mount — for stories/tests only. */
  defaultOpen?: boolean
  /** Seed the pending-edit state — for stories/tests only. */
  defaultDrafts?: Partial<Record<BrandingSlot, SlotDraft>>
}

export function BrandingEditor({
  initialValues,
  defaultOpen = false,
  defaultDrafts = {},
}: BrandingEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  // Per-slot pending edits; an absent key means "unchanged".
  const [drafts, setDrafts] =
    useState<Partial<Record<BrandingSlot, SlotDraft>>>(defaultDrafts)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const previewMutation = api.conference.sanitizeSvgPreview.useMutation()
  const saveMutation = api.conference.updateBrandingLogo.useMutation()

  const isDirty = Object.keys(drafts).length > 0
  const isBusy = saveMutation.isPending

  const reset = () => {
    setDrafts({})
    setSubmitError(null)
  }
  const openModal = () => {
    reset()
    setIsOpen(true)
  }
  const closeModal = () => {
    setIsOpen(false)
    reset()
  }

  const effectiveValue = (slot: BrandingSlot): string | null => {
    const draft = drafts[slot]
    if (draft) return draft.svg
    return initialValues[slot] ?? null
  }

  const handleFile = async (slot: BrandingSlot, file: File | undefined) => {
    if (!file) return
    const isSvg =
      file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')
    if (!isSvg) {
      setDrafts((prev) => ({
        ...prev,
        [slot]: { svg: null, removed: [], error: 'Please choose an SVG file.' },
      }))
      return
    }
    try {
      const text = await readFileAsText(file)
      const result = await previewMutation.mutateAsync({ svg: text })
      if (!result.ok || !result.svg) {
        setDrafts((prev) => ({
          ...prev,
          [slot]: {
            svg: null,
            removed: [],
            error: result.error ?? 'The SVG could not be used.',
          },
        }))
        return
      }
      setDrafts((prev) => ({
        ...prev,
        [slot]: { svg: result.svg, removed: result.removed },
      }))
    } catch {
      setDrafts((prev) => ({
        ...prev,
        [slot]: {
          svg: null,
          removed: [],
          error: 'Could not read or sanitize the file.',
        },
      }))
    }
  }

  const removeSlot = (slot: BrandingSlot) =>
    setDrafts((prev) => ({ ...prev, [slot]: { svg: null, removed: [] } }))

  const undoSlot = (slot: BrandingSlot) =>
    setDrafts((prev) => {
      const next = { ...prev }
      delete next[slot]
      return next
    })

  const handleSave = async () => {
    setSubmitError(null)
    const entries = Object.entries(drafts) as [BrandingSlot, SlotDraft][]
    const toSave = entries.filter(([, d]) => !d.error)
    if (toSave.length === 0) return
    try {
      for (const [slot, draft] of toSave) {
        await saveMutation.mutateAsync({ slot, svg: draft.svg })
      }
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Branding updated',
        message: 'Conference logos were saved.',
      })
      setIsOpen(false)
      reset()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save logos.'
      setSubmitError(message)
      showNotification({
        type: 'error',
        title: 'Could not save',
        message,
      })
    }
  }

  const hasBlockingError = Object.values(drafts).some((d) => d?.error)

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label="Edit Branding"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={closeModal}
        size="2xl"
        title="Edit Branding"
        subtitle="Upload the conference logos (SVG). Empty slots fall back to defaults."
        icon={<PencilSquareIcon className="h-5 w-5" />}
        confirmOnDirtyClose
        isDirty={isDirty && !isBusy}
      >
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            void handleSave()
          }}
          className="space-y-5"
        >
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {SLOTS.map((meta) => (
              <BrandingSlotEditor
                key={meta.slot}
                meta={meta}
                value={effectiveValue(meta.slot)}
                draft={drafts[meta.slot]}
                dirty={meta.slot in drafts}
                onFile={(file) => void handleFile(meta.slot, file)}
                onRemove={() => removeSlot(meta.slot)}
                onUndo={() => undoSlot(meta.slot)}
              />
            ))}
          </div>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={closeModal}
              disabled={isBusy}
              className="min-h-[44px]"
            >
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              color="blue"
              size="md"
              disabled={isBusy || !isDirty || hasBlockingError}
              className="min-h-[44px]"
            >
              {isBusy ? 'Saving…' : 'Save logos'}
            </AdminButton>
          </div>
        </form>
      </ModalShell>
    </>
  )
}

function BrandingSlotEditor({
  meta,
  value,
  draft,
  dirty,
  onFile,
  onRemove,
  onUndo,
}: {
  meta: SlotMeta
  value: string | null
  draft?: SlotDraft
  dirty: boolean
  onFile: (file: File | undefined) => void
  onRemove: () => void
  onUndo: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        {meta.label}
      </legend>

      <BrandingLogoFrame svg={value} tone={meta.tone} variant={meta.variant} />

      <p className="text-xs text-gray-500 dark:text-gray-400">{meta.hint}</p>

      {draft?.error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {draft.error}
        </p>
      ) : null}

      {draft && !draft.error && draft.removed.length > 0 ? (
        <div className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <ExclamationTriangleIcon
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <span>
            Sanitized before saving — removed: {draft.removed.join(', ')}.
          </span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          aria-label={`Upload ${meta.label}`}
          onChange={(e) => {
            onFile(e.target.files?.[0])
            // Allow re-selecting the same file.
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-200"
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
          {value ? 'Replace' : 'Upload'}
        </button>
        {value ? (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <TrashIcon className="h-4 w-4" />
            Remove
          </button>
        ) : null}
        {dirty ? (
          <button
            type="button"
            onClick={onUndo}
            className="ml-auto text-xs font-medium text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            Undo
          </button>
        ) : null}
      </div>
    </fieldset>
  )
}
