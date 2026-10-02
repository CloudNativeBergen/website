'use client'

import { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import type {
  SponsorEmailTemplate,
  TemplateCategory,
  TemplateLanguage,
} from '@/lib/sponsor/types'
import {
  buildTemplateVariables,
  processTemplateVariables,
  processPortableTextVariables,
  suggestTemplateCategory,
  suggestTemplateLanguage,
  findBestTemplate,
  CATEGORY_LABELS,
  LANGUAGE_FLAGS,
} from '@/lib/sponsor/templates'
import type { PortableTextBlock } from '@portabletext/editor'
import type { PortableTextBlock as TemplateBlock } from '@/lib/sponsor/types'

interface SponsorTemplatePickerProps {
  sponsorName: string
  contactNames?: string
  conference: {
    title: string
    city: string
    startDate: string
    organizer?: string
    domains: string[]
    prospectusUrl?: string
  }
  senderName?: string
  tierName?: string
  /**
   * The chosen template, variables already merged. The third argument names
   * the template so a caller can record which one a send started from (#1261).
   */
  onApply: (
    subject: string,
    body: PortableTextBlock[],
    template: SponsorEmailTemplate,
  ) => void
  /** Categories to leave out of the picker (e.g. `contract` for an information send). */
  excludeCategories?: readonly TemplateCategory[]
  /** The template currently applied, so the select reflects it instead of the placeholder. */
  selectedId?: string
  crmContext?: {
    tags?: string[]
    status?: string
    currency?: string
    orgNumber?: string
    website?: string
  }
}

export function SponsorTemplatePicker({
  sponsorName,
  contactNames,
  conference,
  senderName,
  tierName,
  onApply,
  crmContext,
  excludeCategories,
  selectedId,
}: SponsorTemplatePickerProps) {
  const { data: allTemplates, isLoading } =
    api.sponsor.emailTemplates.list.useQuery()
  const templates = useMemo(
    () =>
      excludeCategories?.length
        ? allTemplates?.filter((t) => !excludeCategories.includes(t.category))
        : allTemplates,
    [allTemplates, excludeCategories],
  )

  const variables = useMemo(
    () =>
      buildTemplateVariables({
        sponsorName,
        contactNames,
        conference,
        senderName,
        tierName,
      }),
    [sponsorName, contactNames, conference, senderName, tierName],
  )

  const suggestedCategory = useMemo<TemplateCategory | undefined>(
    () => (crmContext ? suggestTemplateCategory(crmContext) : undefined),
    [crmContext],
  )

  const suggestedLanguage = useMemo<TemplateLanguage | undefined>(
    () => (crmContext ? suggestTemplateLanguage(crmContext) : undefined),
    [crmContext],
  )

  const recommendedTemplate = useMemo(() => {
    if (!templates || !suggestedCategory || !suggestedLanguage) return undefined
    return findBestTemplate(templates, suggestedCategory, suggestedLanguage)
  }, [templates, suggestedCategory, suggestedLanguage])

  const grouped = useMemo(() => {
    if (!templates) return {}
    const groups: Record<string, SponsorEmailTemplate[]> = {}
    for (const t of templates) {
      const cat = t.category || 'custom'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(t)
    }
    return groups
  }, [templates])

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const templateId = e.target.value
    if (!templateId || !templates) return

    const template = templates.find((t) => t._id === templateId)
    if (!template) return

    const processedSubject = processTemplateVariables(
      template.subject,
      variables,
    )

    const processedBody = template.body
      ? processPortableTextVariables(
          template.body as TemplateBlock[],
          variables,
        )
      : []

    onApply(
      processedSubject,
      processedBody as unknown as PortableTextBlock[],
      template,
    )

    // Uncontrolled use: reset so the same template can be re-selected.
    if (selectedId === undefined) e.target.value = ''
  }

  if (isLoading) {
    return (
      <span className="font-inter text-sm text-gray-400 dark:text-gray-500">
        Loading templates...
      </span>
    )
  }

  if (!templates || templates.length === 0) {
    return null
  }

  // Controlled: an id that is no longer in the list (deleted template) must
  // show the placeholder, not whatever option React falls back to.
  const controlledValue =
    selectedId !== undefined && templates.some((t) => t._id === selectedId)
      ? selectedId
      : ''
  const selectedTemplate =
    controlledValue !== ''
      ? templates.find((t) => t._id === controlledValue)
      : undefined
  const reapply = () => {
    if (!selectedTemplate) return
    onApply(
      processTemplateVariables(selectedTemplate.subject, variables),
      (selectedTemplate.body
        ? processPortableTextVariables(
            selectedTemplate.body as TemplateBlock[],
            variables,
          )
        : []) as unknown as PortableTextBlock[],
      selectedTemplate,
    )
  }

  return (
    <div className="flex w-full items-center gap-2">
      <select
        onChange={handleSelect}
        {...(selectedId === undefined
          ? { defaultValue: '' }
          : { value: controlledValue })}
        className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm text-gray-600 focus:ring-0 focus:outline-none dark:text-gray-300"
      >
        <option value="" disabled>
          Select a template...
        </option>
        {Object.entries(grouped).map(([category, categoryTemplates]) => (
          <optgroup
            key={category}
            label={CATEGORY_LABELS[category] || category}
          >
            {categoryTemplates.map((t) => (
              <option
                key={t._id}
                value={t._id}
                title={[t.description, `Subject: ${t.subject}`]
                  .filter(Boolean)
                  .join('\n')}
              >
                {LANGUAGE_FLAGS[t.language]
                  ? `${LANGUAGE_FLAGS[t.language]} `
                  : ''}
                {t.title}
                {recommendedTemplate?._id === t._id ? ' ✦' : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {/* Hidden with no recipient chosen (no `contactNames`): re-applying
          would merge a bare `{{{CONTACT_NAMES}}}` into the body. */}
      {selectedTemplate && contactNames && (
        <button
          type="button"
          onClick={reapply}
          title="Discard edits and apply this template again"
          className="font-inter shrink-0 cursor-pointer text-xs text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline dark:text-gray-400 dark:hover:text-gray-100"
        >
          Reset
        </button>
      )}
    </div>
  )
}
