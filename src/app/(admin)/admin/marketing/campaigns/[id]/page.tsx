import { getAuthSession } from '@/lib/auth'
import { isOrganizerForCurrentOrg } from '@/lib/authz/organizer'
import { CampaignLedgerPage } from '@/components/admin/marketing'

/**
 * The Campaign ledger (spec §7, #1018). The Campaign id is proven to be this
 * conference's by `marketing.campaign.get`, never here.
 */
export default async function MarketingCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getAuthSession()

  // ORG-SCOPED admin gate (CaaS T1-2, #614), matching the (admin) layout.
  if (!(await isOrganizerForCurrentOrg(session?.speaker))) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-lg text-gray-500 dark:text-gray-400">
          Access Denied
        </p>
      </div>
    )
  }

  return <CampaignLedgerPage campaignId={id} />
}
