import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorEmailTemplateEditorPage } from '@/components/admin/sponsor/SponsorEmailTemplateEditorPage'

interface EditTemplatePageProps {
  params: Promise<{ id: string }>
}

export default async function EditTemplatePage({
  params,
}: EditTemplatePageProps) {
  const { id } = await params

  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
        backLink={{
          href: '/admin/sponsors/templates',
          label: 'Back to Templates',
        }}
      />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference found for current domain"
        backLink={{
          href: '/admin/sponsors/templates',
          label: 'Back to Templates',
        }}
      />
    )
  }

  return (
    <SponsorEmailTemplateEditorPage conference={conference} templateId={id} />
  )
}
