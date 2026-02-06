'use client'

import { useMemo } from 'react'
import { api } from '@/lib/trpc/client'
import type { SponsorEmailTemplate } from '@/lib/sponsor/types'
import {
  buildTemplateVariables,
  processTemplateVariables,
  processPortableTextVariables,
  CATEGORY_LABELS,
} from '@/lib/sponsor/templates'
import type { PortableTextBlock } from '@portabletext/editor'
import { formatConferenceDateLong } from '@/lib/time'
import type { PortableTextBlock as TemplateBlock } from '@/lib/sponsor/types'

interface SponsorTemplatePickerProps {
  sponsorName: string
  contactNames?: string
  conference: {
    title: string
    city: string
    start_date: string
    organizer?: string
    domains: string[]
    prospectus_url?: string
  }
  senderName?: string
  tierName?: string
  onApply: (subject: string, body: PortableTextBlock[]) => void
}

export function SponsorTemplatePicker({
  sponsorName,
  contactNames,
  conference,
  senderName,
  tierName,
  onApply,
}: SponsorTemplatePickerProps) {
  const { data: templates, isLoading } =
    api.sponsor.emailTemplates.list.useQuery()

  const variables = useMemo(
    () =>
      buildTemplateVariables({
        sponsorName,
        contactNames,
        conference,
        senderName,
        tierName,
        formatDate: formatConferenceDateLong,
      }),
    [sponsorName, contactNames, conference, senderName, tierName],
  )

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

    onApply(processedSubject, processedBody as unknown as PortableTextBlock[])

    // Reset the select so it can be re-selected
    e.target.value = ''
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

  return (
    <select
      onChange={handleSelect}
      defaultValue=""
      className="font-inter w-full border-none bg-transparent px-0 py-1 text-sm text-gray-600 focus:ring-0 focus:outline-none dark:text-gray-300"
    >
      <option value="" disabled>
        Select a template...
      </option>
      {Object.entries(grouped).map(([category, categoryTemplates]) => (
        <optgroup key={category} label={CATEGORY_LABELS[category] || category}>
          {categoryTemplates.map((t) => (
            <option key={t._id} value={t._id}>
              {t.title}
              {t.is_default ? ' (default)' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
