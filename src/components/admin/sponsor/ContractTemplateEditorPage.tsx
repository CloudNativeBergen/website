'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { useNotification } from '@/components/admin'
import type { Conference } from '@/lib/conference/types'
import type { PortableTextBlock } from '@/lib/sponsor/types'
import type { PortableTextBlock as EditorBlock } from '@portabletext/editor'
import { CONTRACT_VARIABLE_DESCRIPTIONS } from '@/lib/sponsor-crm/contract-variables'
import { findUnsupportedVariables } from '@/lib/sponsor/templates'
import { Dropdown } from '@/components/Form'
import { CurrencySelect } from '@/components/CurrencySelect'
import { PortableTextEditor } from '@/components/PortableTextEditor'
import {
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InformationCircleIcon,
  ClipboardDocumentIcon,
  EyeIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'

interface ContractSection {
  heading: string
  body?: PortableTextBlock[]
}

interface ContractTemplateEditorPageProps {
  conference: Conference
  templateId?: string
}

export function ContractTemplateEditorPage({
  conference,
  templateId,
}: ContractTemplateEditorPageProps) {
  const router = useRouter()
  const { showNotification } = useNotification()

  const [title, setTitle] = useState('')
  const [language, setLanguage] = useState<'nb' | 'en'>('nb')
  const [currency, setCurrency] = useState('NOK')
  const [tier, setTier] = useState('')
  const [headerText, setHeaderText] = useState('Cloud Native Days Norway')
  const [footerText, setFooterText] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [sections, setSections] = useState<ContractSection[]>([{ heading: '' }])
  const [terms, setTerms] = useState<PortableTextBlock[]>([])
  const [showVariables, setShowVariables] = useState(false)
  const [sectionEditorKeys, setSectionEditorKeys] = useState<number[]>([0])
  const [termsEditorKey, setTermsEditorKey] = useState(0)
  const [previewPdf, setPreviewPdf] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const isEditing = !!templateId

  const { data: existingTemplate, isLoading: isLoadingTemplate } =
    api.sponsor.contractTemplates.get.useQuery(
      { id: templateId! },
      { enabled: isEditing },
    )

  const { data: tiers } = api.sponsor.tiers.listByConference.useQuery({
    conferenceId: conference._id,
  })

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (existingTemplate) {
      setTitle(existingTemplate.title)
      setLanguage(existingTemplate.language)
      setCurrency(existingTemplate.currency || 'NOK')
      setTier(existingTemplate.tier?._id || '')
      setHeaderText(existingTemplate.headerText || '')
      setFooterText(existingTemplate.footerText || '')
      setIsDefault(existingTemplate.isDefault)
      setIsActive(existingTemplate.isActive)
      const newSections = existingTemplate.sections.map((s) => ({
        heading: s.heading,
        body: s.body,
      }))
      setSections(newSections)
      setSectionEditorKeys(newSections.map((_, i) => Date.now() + i))
      if (existingTemplate.terms) {
        setTerms(existingTemplate.terms)
      }
      setTermsEditorKey(Date.now())
    }
  }, [existingTemplate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = api.sponsor.contractTemplates.create.useMutation({
    onSuccess: (data) => {
      showNotification({
        type: 'success',
        title: 'Template created',
        message: 'Contract template has been created',
      })
      if (data?._id) {
        router.replace(`/admin/sponsors/contracts/${data._id}`)
      } else {
        router.push('/admin/sponsors/contracts')
      }
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Create failed',
        message: error.message,
      })
    },
  })

  const updateMutation = api.sponsor.contractTemplates.update.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template saved',
        message: 'Contract template has been updated',
      })
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Update failed',
        message: error.message,
      })
    },
  })

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      const validSections = sections.filter((s) => s.heading.trim())
      if (validSections.length === 0) {
        showNotification({
          type: 'error',
          title: 'Validation error',
          message: 'At least one section with a heading is required',
        })
        return
      }

      if (isEditing && templateId) {
        updateMutation.mutate({
          id: templateId,
          title,
          tier: tier || null,
          language,
          currency,
          sections: validSections,
          headerText: headerText || null,
          footerText: footerText || null,
          terms: terms.length > 0 ? terms : null,
          isDefault,
          isActive,
        })
      } else {
        createMutation.mutate({
          title,
          conference: conference._id,
          tier: tier || undefined,
          language,
          currency,
          sections: validSections,
          headerText: headerText || undefined,
          footerText: footerText || undefined,
          terms: terms.length > 0 ? terms : undefined,
          isDefault,
          isActive,
        })
      }
    },
    [
      title,
      conference._id,
      tier,
      language,
      currency,
      sections,
      headerText,
      footerText,
      terms,
      isDefault,
      isActive,
      isEditing,
      templateId,
      createMutation,
      updateMutation,
      showNotification,
    ],
  )

  const addSection = () => {
    setSections([...sections, { heading: '' }])
    setSectionEditorKeys([...sectionEditorKeys, Date.now()])
  }

  const removeSection = (index: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, i) => i !== index))
    setSectionEditorKeys(sectionEditorKeys.filter((_, i) => i !== index))
  }

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= sections.length) return
    const newSections = [...sections]
    ;[newSections[index], newSections[newIndex]] = [
      newSections[newIndex],
      newSections[index],
    ]
    setSections(newSections)
    const newKeys = [...sectionEditorKeys]
    ;[newKeys[index], newKeys[newIndex]] = [newKeys[newIndex], newKeys[index]]
    setSectionEditorKeys(newKeys)
  }

  const updateSection = (
    index: number,
    field: keyof ContractSection,
    value: string | PortableTextBlock[],
  ) => {
    const newSections = [...sections]
    newSections[index] = { ...newSections[index], [field]: value }
    setSections(newSections)
  }

  const handleCopyVariable = useCallback(
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

  const previewMutation = api.sponsor.contractTemplates.previewPdf.useMutation({
    onSuccess: (data) => {
      setPreviewPdf(data.pdf)
      setShowPreview(true)
    },
    onError: (error) => {
      showNotification({
        type: 'error',
        title: 'Preview failed',
        message: error.message,
      })
    },
  })

  const handlePreview = useCallback(() => {
    const validSections = sections.filter((s) => s.heading.trim())
    if (validSections.length === 0) {
      showNotification({
        type: 'error',
        title: 'Cannot preview',
        message: 'Add at least one section with a heading first',
      })
      return
    }
    previewMutation.mutate({
      conferenceId: conference._id,
      title: title || 'Sponsor Agreement',
      language,
      currency,
      sections: validSections,
      headerText: headerText || undefined,
      footerText: footerText || undefined,
      terms: terms.length > 0 ? terms : undefined,
      tierId: tier || undefined,
    })
  }, [
    sections,
    conference._id,
    title,
    language,
    currency,
    headerText,
    footerText,
    terms,
    tier,
    previewMutation,
    showNotification,
  ])

  const unsupportedVars = useMemo(
    () =>
      findUnsupportedVariables(
        CONTRACT_VARIABLE_DESCRIPTIONS,
        headerText,
        footerText,
        ...sections.map((s) => s.heading),
        ...sections.filter((s) => s.body).map((s) => s.body!),
        terms,
      ),
    [headerText, footerText, sections, terms],
  )

  const isPending = createMutation.isPending || updateMutation.isPending

  if (isEditing && isLoadingTemplate) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Loading template...
      </div>
    )
  }

  if (showPreview && previewPdf) {
    return (
      <div>
        <AdminPageHeader
          title="Contract Preview"
          description="Preview with sample sponsor data — variables are replaced with example values"
          icon={<EyeIcon />}
          backLink={{ href: '/admin/sponsors/contracts', label: 'Contracts' }}
        />
        <div className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setShowPreview(false)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            &larr; Back to Editor
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewMutation.isPending}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <EyeIcon className="h-4 w-4" />
            {previewMutation.isPending ? 'Refreshing...' : 'Refresh Preview'}
          </button>
        </div>
        <iframe
          src={`data:application/pdf;base64,${previewPdf}`}
          className="h-[80vh] w-full rounded-lg border border-gray-200 dark:border-gray-700"
          title="Contract preview"
        />
      </div>
    )
  }

  return (
    <div>
      <AdminPageHeader
        title={isEditing ? 'Edit Contract Template' : 'New Contract Template'}
        description="Configure the contract template structure and settings"
        icon={<DocumentTextIcon />}
        backLink={{ href: '/admin/sponsors/contracts', label: 'Contracts' }}
      />

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Settings */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-4 text-lg font-medium text-gray-900 dark:text-white">
            Template Settings
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Template Name *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="e.g. Standard Sponsor Agreement 2026"
              />
            </div>
            <div>
              <Dropdown
                name="language"
                label="Language *"
                options={
                  new Map([
                    ['nb', '🇳🇴 Norwegian (Bokmål)'],
                    ['en', '🇬🇧 English'],
                  ])
                }
                value={language}
                setValue={(val) => setLanguage(val as 'nb' | 'en')}
                required
              />
            </div>
            <div>
              <label className="block text-sm/6 font-medium text-gray-900 dark:text-white">
                Default Currency
              </label>
              <div className="mt-2">
                <CurrencySelect
                  value={currency}
                  setValue={setCurrency}
                  name="default-currency"
                />
              </div>
            </div>
            <div>
              <Dropdown
                name="tier"
                label="Associated Tier"
                options={
                  new Map([
                    ['', 'No specific tier'],
                    ...(tiers?.map(
                      (t) => [t._id, t.title] as [string, string],
                    ) ?? []),
                  ])
                }
                value={tier}
                setValue={setTier}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Header Text
              </label>
              <input
                type="text"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Shown at top of PDF"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Footer Text
              </label>
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="Shown at bottom of PDF (e.g. org number)"
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-6">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Default template
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                Active
              </span>
            </label>
          </div>
        </div>

        {/* Template Variables Reference */}
        <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <button
            type="button"
            onClick={() => setShowVariables(!showVariables)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div className="flex items-center gap-2">
              <InformationCircleIcon className="h-5 w-5 text-blue-500" />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Available Template Variables
              </span>
            </div>
            {showVariables ? (
              <ChevronUpIcon className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showVariables && (
            <div className="border-t border-gray-200 px-6 py-4 dark:border-gray-700">
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                Use{' '}
                <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">
                  {'{{{VARIABLE_NAME}}}'}
                </code>{' '}
                syntax in section headings, body text, and terms. Click a
                variable to copy it.
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CONTRACT_VARIABLE_DESCRIPTIONS).map(
                  ([key, desc]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleCopyVariable(key)}
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
          )}
        </div>

        {/* Contract Sections */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
              Contract Sections
            </h3>
            <button
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              <PlusIcon className="h-4 w-4" />
              Add Section
            </button>
          </div>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            These are the main clauses of the contract (e.g. &quot;1.
            Parties&quot;, &quot;2. Scope&quot;, &quot;3. Payment Terms&quot;).
            They appear on page 1 of the PDF between the sponsor details and the
            signature area. Use{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">
              {'{{{VARIABLE_NAME}}}'}
            </code>{' '}
            syntax in both headings and body text for dynamic values.
          </p>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <div
                key={index}
                className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-400 uppercase">
                    Section {index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSection(index, 'up')}
                      disabled={index === 0}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                    >
                      <ChevronUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSection(index, 'down')}
                      disabled={index === sections.length - 1}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-gray-700"
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSection(index)}
                      disabled={sections.length <= 1}
                      className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Heading *
                    </label>
                    <input
                      type="text"
                      value={section.heading}
                      onChange={(e) =>
                        updateSection(index, 'heading', e.target.value)
                      }
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      placeholder="e.g. 1. Parties"
                    />
                  </div>
                  <div>
                    <PortableTextEditor
                      label="Body"
                      value={(section.body as unknown as EditorBlock[]) || []}
                      onChange={(val) =>
                        updateSection(
                          index,
                          'body',
                          val as unknown as PortableTextBlock[],
                        )
                      }
                      forceRemountKey={sectionEditorKeys[index]}
                      helpText="Use {{{VARIABLE_NAME}}} syntax for dynamic values."
                      compact
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSection}
            className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
          >
            <PlusIcon className="h-4 w-4" />
            Add Section
          </button>
        </div>

        {/* General Terms & Conditions (Appendix 1) */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-1 text-lg font-medium text-gray-900 dark:text-white">
            General Terms &amp; Conditions
          </h3>
          <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            These terms are included as Appendix 1 in the contract PDF and
            displayed on the public{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">
              /sponsor/terms
            </code>{' '}
            page. Use headings for numbered sections and{' '}
            <code className="rounded bg-gray-100 px-1 text-xs dark:bg-gray-800">
              {'{{{VARIABLE_NAME}}}'}
            </code>{' '}
            syntax for dynamic values.
          </p>
          <PortableTextEditor
            label="Terms &amp; Conditions"
            value={(terms as unknown as EditorBlock[]) || []}
            onChange={(val) => setTerms(val as unknown as PortableTextBlock[])}
            forceRemountKey={termsEditorKey}
            helpText="Use {{{VARIABLE_NAME}}} syntax for dynamic values. Variables are substituted in the contract PDF."
            compact
          />
        </div>

        {/* Unsupported variable warning */}
        {unsupportedVars.length > 0 && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-600 dark:bg-amber-900/20">
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Unsupported variables detected</p>
              <p className="mt-1">
                The following variables will not be replaced in the contract:{' '}
                {unsupportedVars.map((v, i) => (
                  <span key={v}>
                    {i > 0 && ', '}
                    <code className="rounded bg-amber-100 px-1 font-mono text-xs dark:bg-amber-800">
                      {`{{{${v}}}}`}
                    </code>
                  </span>
                ))}
              </p>
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/sponsors/contracts')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handlePreview}
            disabled={previewMutation.isPending}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-300 dark:hover:bg-blue-900/20"
            title="Generate a preview PDF with sample sponsor data (does not save)"
          >
            <EyeIcon className="h-4 w-4" />
            {previewMutation.isPending ? 'Generating...' : 'Preview PDF'}
          </button>
          <button
            type="submit"
            disabled={isPending || !title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  )
}
