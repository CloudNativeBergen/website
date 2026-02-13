'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { useNotification } from '@/components/admin'
import type { Conference } from '@/lib/conference/types'
import type { PortableTextBlock } from '@/lib/sponsor/types'
import { CONTRACT_VARIABLE_DESCRIPTIONS } from '@/lib/sponsor-crm/contract-variables'
import { Dropdown } from '@/components/Form'
import {
  DocumentTextIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  InformationCircleIcon,
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
      setSections(
        existingTemplate.sections.map((s) => ({
          heading: s.heading,
          body: s.body,
        })),
      )
      if (existingTemplate.terms) {
        setTerms(existingTemplate.terms)
      }
    }
  }, [existingTemplate])
  /* eslint-enable react-hooks/set-state-in-effect */

  const createMutation = api.sponsor.contractTemplates.create.useMutation({
    onSuccess: () => {
      showNotification({
        type: 'success',
        title: 'Template created',
        message: 'Contract template has been created',
      })
      router.push('/admin/sponsors/contracts')
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
        title: 'Template updated',
        message: 'Contract template has been updated',
      })
      router.push('/admin/sponsors/contracts')
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

      const data = {
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
      }

      if (isEditing && templateId) {
        updateMutation.mutate({ id: templateId, ...data })
      } else {
        createMutation.mutate(data)
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
  }

  const removeSection = (index: number) => {
    if (sections.length <= 1) return
    setSections(sections.filter((_, i) => i !== index))
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

  const isPending = createMutation.isPending || updateMutation.isPending

  if (isEditing && isLoadingTemplate) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Loading template...
      </div>
    )
  }

  return (
    <div>
      <AdminPageHeader
        title={isEditing ? 'Edit Contract Template' : 'New Contract Template'}
        description="Configure the contract template structure and settings"
        icon={<DocumentTextIcon />}
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
              <Dropdown
                name="currency"
                label="Default Currency"
                options={
                  new Map([
                    ['NOK', 'NOK'],
                    ['USD', 'USD'],
                    ['EUR', 'EUR'],
                    ['GBP', 'GBP'],
                  ])
                }
                value={currency}
                setValue={setCurrency}
              />
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
                syntax in section headings and body text.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(CONTRACT_VARIABLE_DESCRIPTIONS).map(
                  ([key, desc]) => (
                    <div key={key} className="flex items-start gap-2 text-xs">
                      <code className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-blue-600 dark:bg-gray-800 dark:text-blue-400">
                        {key}
                      </code>
                      <span className="text-gray-500 dark:text-gray-400">
                        {desc}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          )}
        </div>

        {/* Contract Sections */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
          <div className="mb-4 flex items-center justify-between">
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Body
                    </label>
                    <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                      Rich text editing is available through the Sanity Studio.
                      Enter plain text here for initial setup.
                    </p>
                    <textarea
                      value={
                        section.body
                          ?.map((block: PortableTextBlock) =>
                            block.children?.map((c) => c.text || '').join(''),
                          )
                          .join('\n') || ''
                      }
                      onChange={(e) => {
                        const lines = e.target.value.split('\n')
                        const blocks = lines.map((line, i) => ({
                          _type: 'block',
                          _key: `p-${i}`,
                          style: 'normal',
                          children: [
                            {
                              _type: 'span',
                              _key: `s-${i}`,
                              text: line,
                              marks: [],
                            },
                          ],
                          markDefs: [],
                        }))
                        updateSection(index, 'body', blocks)
                      }}
                      rows={4}
                      className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                      placeholder="Section body text. Use {{{VARIABLE_NAME}}} for dynamic values."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
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
            page. Use headings (h2/h3) in Sanity Studio for numbered sections.
            Plain text editing is available here for initial setup.
          </p>
          <textarea
            value={
              terms
                .map((block: PortableTextBlock) =>
                  block.children?.map((c) => c.text || '').join(''),
                )
                .join('\n') || ''
            }
            onChange={(e) => {
              const lines = e.target.value.split('\n')
              const blocks = lines.map((line, i) => ({
                _type: 'block',
                _key: `terms-${i}`,
                style: 'normal',
                children: [
                  {
                    _type: 'span',
                    _key: `ts-${i}`,
                    text: line,
                    marks: [],
                  },
                ],
                markDefs: [],
              }))
              setTerms(blocks)
            }}
            rows={10}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-white"
            placeholder="Enter the general terms and conditions here. For rich text formatting (headings, bold, lists), use Sanity Studio after creating the template."
          />
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/sponsors/contracts')}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !title.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending
              ? 'Saving...'
              : isEditing
                ? 'Update Template'
                : 'Create Template'}
          </button>
        </div>
      </form>
    </div>
  )
}
