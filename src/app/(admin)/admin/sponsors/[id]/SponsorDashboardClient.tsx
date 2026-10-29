/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useCallback, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { api } from '@/lib/trpc/client'
import type { Conference } from '@/lib/conference/types'
import { SponsorCRMForm } from '@/components/admin/sponsor-crm/SponsorCRMForm'
import type { ContractSendOptions } from '@/components/admin/sponsor-crm/SponsorContractView'
import { SponsorSendModal } from '@/components/admin'
import {
  sponsorFromAddress,
  type SendableKind,
} from '@/components/admin/sponsor/SponsorSendModal'
import { SponsorDetailHeader } from '@/components/admin/sponsor-crm/widgets/SponsorDetailHeader'
import { SponsorOverviewWidget } from '@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget'
import { SponsorFollowUpWidget } from '@/components/admin/sponsor-crm/widgets/SponsorFollowUpWidget'
import { SponsorContactsWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContactsWidget'
import { SponsorContractWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContractWidget'
import { SponsorActivityFeedWidget } from '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget'

type RecordView = NonNullable<
  React.ComponentProps<typeof SponsorCRMForm>['initialView']
>

interface SponsorDashboardClientProps {
  sponsorId: string
  conference: Conference
  domain: string
  canSendDiscountCodes?: boolean
  workshopsEnabled?: boolean
  initialOverview?: any
  /** From `?view=`: opens the record on that tab, as the old modal link did. */
  initialView?: RecordView
  /** Where the back arrow goes: the board the sponsor was opened from. */
  backHref?: string
}

export function SponsorDashboardClient({
  sponsorId,
  conference,
  domain,
  canSendDiscountCodes = false,
  workshopsEnabled = false,
  initialOverview,
  initialView,
  backHref,
}: SponsorDashboardClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: session } = useSession()
  const utils = api.useUtils()

  // The full record (the former SponsorCRMForm modal) carries every tab:
  // deal status, tags, owner, contacts, logo, contract steps, early access,
  // history, communications and messages.
  const [recordView, setRecordView] = useState<RecordView | null>(
    initialView ?? null,
  )
  const { data: sponsor } = api.sponsor.crm.getById.useQuery({
    id: sponsorId,
  })

  const [sendKind, setSendKind] = useState<SendableKind | null>(null)
  const [contractSend, setContractSend] = useState<ContractSendOptions>({})

  const syncViewParam = useCallback(
    (view: RecordView | null) => {
      const params = new URLSearchParams(searchParams.toString())
      if (view) params.set('view', view)
      else params.delete('view')
      const qs = params.toString()
      router.replace(qs ? `?${qs}` : '?', { scroll: false })
    },
    [router, searchParams],
  )

  const openRecord = useCallback(
    (view: RecordView) => {
      setRecordView(view)
      syncViewParam(view)
    },
    [syncViewParam],
  )

  const refresh = useCallback(() => {
    utils.sponsor.crm.getById.invalidate({ id: sponsorId })
    utils.sponsor.crm.getOverview.invalidate({ id: sponsorId })
    utils.sponsor.crm.getContacts.invalidate({ id: sponsorId })
    utils.sponsor.crm.getContractDetails.invalidate({ id: sponsorId })
    utils.sponsor.crm.activities.list.invalidate({
      sponsorForConferenceId: sponsorId,
    })
    utils.sponsor.crm.list.invalidate()
    utils.sponsor.crm.healthViolations.invalidate()
  }, [utils, sponsorId])

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900/50">
      <SponsorDetailHeader
        sponsorId={sponsorId}
        initialData={initialOverview}
        backHref={backHref}
        onOpenRecord={() => openRecord('pipeline')}
        onChanged={refresh}
        onSendEmail={sponsor ? () => setSendKind('information') : undefined}
      />

      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col gap-8 lg:col-span-1">
              <SponsorOverviewWidget
                sponsorId={sponsorId}
                initialData={initialOverview}
                onEdit={() => openRecord('pipeline')}
              />
              <SponsorFollowUpWidget
                sponsorId={sponsorId}
                initialData={initialOverview}
                onChanged={refresh}
              />
              <SponsorContactsWidget
                sponsorId={sponsorId}
                onEdit={() => openRecord('contacts')}
              />
            </div>

            <div className="flex h-[calc(100vh-12rem)] flex-col gap-8 lg:col-span-2">
              <SponsorContractWidget
                sponsorId={sponsorId}
                onEdit={() => openRecord('contract')}
              />
              <SponsorActivityFeedWidget
                sponsorId={sponsorId}
                onNewActivity={() => openRecord('history')}
              />
            </div>
          </div>
        </div>
      </main>

      {recordView && sponsor && (
        <SponsorCRMForm
          conferenceId={conference._id}
          workshopsEnabled={workshopsEnabled}
          sponsorStartSet={!!conference.workshopRegistrationSponsorStart}
          sponsor={sponsor}
          isOpen
          initialView={recordView}
          onViewChange={syncViewParam}
          onClose={() => {
            setRecordView(null)
            syncViewParam(null)
            refresh()
          }}
          onSuccess={refresh}
          onSendEmail={() => setSendKind('information')}
          onSendDiscountCodes={
            canSendDiscountCodes ? () => setSendKind('discount') : undefined
          }
          onSendRegistration={() => setSendKind('registration')}
          onSendContract={(options) => {
            setContractSend(options)
            setSendKind('contract')
          }}
          onSendEarlyAccess={() => setSendKind('workshop-early-access')}
        />
      )}

      {sponsor && sendKind && (
        <SponsorSendModal
          key={sendKind}
          isOpen
          onClose={() => {
            setSendKind(null)
            refresh()
          }}
          onSent={refresh}
          sponsorForConference={sponsor}
          kind={sendKind}
          contractSend={sendKind === 'contract' ? contractSend : undefined}
          domain={domain}
          fromEmail={sponsorFromAddress(conference, domain)}
          senderName={session?.speaker?.name || session?.user?.name || ''}
          conference={{
            title: conference.title || '',
            city: conference.city || '',
            country: conference.country || '',
            startDate: conference.startDate || '',
            organizer: conference.organizer,
            domains: conference.domains || [domain],
            socialLinks: conference.socialLinks,
            prospectusUrl: conference.sponsorshipCustomization?.prospectusUrl,
            sponsorRegistrationLink: conference.sponsorRegistrationLink,
            theme: conference.theme,
          }}
        />
      )}
    </div>
  )
}
