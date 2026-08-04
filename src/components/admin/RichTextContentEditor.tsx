'use client'

import { useCallback, useState } from 'react'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  TrashIcon,
} from '@heroicons/react/24/outline'
import type { PortableTextBlock } from '@portabletext/editor'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import {
  emptyRichTextBlock,
  sanitizeRichTextContent,
  fromRichTextSegments,
  nextRichTextKey,
  RICH_TEXT_CALLOUT_TONES,
  RICH_TEXT_CODE_LANGUAGES,
  RICH_TEXT_IMAGE_MIME_TYPES,
  RICH_TEXT_LIMITS,
  RICH_TEXT_OBJECT_LABELS,
  RICH_TEXT_OBJECT_TYPES,
  toRichTextSegments,
  type RichTextCalloutBlock,
  type RichTextCodeBlock,
  type RichTextContentBlock,
  type RichTextImageBlock,
  type RichTextObjectBlock,
  type RichTextObjectType,
  type RichTextProseBlock,
  type RichTextSegment,
  type RichTextTableBlock,
} from '@/lib/homepage/richText'
import { richTextImageUrl } from '@/lib/homepage/richTextImage'

/**
 * The organizer-facing editor for the homepage Rich Text block.
 *
 * The stored value is ONE ordered array, but the prose editor only understands
 * `block` items — so the working shape is a list of SEGMENTS (see
 * `toRichTextSegments`): contiguous prose collapses into one editor instance,
 * each code/image/table/callout block gets its own card, and order is preserved.
 * That is what lets an organizer put a paragraph BETWEEN two code blocks rather
 * than appending everything to the end.
 *
 * Segments are local state, seeded once from `value` and pushed back up
 * flattened — the same uncontrolled contract `PortableTextEditor` already has
 * (it only reads `initialValue`), so a parent re-render never steals the cursor.
 *
 * The help text is deliberately blunt about the boundary. An organizer who does
 * not know that pasted HTML will be dropped will find out by losing work.
 */

const inputClass =
  'block w-full min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors focus:border-brand-cloud-blue focus:ring-1 focus:ring-brand-cloud-blue focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white'
const iconBtnClass =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cloud-blue disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-400 dark:hover:bg-gray-800'
const addBtnClass =
  'inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-cloud-blue hover:text-brand-cloud-blue dark:border-gray-600 dark:text-gray-300'

/**
 * The file picker and its help line are DERIVED from the same allowlist the
 * upload route enforces (`RICH_TEXT_IMAGE_MIME_TYPES`) — a second, hand-written
 * list is exactly how the picker came to omit AVIF while the API accepted it.
 * Adding a type to the allowlist now updates both automatically.
 */
const IMAGE_ACCEPT = RICH_TEXT_IMAGE_MIME_TYPES.join(',')

/** House casing where a type has one; anything new falls back to caps. */
const IMAGE_FORMAT_NAMES: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
}
const IMAGE_FORMATS = RICH_TEXT_IMAGE_MIME_TYPES.map(
  (type) =>
    IMAGE_FORMAT_NAMES[type] ?? type.replace('image/', '').toUpperCase(),
)
const IMAGE_FORMAT_LIST =
  IMAGE_FORMATS.length > 1
    ? `${IMAGE_FORMATS.slice(0, -1).join(', ')} or ${IMAGE_FORMATS[IMAGE_FORMATS.length - 1]}`
    : IMAGE_FORMATS[0]

export interface RichTextContentEditorProps {
  value: RichTextContentBlock[] | undefined
  onChange: (blocks: RichTextContentBlock[]) => void
}

