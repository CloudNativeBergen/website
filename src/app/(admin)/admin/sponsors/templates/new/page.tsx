import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { SponsorEmailTemplateEditorPage } from '@/components/admin/sponsor/SponsorEmailTemplateEditorPage'

export default async function NewTemplatePage() {
  const { conference, error: conferenceError } =
    await getConferenceForCurrentDomain({})

  if (conferenceError) {
    return (
      <ErrorDisplay
        title="Error Loading Conference"
        message={conferenceError.message}
      />
    )
  }

  if (!conference) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference found for current domain"
      />
    )
  }

  return <SponsorEmailTemplateEditorPage conference={conference} />
}
