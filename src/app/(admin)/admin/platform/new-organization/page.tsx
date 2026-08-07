import { notFound } from 'next/navigation'
import { getAuthSession } from '@/lib/auth'
import { isPlatformOperator } from '@/lib/authz/platform'
import { AdminPageHeader } from '@/components/admin'
import { OnboardingWizard } from '@/components/admin/onboarding'
import { BuildingOffice2Icon } from '@heroicons/react/24/outline'

export const metadata = {
  title: 'New organization',
}

/**
 * Onboarding S2 (RunKonf/platform#4) — the PLATFORM-OPERATOR concierge wizard
 * that creates a new tenant: organization + first conference + organizer
 * membership. This is NOT public signup (no billing/entity exists yet); the
 * operator runs it on a new customer's behalf.
 *
 * GATING: the (admin) layout already requires an organizer of the CURRENT
 * domain's org; on top of that this page — like the tRPC mutation it drives —
 * requires the caller to be an organizer of the CONFIGURED platform org
 * (`PLATFORM_ORG_ID`, see `@/lib/authz/platform`). Non-operators get a 404
 * so the surface's existence isn't disclosed. The SERVER mutation reinforces
 * the same gate; this page check is UX, not the security boundary.
 */
export default async function NewOrganizationPage() {
  const session = await getAuthSession()
  if (!(await isPlatformOperator(session?.speaker))) {
    notFound()
  }

  return (
    <div className="w-full space-y-6">
      <AdminPageHeader
        icon={<BuildingOffice2Icon />}
        title="New organization"
        description="Concierge onboarding: create a tenant organization, its first conference and the founding organizer."
        backLink={{ href: '/admin', label: 'Back to admin' }}
      />
      <OnboardingWizard />
    </div>
  )
}
