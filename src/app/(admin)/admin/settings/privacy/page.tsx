import { ShieldCheckIcon } from '@heroicons/react/24/outline'
import { AdminPageHeader } from '@/components/admin'
import { PrivacyErasure } from '@/components/admin/privacy/PrivacyErasure'

export const metadata = {
  title: 'Privacy',
}

/**
 * Erasure requests for this organization (#1045, #1310). Verify the person's
 * identity first: see "Verifying identity" in docs/SPEAKER_ERASURE_RUNBOOK.md.
 */
export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        icon={<ShieldCheckIcon />}
        title="Privacy"
        description="Handle a person's request to erase their data at this organization. Verify their identity before you start, and record the request in the DSR log."
      />
      <PrivacyErasure />
    </div>
  )
}
