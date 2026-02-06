'use client'

import { useState, useMemo, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { useNotification } from '@/components/admin'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import {
  CATEGORY_LABELS,
  TEMPLATE_VARIABLE_DESCRIPTIONS,
  processTemplateVariables,
  processPortableTextVariables,
  buildTemplateVariables,
} from '@/lib/sponsor/templates'
import type {
  SponsorEmailTemplate,
  TemplateCategory,
  PortableTextBlock as TemplateBlock,
} from '@/lib/sponsor/types'
import type { PortableTextBlock } from '@portabletext/editor'
import type { PortableTextBlock as RenderBlock } from '@portabletext/types'
import type { Conference } from '@/lib/conference/types'
import { formatConferenceDateLong } from '@/lib/time'
import {
  ArrowLeftIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline'
import { ChevronDownIcon } from '@heroicons/react/16/solid'

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [
  TemplateCategory,
  string,
][]

interface SponsorEmailTemplateEditorProps {
  conference: Conference
  template?: SponsorEmailTemplate
  onClose: () => void
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function SponsorEmailTemplateEditor({
  conference,
  template,
  onClose,
}: SponsorEmailTemplateEditorProps) {
  const isEditing = !!template
  const { showNotification } = useNotification()

  const [title, setTitle] = useState(template?.title ?? '')
  const [slug, setSlug] = useState(template?.slug?.current ?? '')
  const [category, setCategory] = useState<TemplateCategory>(
    template?.category ?? 'cold-outreach',
  )
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState<PortableTextBlock[]>(
    (template?.body as unknown as PortableTextBlock[]) ?? [],
  )
  const [description, setDescription] = useState(template?.description ?? '')
  const [isDefault, setIsDefault] = useState(template?.is_default ?? false)
  const [sortOrder, setSortOrder] = useState(template?.sort_order ?? 0)
  const [autoSlug, setAutoSlug] = useState(!isEditing)

  const [editorKey] = useState(0)

  const createMutation = api.sponsor.emailTemplates.create.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template created',
        message: `"${title}" has been created`,
      })
      onClose()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Create failed',
        message: error.message,
      })
    },
  })

  const updateMutation = api.sponsor.emailTemplates.update.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template updated',
        message: `"${title}" has been saved`,
      })
      onClose()
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message,
      })
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  const handleTitleChange = (value: string) => {
    setTitle(value)
    if (autoSlug) {
      setSlug(slugify(value))
    }
  }

  const handleSubmit = () => {
    if (!title.trim() || !slug.trim() || !subject.trim()) {
      showNotification({
        type: 'warning',
        title: 'Validation error',
        message: 'Title, slug, and subject are required',
      })
      return
    }

    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      category,
      subject: subject.trim(),
      body:
        body.length > 0
          ? (body as unknown as Record<string, unknown>[])
          : undefined,
      description: description.trim() || undefined,
      is_default: isDefault,
      sort_order: sortOrder,
    }

    if (isEditing && template) {
      updateMutation.mutate({ id: template._id, ...payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  // Preview variables using real conference data + sample sponsor
  const previewVariables = useMemo(
    () =>
      buildTemplateVariables({
        sponsorName: 'Acme Corp',
        contactNames: 'Tonje, Marius og Torjus',
        conference: {
          title: conference.title,
          start_date: conference.start_date,
          city: conference.city,
          organizer: conference.organizer,
          domains: conference.domains,
          prospectus_url: conference.sponsorship_customization?.prospectus_url,
        },
        senderName: 'Hans Kristian',
        tierName: 'Community Partner',
        formatDate: formatConferenceDateLong,
      }),
    [conference],
  )

  const previewSubject = useMemo(
    () => processTemplateVariables(subject, previewVariables),
    [subject, previewVariables],
  )

  const previewBody = useMemo(
    () =>
      processPortableTextVariables(
        body as unknown as TemplateBlock[],
        previewVariables,
      ),
    [body, previewVariables],
  )

  const previewHTML = useMemo(
    () => portableTextToHTML(previewBody as unknown as RenderBlock[]),
    [previewBody],
  )

  const handleInsertVariable = useCallback(
    (varName: string) => {
      navigator.clipboard?.writeText(`{{{${varName}}}}`)
      showNotification({
        type: 'info',
        title: 'Variable copied',
        message: `{{{${varName}}}} copied to clipboard. Paste it into the editor.`,
      })
    },
    [showNotification],
  )

  return (
    <div className="mt-6">
      {/* Sub-header with back link and actions */}
      <div className="mb-6 flex items-center justify-between">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to templates
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50"
          >
            {isPending
              ? 'Saving...'
              : isEditing
                ? 'Save Changes'
                : 'Create Template'}
          </button>
        </div>
      </div>

      <h2 className="mb-6 text-lg font-bold text-gray-900 dark:text-white">
        {isEditing ? `Edit: ${template.title}` : 'New Email Template'}
      </h2>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Editor (3/5) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Meta fields */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="e.g. Cold Outreach (English)"
                  className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setAutoSlug(false)
                    setSlug(e.target.value)
                  }}
                  placeholder="cold-outreach-en"
                  className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Category
                </label>
                <div className="mt-2 grid grid-cols-1">
                  <select
                    value={category}
                    onChange={(e) =>
                      setCategory(e.target.value as TemplateCategory)
                    }
                    className="col-start-1 row-start-1 w-full appearance-none rounded-md bg-white py-1.5 pr-8 pl-3 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:*:bg-gray-800 dark:focus:outline-indigo-500"
                  >
                    {CATEGORY_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="pointer-events-none col-start-1 row-start-1 mr-2 size-5 self-center justify-self-end text-gray-500 sm:size-4 dark:text-gray-400"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                  className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Internal notes on when to use this template"
                className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-6 shrink-0 items-center">
                <div className="group grid size-4 grid-cols-1">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="col-start-1 row-start-1 appearance-none rounded-sm border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:border-gray-600 dark:bg-white/5 dark:checked:border-indigo-500 dark:checked:bg-indigo-500 dark:focus-visible:outline-indigo-500"
                  />
                  <svg
                    fill="none"
                    viewBox="0 0 14 14"
                    className="pointer-events-none col-start-1 row-start-1 size-3.5 self-center justify-self-center stroke-white group-has-disabled:stroke-gray-950/25"
                  >
                    <path
                      d="M3 8L6 11L11 3.5"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-0 group-has-checked:opacity-100"
                    />
                  </svg>
                </div>
              </div>
              <label className="text-sm/6 font-medium text-gray-900 dark:text-white">
                Default template for this category
              </label>
            </div>
          </div>

          {/* Subject */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Partnership opportunity: {{{CONFERENCE_TITLE}}}"
              className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
            />
          </div>

          {/* Body editor */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <PortableTextEditor
              key={editorKey}
              label="Email Body"
              value={body}
              onChange={setBody}
              forceRemountKey={editorKey}
              helpText="Use {{{VARIABLE_NAME}}} syntax for dynamic content. Click a variable below to copy it."
            />
          </div>

          {/* Variable reference */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              Available Variables
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(TEMPLATE_VARIABLE_DESCRIPTIONS).map(
                ([key, desc]) => (
                  <button
                    key={key}
                    onClick={() => handleInsertVariable(key)}
                    title={desc}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-xs text-gray-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/20 dark:hover:text-indigo-300"
                  >
                    <ClipboardDocumentIcon className="h-3 w-3" />
                    {`{{{${key}}}}`}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview (2/5) */}
        <div className="lg:col-span-2">
          <div className="sticky top-20 rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-200 px-5 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Preview
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Sample data: Acme Corp &middot; Tonje, Marius og Torjus
              </p>
            </div>
            <div className="p-5">
              {/* Subject preview */}
              {subject && (
                <div className="mb-4 border-b border-gray-100 pb-3 dark:border-gray-700">
                  <p className="text-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
                    Subject
                  </p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                    {previewSubject}
                  </p>
                </div>
              )}

              {/* Body preview — matches email rendering */}
              <div
                style={{
                  maxWidth: 600,
                  fontFamily:
                    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontSize: 16,
                  lineHeight: 1.6,
                  color: '#334155',
                }}
              >
                {previewBody.length > 0 ? (
                  <div dangerouslySetInnerHTML={{ __html: previewHTML }} />
                ) : (
                  <p
                    style={{
                      color: '#9ca3af',
                      fontStyle: 'italic',
                      fontSize: 14,
                    }}
                  >
                    Start typing to see a preview...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
