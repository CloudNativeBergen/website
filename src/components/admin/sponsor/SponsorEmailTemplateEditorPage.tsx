'use client'

import { useRouter } from 'next/navigation'
import { api } from '@/lib/trpc/client'
import { AdminPageHeader } from '@/components/admin'
import { SponsorEmailTemplateEditor } from './SponsorEmailTemplateEditor'
import type { Conference } from '@/lib/conference/types'
import { EnvelopeIcon } from '@heroicons/react/24/outline'

interface SponsorEmailTemplateEditorPageProps {
  conference: Conference
  templateId?: string
}

export function SponsorEmailTemplateEditorPage({
  conference,
  templateId,
}: SponsorEmailTemplateEditorPageProps) {
  const router = useRouter()
  const isEditing = !!templateId

  const { data: template, isLoading } = api.sponsor.emailTemplates.get.useQuery(
    { id: templateId! },
    { enabled: isEditing },
  )

  const handleSaved = () => {
    router.push('/admin/sponsors/templates')
  }

  if (isEditing && isLoading) {
    return (
      <div className="space-y-6">
        <AdminPageHeader
          icon={<EnvelopeIcon />}
          title="Edit Template"
          description="Loading template..."
          backLink={{
            href: '/admin/sponsors/templates',
            label: 'Back to Templates',
          }}
        />
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <SponsorEmailTemplateEditor
      conference={conference}
      template={isEditing ? (template ?? undefined) : undefined}
      onSaved={handleSaved}
    />
  )
}