export function RichTextContentEditor({
  value,
  onChange,
}: RichTextContentEditorProps) {
  const [segments, setSegments] = useState<RichTextSegment[]>(() =>
    toRichTextSegments(value),
  )

  const commit = useCallback(
    (next: RichTextSegment[]) => {
      setSegments(next)
      onChange(fromRichTextSegments(next))
    },
    [onChange],
  )

  const replaceAt = useCallback(
    (index: number, segment: RichTextSegment) =>
      commit(segments.map((s, i) => (i === index ? segment : s))),
    [commit, segments],
  )

  const move = (index: number, delta: number) => {
    const to = index + delta
    if (to < 0 || to >= segments.length) return
    const next = [...segments]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved)
    commit(next)
  }

  const remove = (index: number) =>
    commit(segments.filter((_, i) => i !== index))

  const addProse = () =>
    commit([
      ...segments,
      { kind: 'prose', _key: nextRichTextKey('prose'), blocks: [] },
    ])

  const addObject = (type: RichTextObjectType) =>
    commit([
      ...segments,
      {
        kind: 'object',
        _key: nextRichTextKey(type),
        block: emptyRichTextBlock(type),
      },
    ])

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Text, headings, lists, links, images, code, tables and callouts. This is
        the one free-form block on the homepage &mdash; but it is{' '}
        <strong className="font-semibold">not an HTML block</strong>: pasted
        markup, scripts, iframes, embedded videos and third-party widgets are
        stripped out as you paste them. Images must be uploaded here so they are
        served from our own CDN &mdash; SVG files and images hosted elsewhere
        are refused with an error.
      </p>

      {segments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Nothing here yet. Add a piece of content below.
        </p>
      ) : null}

      {segments.map((segment, index) => (
        <div
          key={segment._key}
          className="rounded-xl border border-gray-200 p-3 dark:border-gray-700"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
              {segment.kind === 'prose'
                ? 'Text'
                : RICH_TEXT_OBJECT_LABELS[segment.block._type]}
            </span>
            <div className="flex items-center">
              <button
                type="button"
                className={iconBtnClass}
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label="Move up"
              >
                <ArrowUpIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={iconBtnClass}
                onClick={() => move(index, 1)}
                disabled={index === segments.length - 1}
                aria-label="Move down"
              >
                <ArrowDownIcon className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={iconBtnClass}
                onClick={() => remove(index)}
                aria-label="Remove"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          {segment.kind === 'prose' ? (
            <PortableTextEditor
              label=""
              // The prose editor speaks `PortableTextBlock` (an open index
              // signature); our model is the CLOSED subset of it. Casting at
              // this one boundary is safe in both directions — the sanitizer
              // re-narrows whatever comes back out.
              value={segment.blocks as unknown as PortableTextBlock[]}
              onChange={(blocks) =>
                replaceAt(index, {
                  ...segment,
                  blocks: sanitizeRichTextContent(blocks).filter(
                    (b): b is RichTextProseBlock => b._type === 'block',
                  ),
                })
              }
              compact
            />
          ) : (
            <ObjectSegmentFields
              block={segment.block}
              onChange={(block) => replaceAt(index, { ...segment, block })}
            />
          )}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className={addBtnClass} onClick={addProse}>
          + Text
        </button>
        {RICH_TEXT_OBJECT_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={addBtnClass}
            onClick={() => addObject(type)}
          >
            + {RICH_TEXT_OBJECT_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  )
}

function ObjectSegmentFields({
  block,
  onChange,
}: {
  block: RichTextObjectBlock
  onChange: (block: RichTextObjectBlock) => void
}) {
  switch (block._type) {
    case 'richTextCode':
      return <CodeFields block={block} onChange={onChange} />
    case 'richTextImage':
      return <ImageFields block={block} onChange={onChange} />
    case 'richTextTable':
      return <TableFields block={block} onChange={onChange} />
    case 'richTextCallout':
      return <CalloutFields block={block} onChange={onChange} />
  }
}

function CodeFields({
  block,
  onChange,
}: {
  block: RichTextCodeBlock
  onChange: (block: RichTextCodeBlock) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={block.language}
          onChange={(e) =>
            onChange({
              ...block,
              language: e.target.value as RichTextCodeBlock['language'],
            })
          }
          aria-label="Code language"
          className={`${inputClass} sm:w-44`}
        >
          {RICH_TEXT_CODE_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang === 'text' ? 'Plain text' : lang}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={block.filename ?? ''}
          maxLength={RICH_TEXT_LIMITS.filename}
          onChange={(e) => onChange({ ...block, filename: e.target.value })}
          placeholder="Filename (optional), e.g. venue.yaml"
          aria-label="Code filename"
          className={inputClass}
        />
      </div>
      <textarea
        value={block.code}
        rows={8}
        maxLength={RICH_TEXT_LIMITS.code}
        onChange={(e) => onChange({ ...block, code: e.target.value })}
        placeholder="Pasted as-is and shown as text — never run."
        aria-label="Code"
        className={`${inputClass} font-mono`}
      />
    </div>
  )
}

function ImageFields({
  block,
  onChange,
}: {
  block: RichTextImageBlock
  onChange: (block: RichTextImageBlock) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previewUrl = block.asset._ref
    ? richTextImageUrl(block.asset._ref, 480)
    : ''

  const upload = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/admin/rich-text-image', {
        method: 'POST',
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Upload failed')
      onChange({
        ...block,
        asset: { _type: 'reference', _ref: data.assetId as string },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      {previewUrl ? (
        // Plain <img>: an admin preview of a just-uploaded Sanity asset, with
        // no layout budget to justify next/image.
        <img
          src={previewUrl}
          alt=""
          className="max-h-40 w-auto rounded-lg border border-gray-200 dark:border-gray-700"
        />
      ) : null}
      <input
        type="file"
        accept={IMAGE_ACCEPT}
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void upload(file)
        }}
        aria-label="Upload image"
        className="block w-full text-xs text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-medium dark:text-gray-300 dark:file:bg-gray-700 dark:file:text-white"
      />
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {IMAGE_FORMAT_LIST}, up to 8&nbsp;MB. SVG and links to images on other
        sites are not accepted.
      </p>
      {uploading ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Uploading…</p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      <input
        type="text"
        value={block.alt}
        maxLength={RICH_TEXT_LIMITS.alt}
        onChange={(e) => onChange({ ...block, alt: e.target.value })}
        placeholder="Alt text (describe the image for screen readers)"
        aria-label="Image alt text"
        className={inputClass}
      />
      <input
        type="text"
        value={block.caption ?? ''}
        maxLength={RICH_TEXT_LIMITS.caption}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Caption (optional)"
        aria-label="Image caption"
        className={inputClass}
      />
    </div>
  )
}

function TableFields({
  block,
  onChange,
}: {
  block: RichTextTableBlock
  onChange: (block: RichTextTableBlock) => void
}) {
  const columns = Math.max(...block.rows.map((r) => r.cells.length), 1)

  const setCell = (rowIndex: number, cellIndex: number, text: string) =>
    onChange({
      ...block,
      rows: block.rows.map((row, i) =>
        i === rowIndex
          ? {
              ...row,
              cells: row.cells.map((c, j) => (j === cellIndex ? text : c)),
            }
          : row,
      ),
    })

  const addRow = () =>
    onChange({
      ...block,
      rows: [
        ...block.rows,
        { _key: nextRichTextKey('r'), cells: Array(columns).fill('') },
      ],
    })

  const removeRow = (rowIndex: number) =>
    onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIndex) })

  const addColumn = () =>
    onChange({
      ...block,
      rows: block.rows.map((row) => ({ ...row, cells: [...row.cells, ''] })),
    })

  const removeColumn = () =>
    onChange({
      ...block,
      rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.slice(0, -1),
      })),
    })

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
        <input
          type="checkbox"
          checked={block.headerRow}
          onChange={(e) => onChange({ ...block, headerRow: e.target.checked })}
        />
        First row is a header
      </label>
      <div className="space-y-1 overflow-x-auto">
        {block.rows.map((row, rowIndex) => (
          <div key={row._key} className="flex items-center gap-1">
            {row.cells.map((cell, cellIndex) => (
              <input
                key={cellIndex}
                type="text"
                value={cell}
                maxLength={RICH_TEXT_LIMITS.tableCell}
                onChange={(e) => setCell(rowIndex, cellIndex, e.target.value)}
                aria-label={`Row ${rowIndex + 1} column ${cellIndex + 1}`}
                className={`${inputClass} min-w-32`}
              />
            ))}
            {/* Sticky so the delete control stays reachable on a phone when the
                cells scroll sideways — otherwise it hides past the right edge. */}
            <button
              type="button"
              className={`${iconBtnClass} sticky right-0 bg-white dark:bg-gray-800`}
              onClick={() => removeRow(rowIndex)}
              disabled={block.rows.length <= 1}
              aria-label={`Remove row ${rowIndex + 1}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={addBtnClass}
          onClick={addRow}
          disabled={block.rows.length >= RICH_TEXT_LIMITS.tableRows}
        >
          + Row
        </button>
        <button
          type="button"
          className={addBtnClass}
          onClick={addColumn}
          disabled={columns >= RICH_TEXT_LIMITS.tableColumns}
        >
          + Column
        </button>
        <button
          type="button"
          className={addBtnClass}
          onClick={removeColumn}
          disabled={columns <= 1}
        >
          &minus; Column
        </button>
      </div>
      <input
        type="text"
        value={block.caption ?? ''}
        maxLength={RICH_TEXT_LIMITS.caption}
        onChange={(e) => onChange({ ...block, caption: e.target.value })}
        placeholder="Caption (optional)"
        aria-label="Table caption"
        className={inputClass}
      />
    </div>
  )
}

function CalloutFields({
  block,
  onChange,
}: {
  block: RichTextCalloutBlock
  onChange: (block: RichTextCalloutBlock) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={block.tone}
          onChange={(e) =>
            onChange({
              ...block,
              tone: e.target.value as RichTextCalloutBlock['tone'],
            })
          }
          aria-label="Callout tone"
          className={`${inputClass} sm:w-40`}
        >
          {RICH_TEXT_CALLOUT_TONES.map((tone) => (
            <option key={tone} value={tone}>
              {tone[0].toUpperCase() + tone.slice(1)}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={block.title ?? ''}
          maxLength={RICH_TEXT_LIMITS.calloutTitle}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Title (optional)"
          aria-label="Callout title"
          className={inputClass}
        />
      </div>
      <textarea
        value={block.body}
        rows={3}
        maxLength={RICH_TEXT_LIMITS.calloutBody}
        onChange={(e) => onChange({ ...block, body: e.target.value })}
        placeholder="Plain text — line breaks are kept, formatting and links are not."
        aria-label="Callout body"
        className={inputClass}
      />
    </div>
  )
}
