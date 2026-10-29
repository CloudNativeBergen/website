import { SPONSOR_PAGE_TITLES } from '@/lib/sponsor-crm/labels'
import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { ErrorDisplay } from '@/components/admin'
import { ContractTemplateListPage } from '@/components/admin/sponsor/ContractTemplateListPage'

export const metadata = { title: SPONSOR_PAGE_TITLES.contracts }

export default async function AdminContractTemplates() {
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

  return <ContractTemplateListPage conference={conference} />
}
