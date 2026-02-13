'use client'

import { useState, useMemo, useCallback } from 'react'
import { api } from '@/lib/trpc/client'
import { useNotification, AdminPageHeader } from '@/components/admin'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import { Input, Dropdown } from '@/components/Form'
import { portableTextToHTML } from '@/lib/email/portableTextToHTML'
import {
  CATEGORY_LABELS,
  LANGUAGE_LABELS,
  TEMPLATE_VARIABLE_DESCRIPTIONS,
  processTemplateVariables,
  processPortableTextVariables,
  buildTemplateVariables,
} from '@/lib/sponsor/templates'
import type {
  SponsorEmailTemplate,
  TemplateCategory,
  TemplateLanguage,
  PortableTextBlock as TemplateBlock,
} from '@/lib/sponsor/types'
import type { PortableTextBlock } from '@portabletext/editor'
import type { PortableTextBlock as RenderBlock } from '@portabletext/types'
import type { Conference } from '@/lib/conference/types'
import {
  ClipboardDocumentIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS) as [
  TemplateCategory,
  string,
][]

const LANGUAGE_OPTIONS = Object.entries(LANGUAGE_LABELS) as [
  TemplateLanguage,
  string,
][]

interface SponsorEmailTemplateEditorProps {
  conference: Conference
  template?: SponsorEmailTemplate
  onSaved: () => void
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
  onSaved,
}: SponsorEmailTemplateEditorProps) {
  const isEditing = !!template
  const { showNotification } = useNotification()

  const [title, setTitle] = useState(template?.title ?? '')
  const [category, setCategory] = useState<TemplateCategory>(
    template?.category ?? 'cold-outreach',
  )
  const [language, setLanguage] = useState<TemplateLanguage>(
    template?.language ?? 'no',
  )
  const [subject, setSubject] = useState(template?.subject ?? '')
  const [body, setBody] = useState<PortableTextBlock[]>(
    (template?.body as unknown as PortableTextBlock[]) ?? [],
  )
  const [description, setDescription] = useState(template?.description ?? '')

  // Reset save status when any field changes
  const markDirty = () => setSaveStatus('idle')

  const [editorKey] = useState(0)

  const utils = api.useUtils()

  const createMutation = api.sponsor.emailTemplates.create.useMutation({
    onSuccess: () => {
      setSaveStatus('success')
      utils.sponsor.emailTemplates.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Template created',
        message: `"${title}" has been created`,
      })
      onSaved()
    },
    onError: (error) => {
      setSaveStatus('error')
      showNotification({
        type: 'error',
        title: 'Create failed',
        message: error.message,
      })
    },
  })

  const updateMutation = api.sponsor.emailTemplates.update.useMutation({
    onSuccess: () => {
      setSaveStatus('success')
      utils.sponsor.emailTemplates.list.invalidate()
      showNotification({
        type: 'success',
        title: 'Template updated',
        message: `"${title}" has been saved`,
      })
      onSaved()
    },
    onError: (error) => {
      setSaveStatus('error')
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message,
      })
    },
  })

  const isPending = createMutation.isPending || updateMutation.isPending
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  )

  const handleSubmit = () => {
    if (!title.trim() || !subject.trim()) {
      showNotification({
        type: 'warning',
        title: 'Validation error',
        message: 'Title and subject are required',
      })
      return
    }

    const payload = {
      title: title.trim(),
      slug: slugify(title.trim()),
      category,
      language,
      subject: subject.trim(),
      body:
        body.length > 0
          ? (body as unknown as Record<string, unknown>[])
          : undefined,
      description: description.trim() || undefined,
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
          startDate: conference.startDate,
          city: conference.city,
          organizer: conference.organizer,
          domains: conference.domains,
          prospectusUrl: conference.sponsorshipCustomization?.prospectusUrl,
        },
        senderName: 'Hans Kristian',
        tierName: 'Community Partner',
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
    <div className="space-y-6">
      <AdminPageHeader
        icon={<EnvelopeIcon />}
        title={
          isEditing
            ? `Edit: ${template?.title ?? 'Template'}`
            : 'New Email Template'
        }
        description={
          isEditing
            ? 'Edit outreach email template for'
            : 'Create a new outreach email template for'
        }
        contextHighlight={conference.title}
        backLink={{
          href: '/admin/sponsors/templates',
          label: 'Back to Templates',
        }}
        actionItems={[
          {
            label: isEditing ? 'Save Changes' : 'Create Template',
            render: () => (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className={`inline-flex items-center rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${
                  saveStatus === 'error'
                    ? 'bg-red-600 hover:bg-red-500 dark:bg-red-500 dark:hover:bg-red-400'
                    : 'bg-indigo-600 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400'
                }`}
              >
                {isPending ? (
                  <>
                    <ArrowPathIcon className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : saveStatus === 'success' ? (
                  <>
                    <CheckIcon className="mr-2 h-4 w-4" />
                    Saved
                  </>
                ) : saveStatus === 'error' ? (
                  'Save Failed — Retry'
                ) : isEditing ? (
                  'Save Changes'
                ) : (
                  'Create Template'
                )}
              </button>
            ),
          },
        ]}
      />

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Left: Editor (3/5) */}
        <div className="space-y-6 lg:col-span-3">
          {/* Meta fields */}
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Input
                  name="template-title"
                  label="Title"
                  value={title}
                  setValue={(val) => {
                    setTitle(val)
                    markDirty()
                  }}
                  placeholder="e.g. Cold Outreach (English)"
                />
              </div>
              <div>
                <Dropdown
                  name="template-category"
                  label="Category"
                  options={new Map(CATEGORY_OPTIONS)}
                  value={category}
                  setValue={(val) => {
                    setCategory(val as TemplateCategory)
                    markDirty()
                  }}
                />
              </div>
              <div>
                <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                  Language
                </label>
                <div className="mt-2 flex gap-1">
                  {LANGUAGE_OPTIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setLanguage(value)
                        markDirty()
                      }}
                      className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        language === value
                          ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                          : 'bg-white text-gray-900 outline-1 -outline-offset-1 outline-gray-300 hover:bg-gray-50 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:hover:bg-white/10'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value)
                  markDirty()
                }}
                placeholder="Internal notes on when to use this template"
                className="mt-2 block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6 dark:bg-white/5 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500 dark:focus:outline-indigo-500"
              />
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
              onChange={(e) => {
                setSubject(e.target.value)
                markDirty()
              }}
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
              onChange={(val) => {
                setBody(val)
                markDirty()
              }}
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
                className="text-gray-700 dark:text-gray-200 dark:[&_blockquote]:text-gray-300! dark:[&_code]:text-gray-200! dark:[&_li]:text-gray-200! dark:[&_ol]:text-gray-200! dark:[&_p]:text-gray-200! dark:[&_ul]:text-gray-200!"
                style={{
                  maxWidth: 600,
                  fontFamily:
                    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                  fontSize: 16,
                  lineHeight: 1.6,
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
