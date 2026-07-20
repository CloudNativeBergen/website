import { getConferenceForCurrentDomain } from '@/lib/conference/sanity'
import { clientReadUncached } from '@/lib/sanity/client'
import { ErrorDisplay, AdminPageHeader } from '@/components/admin'
import { NewEditionWizard } from '@/components/admin/new-edition'
import { nextEditionDefaults, type CloneFamily } from '@/lib/conference/edition'
import { SparklesIcon } from '@heroicons/react/24/outline'

export const metadata = {
  title: 'Create next edition',
}

/**
 * SE-5 — the "Create next edition" wizard page. The last hard Studio dependency
 * was seeding a new conference document; this page clones the CURRENT edition's
 * structure into a fresh document with new dates + domains. The current edition
 * is the SOURCE and is never modified.
 */
export default async function NewEditionPage() {
  const { conference, error } = await getConferenceForCurrentDomain({
    organizers: true,
    sponsorTiers: true,
    topics: true,
  })

  if (error) {
    return (
      <ErrorDisplay title="Error Loading Conference" message={error.message} />
    )
  }
  if (!conference?._id) {
    return (
      <ErrorDisplay
        title="No Conference Found"
        message="No conference configuration found for the current domain."
      />
    )
  }

  // A single count the normalized projection doesn't carry.
  const contractTemplateCount = await clientReadUncached.fetch<number>(
    `count(*[_type == "contractTemplate" && conference._ref == $id])`,
    { id: conference._id },
  )

  const numericGoals = [
    conference.cfpSubmissionGoal,
    conference.cfpLightningGoal,
    conference.cfpPresentationGoal,
    conference.cfpWorkshopGoal,
    conference.sponsorRevenueGoal,
    conference.travelSupportBudget,
  ].filter((v) => typeof v === 'number').length

  const emailChannelCount = [
    conference.contactEmail,
    conference.cfpEmail,
    conference.sponsorEmail,
    conference.salesNotificationChannel,
    conference.cfpNotificationChannel,
    ...(conference.socialLinks ?? []),
  ].filter(Boolean).length

  const cloneCounts: Partial<Record<CloneFamily, number>> = {
    topics: conference.topics?.length ?? 0,
    formats: conference.formats?.length ?? 0,
    organizers: conference.organizers?.length ?? 0,
    teams: conference.teams?.length ?? 0,
    sponsorTiers: conference.sponsorTiers?.length ?? 0,
    contractTemplates: contractTemplateCount ?? 0,
    sponsorshipCopy: conference.sponsorBenefits?.length ?? 0,
    cfpGoals: numericGoals,
    agentConfig: conference.agentConfig ? 1 : 0,
    emailsAndChannels: emailChannelCount,
  }

  const defaults = nextEditionDefaults(conference)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminPageHeader
        icon={<SparklesIcon />}
        title="Create next edition"
        description="Clone this edition's structure into a new conference with fresh dates and domains."
        backLink={{ href: '/admin/settings', label: 'Back to settings' }}
      />
      <NewEditionWizard
        defaults={defaults}
        sourceTitle={conference.title}
        cloneCounts={cloneCounts}
      />
    </div>
  )
}
