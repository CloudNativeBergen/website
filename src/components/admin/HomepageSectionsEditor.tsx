'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline'
import { ModalShell } from '@/components/ModalShell'
import { AdminButton } from '@/components/admin/AdminButton'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import type { PortableTextBlock } from '@portabletext/editor'
import { api } from '@/lib/trpc/client'
import { useNotification } from './NotificationProvider'
import {
  HOMEPAGE_SECTION_TYPES,
  type HomepageSection,
  type HomepageSectionType,
} from '@/lib/homepage/sections'

/**
 * Front-page builder (F2) admin editor — PLAIN form editing of the homepage
 * section composition. F3 will add drag-and-drop; for now sections reorder with
 * up/down buttons, toggle visibility, and expose per-type config (hero copy +
 * CTA overrides, CTA banner, rich text, metrics heading). Content-free blocks
 * (featured speakers, program, organizers, sponsors, gallery) carry only their
 * visibility flag — their content still comes from the existing conference
 * sources. Saves via `conference.updateHomepageSections` and refreshes the card.
 *
 * "Reset to default" clears the stored list, so the page falls back to the
 * phase-aware default layout.
 */

const SECTION_LABELS: Record<HomepageSectionType, string> = {
  homepageHero: 'Hero',
  homepageFeaturedSpeakers: 'Featured Speakers',
  homepageProgramHighlights: 'Program Highlights',
  homepageOrganizers: 'Organizers',
  homepageSponsors: 'Sponsors',
  homepageGallery: 'Photo Gallery',
  homepageMetrics: 'Vanity Metrics',
  homepageCtaBanner: 'Call-to-action Banner',
  homepageRichText: 'Rich Text',
}

/** Working row shape — a superset of every block's fields, keyed for the list. */
interface EditorRow {
  _key: string
  _type: HomepageSectionType
  hidden?: boolean
  heroHeadline?: string
  heroSubheadline?: string
  ctaOverrides?: { _key: string; label: string; href: string }[]
  heading?: string
  body?: string
  buttonLabel?: string
  buttonHref?: string
  content?: PortableTextBlock[]
}

let keyCounter = 0
const nextKey = () => `hp-${Date.now()}-${++keyCounter}`

function toEditorRows(sections: HomepageSection[]): EditorRow[] {
  return sections.map((s) => {
    const row: EditorRow = {
      _key: s._key || nextKey(),
      _type: s._type,
      hidden: s.hidden,
    }
    if (s._type === 'homepageHero') {
      row.heroHeadline = s.heroHeadline
      row.heroSubheadline = s.heroSubheadline
      row.ctaOverrides = (s.ctaOverrides ?? []).map((c) => ({
        _key: c._key || nextKey(),
        label: c.label,
        href: c.href,
      }))
    } else if (s._type === 'homepageCtaBanner') {
      row.heading = s.heading
      row.body = s.body
      row.buttonLabel = s.buttonLabel
      row.buttonHref = s.buttonHref
    } else if (s._type === 'homepageRichText') {
      row.heading = s.heading
      row.content = (s.content as PortableTextBlock[]) ?? []
    } else if (s._type === 'homepageMetrics') {
      row.heading = s.heading
    }
    return row
  })
}

/** Build the mutation payload; empty strings are dropped by the server. */
function toPayload(rows: EditorRow[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { _type: row._type, _key: row._key }
    if (row.hidden) out.hidden = true
    switch (row._type) {
      case 'homepageHero':
        if (row.heroHeadline?.trim()) out.heroHeadline = row.heroHeadline.trim()
        if (row.heroSubheadline?.trim())
          out.heroSubheadline = row.heroSubheadline.trim()
        if (row.ctaOverrides && row.ctaOverrides.length > 0) {
          out.ctaOverrides = row.ctaOverrides
            .filter((c) => c.label.trim() && c.href.trim())
            .map((c) => ({
              _key: c._key,
              label: c.label.trim(),
              href: c.href.trim(),
            }))
        }
        break
      case 'homepageCtaBanner':
        out.heading = row.heading?.trim() ?? ''
        if (row.body?.trim()) out.body = row.body.trim()
        out.buttonLabel = row.buttonLabel?.trim() ?? ''
        out.buttonHref = row.buttonHref?.trim() ?? ''
        break
      case 'homepageRichText':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        out.content = row.content ?? []
        break
      case 'homepageMetrics':
        if (row.heading?.trim()) out.heading = row.heading.trim()
        break
      default:
        break
    }
    return out
  })
}

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const rowBtnClass =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800'

export interface HomepageSectionsEditorProps {
  /** Stored sections, or the computed default when none are stored yet. */
  initialSections: HomepageSection[]
  /** True when the conference has no stored composition (rendering the default). */
  usingDefault: boolean
  defaultOpen?: boolean
}

