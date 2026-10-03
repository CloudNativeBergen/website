/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use client'

import { ModalShell } from '@/components/ModalShell'
import { SponsorContactEditor } from '@/components/admin/sponsor/SponsorContactEditor'
import { SponsorContractView } from '@/components/admin/sponsor-crm/SponsorContractView'
import { api } from '@/lib/trpc/client'
import { SponsorMessagesPanel } from './SponsorMessagesPanel'

interface SponsorDashboardModalsProps {
  sponsorId: string
  activeModal:
    'contacts' | 'contract' | 'overview' | 'activity' | 'messages' | null
  onClose: () => void
}

export function SponsorDashboardModals({
  sponsorId,
  activeModal,
  onClose,
}: SponsorDashboardModalsProps) {
  // We fetch the full object just for the modals to keep them happy without rewriting 1000s of lines yet
  const { data: sponsorData, isLoading } = api.sponsor.crm.getById.useQuery(
    { id: sponsorId },
    { enabled: activeModal !== null },
  )

  const utils = api.useUtils()

  const handleSuccess = () => {
    utils.sponsor.crm.getContacts.invalidate({ id: sponsorId })
    utils.sponsor.crm.getOverview.invalidate({ id: sponsorId })
    utils.sponsor.crm.getContractDetails.invalidate({ id: sponsorId })
    utils.sponsor.crm.activities.list.invalidate({
      sponsorForConferenceId: sponsorId,
    })
    onClose()
  }

  if (activeModal && isLoading) {
    return (
      <ModalShell isOpen onClose={onClose} title="Loading...">
        <div className="p-8 text-center text-gray-500">
          Loading sponsor data...
        </div>
      </ModalShell>
    )
  }

  if (!sponsorData) return null

  return (
    <>
      <ModalShell
        isOpen={activeModal === 'contacts'}
        onClose={onClose}
        title="Edit Contacts & Billing"
        size="lg"
      >
        <div className="p-6">
          <SponsorContactEditor
            sponsorForConference={sponsorData as any}
            onSuccess={handleSuccess}
            onCancel={onClose}
          />
        </div>
      </ModalShell>

      <ModalShell
        isOpen={activeModal === 'contract'}
        onClose={onClose}
        title="Manage Contract"
        size="2xl"
      >
        <div className="h-[75vh] overflow-y-auto p-6">
          <SponsorContractView
            conferenceId={sponsorData.conference?._id || ''}
            sponsor={sponsorData as any}
            onSuccess={handleSuccess}
          />
        </div>
      </ModalShell>

      <ModalShell
        isOpen={activeModal === 'messages'}
        onClose={onClose}
        title="Sponsor Messages"
        size="2xl"
      >
        <div className="h-[75vh] overflow-y-auto p-6">
          <SponsorMessagesPanel sponsorForConferenceId={sponsorId} />
        </div>
      </ModalShell>

      {/* TODO: Add overview and activity modals as needed */}
    </>
  )
}