export function HomepageSectionsEditor({
  initialSections,
  usingDefault,
  defaultOpen = false,
}: HomepageSectionsEditorProps) {
  const router = useRouter()
  const utils = api.useUtils()
  const { showNotification } = useNotification()

  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [rows, setRows] = useState<EditorRow[]>(() =>
    toEditorRows(initialSections),
  )
  const [addType, setAddType] =
    useState<HomepageSectionType>('homepageCtaBanner')
  const [submitError, setSubmitError] = useState<string | null>(null)

  const mutation = api.conference.updateHomepageSections.useMutation({
    onSuccess: () => {
      void utils.invalidate()
      router.refresh()
      showNotification({
        type: 'success',
        title: 'Homepage updated',
        message: 'Section composition saved.',
      })
      setIsOpen(false)
    },
    onError: (error) => {
      setSubmitError(error.message || 'Failed to save. Please try again.')
      showNotification({
        type: 'error',
        title: 'Could not save',
        message: error.message || 'Failed to save homepage sections.',
      })
    },
  })

  const reset = () => {
    setRows(toEditorRows(initialSections))
    setSubmitError(null)
  }
  const open = () => {
    reset()
    setIsOpen(true)
  }
  const close = () => {
    setIsOpen(false)
    reset()
  }

  const patchRow = (key: string, patch: Partial<EditorRow>) =>
    setRows((prev) =>
      prev.map((r) => (r._key === key ? { ...r, ...patch } : r)),
    )
  const move = (from: number, to: number) => {
    if (to < 0 || to >= rows.length) return
    setRows((prev) => {
      const next = prev.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }
  const remove = (key: string) =>
    setRows((prev) => prev.filter((r) => r._key !== key))
  const add = () =>
    setRows((prev) => [...prev, { _key: nextKey(), _type: addType }])

  const validate = (): string | null => {
    for (const r of rows) {
      if (r._type === 'homepageCtaBanner') {
        if (!r.heading?.trim()) return 'CTA banner needs a heading.'
        if (!r.buttonLabel?.trim()) return 'CTA banner needs a button label.'
        if (!r.buttonHref?.trim()) return 'CTA banner needs a button link.'
      }
      if (r._type === 'homepageRichText') {
        if (!r.content || r.content.length === 0)
          return 'Rich text block needs content.'
      }
    }
    return null
  }

  const save = () => {
    setSubmitError(null)
    const err = validate()
    if (err) {
      setSubmitError(err)
      return
    }
    mutation.mutate({
      homepageSections: toPayload(rows) as never,
    })
  }

  const resetToDefault = () => {
    setSubmitError(null)
    mutation.mutate({ homepageSections: [] })
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Edit Homepage Sections"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue dark:text-gray-400 dark:hover:bg-gray-800"
      >
        <PencilSquareIcon className="h-5 w-5" />
      </button>

      <ModalShell
        isOpen={isOpen}
        onClose={close}
        size="3xl"
        title="Edit Homepage Sections"
        subtitle="Compose and order the front-page blocks"
        icon={<PencilSquareIcon className="h-5 w-5" />}
      >
        <div className="space-y-4">
          {usingDefault ? (
            <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              This conference uses the default layout. Saving a composition
              below overrides it; “Reset to default” restores the automatic
              layout.
            </p>
          ) : null}

          <ul className="space-y-3">
            {rows.map((row, index) => (
              <li
                key={row._key}
                className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {index + 1}. {SECTION_LABELS[row._type]}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className={rowBtnClass}
                      onClick={() =>
                        patchRow(row._key, { hidden: !row.hidden })
                      }
                      aria-label={
                        row.hidden
                          ? `Show ${SECTION_LABELS[row._type]}`
                          : `Hide ${SECTION_LABELS[row._type]}`
                      }
                      title={row.hidden ? 'Hidden — click to show' : 'Visible'}
                    >
                      {row.hidden ? (
                        <EyeSlashIcon className="h-5 w-5" />
                      ) : (
                        <EyeIcon className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      type="button"
                      className={rowBtnClass}
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      aria-label={`Move ${SECTION_LABELS[row._type]} up`}
                    >
                      <ChevronUpIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className={rowBtnClass}
                      onClick={() => move(index, index + 1)}
                      disabled={index === rows.length - 1}
                      aria-label={`Move ${SECTION_LABELS[row._type]} down`}
                    >
                      <ChevronDownIcon className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      className={`${rowBtnClass} hover:text-red-600`}
                      onClick={() => remove(row._key)}
                      aria-label={`Remove ${SECTION_LABELS[row._type]}`}
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                <SectionConfig
                  row={row}
                  onChange={(p) => patchRow(row._key, p)}
                />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={addType}
              onChange={(e) =>
                setAddType(e.target.value as HomepageSectionType)
              }
              aria-label="Section type to add"
              className={`${inputClass} w-auto`}
            >
              {HOMEPAGE_SECTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {SECTION_LABELS[t]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={add}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300"
            >
              <PlusIcon className="h-5 w-5" />
              Add section
            </button>
          </div>

          {submitError ? (
            <p
              role="alert"
              className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {submitError}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-between">
            <AdminButton
              type="button"
              variant="secondary"
              size="md"
              onClick={resetToDefault}
              disabled={mutation.isPending}
              className="min-h-[44px]"
            >
              Reset to default
            </AdminButton>
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <AdminButton
                type="button"
                variant="secondary"
                size="md"
                onClick={close}
                disabled={mutation.isPending}
                className="min-h-[44px]"
              >
                Cancel
              </AdminButton>
              <AdminButton
                type="button"
                color="blue"
                size="md"
                onClick={save}
                disabled={mutation.isPending}
                className="min-h-[44px]"
              >
                {mutation.isPending ? 'Saving…' : 'Save'}
              </AdminButton>
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  )
}

/** Per-type config editor. Content-free blocks render an explanatory line only. */
function SectionConfig({
  row,
  onChange,
}: {
  row: EditorRow
  onChange: (patch: Partial<EditorRow>) => void
}) {
  if (row._type === 'homepageHero') {
    const ctas = row.ctaOverrides ?? []
    return (
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={row.heroHeadline ?? ''}
          onChange={(e) => onChange({ heroHeadline: e.target.value })}
          placeholder="Headline override (optional)"
          aria-label="Hero headline override"
          className={inputClass}
        />
        <textarea
          value={row.heroSubheadline ?? ''}
          onChange={(e) => onChange({ heroSubheadline: e.target.value })}
          placeholder="Subheadline override (optional)"
          aria-label="Hero subheadline override"
          rows={2}
          className={inputClass}
        />
        <p className="text-xs text-gray-500 dark:text-gray-400">
          CTA button overrides (optional — leave empty for smart phase buttons):
        </p>
        {ctas.map((cta, i) => (
          <div key={cta._key} className="flex items-start gap-1">
            <input
              type="text"
              value={cta.label}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, label: e.target.value } : c,
                  ),
                })
              }
              placeholder="Label"
              aria-label={`CTA ${i + 1} label`}
              className={inputClass}
            />
            <input
              type="text"
              value={cta.href}
              onChange={(e) =>
                onChange({
                  ctaOverrides: ctas.map((c, j) =>
                    j === i ? { ...c, href: e.target.value } : c,
                  ),
                })
              }
              placeholder="/tickets"
              aria-label={`CTA ${i + 1} link`}
              className={inputClass}
            />
            <button
              type="button"
              className={`${rowBtnClass} hover:text-red-600`}
              onClick={() =>
                onChange({ ctaOverrides: ctas.filter((_, j) => j !== i) })
              }
              aria-label={`Remove CTA ${i + 1}`}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange({
              ctaOverrides: [...ctas, { _key: nextKey(), label: '', href: '' }],
            })
          }
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand-cloud-blue"
        >
          <PlusIcon className="h-4 w-4" /> Add CTA
        </button>
      </div>
    )
  }

  if (row._type === 'homepageCtaBanner') {
    return (
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading *"
          aria-label="CTA banner heading"
          className={inputClass}
        />
        <textarea
          value={row.body ?? ''}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="Body (optional)"
          aria-label="CTA banner body"
          rows={2}
          className={inputClass}
        />
        <div className="flex gap-2">
          <input
            type="text"
            value={row.buttonLabel ?? ''}
            onChange={(e) => onChange({ buttonLabel: e.target.value })}
            placeholder="Button label *"
            aria-label="CTA banner button label"
            className={inputClass}
          />
          <input
            type="text"
            value={row.buttonHref ?? ''}
            onChange={(e) => onChange({ buttonHref: e.target.value })}
            placeholder="Button link *"
            aria-label="CTA banner button link"
            className={inputClass}
          />
        </div>
      </div>
    )
  }

  if (row._type === 'homepageRichText') {
    return (
      <div className="mt-3 space-y-2">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Rich text heading"
          className={inputClass}
        />
        <PortableTextEditor
          label="Content"
          value={row.content ?? []}
          onChange={(blocks) => onChange({ content: blocks })}
          compact
        />
      </div>
    )
  }

  if (row._type === 'homepageMetrics') {
    return (
      <div className="mt-3">
        <input
          type="text"
          value={row.heading ?? ''}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Heading (optional)"
          aria-label="Metrics heading"
          className={inputClass}
        />
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Uses the vanity metrics configured elsewhere on this page.
        </p>
      </div>
    )
  }

  return (
    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
      Content comes from the existing conference configuration.
    </p>
  )
}
