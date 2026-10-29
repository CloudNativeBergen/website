/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/trpc/client'
import type { Conference } from '@/lib/conference/types'
import type { SendableKind } from '@/components/admin/sponsor/SponsorSendModal'
import {
  SponsorRecordPanel,
  useRefreshSponsor,
  useSponsorRecordPanel,
  type RecordView,
} from '@/components/admin/sponsor-crm/SponsorRecordPanel'
import { SponsorDetailHeader } from '@/components/admin/sponsor-crm/widgets/SponsorDetailHeader'
import { SponsorOverviewWidget } from '@/components/admin/sponsor-crm/widgets/SponsorOverviewWidget'
import { SponsorPhaseWidget } from '@/components/admin/sponsor-crm/widgets/SponsorPhaseWidget'
import { SponsorFollowUpWidget } from '@/components/admin/sponsor-crm/widgets/SponsorFollowUpWidget'
import { SponsorContactsWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContactsWidget'
import { SponsorContractWidget } from '@/components/admin/sponsor-crm/widgets/SponsorContractWidget'
import { SponsorRenewalWidget } from '@/components/admin/sponsor-crm/widgets/SponsorRenewalWidget'
import { SponsorActivityFeedWidget } from '@/components/admin/sponsor-crm/widgets/SponsorActivityFeedWidget'

// The page section a `?view=` link scrolls to; other views use their own id.
const SECTION_FOR_VIEW: Partial<Record<RecordView, string>> = {
  pipeline: 'overview',
  logo: 'overview',
  communications: 'history',
  messages: 'history',
}

interface SponsorDashboardClientProps {
  sponsorId: string
  conference: Conference
  domain: string
  canSendDiscountCodes?: boolean
  workshopsEnabled?: boolean
  initialOverview?: any
  /**
   * From `?view=`: scrolls to the matching section. It no longer opens the
   * record; only "Open record" and "Manage" do.
   */
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
  // The page is read-only; editing happens in the board's side panel,
  // opened over the page and kept in `?edit=<tab>`.
  const panel = useSponsorRecordPanel({ viewParam: 'edit', fixedId: sponsorId })
  const openRecord = (view: RecordView) => panel.open(sponsorId, view)

  useEffect(() => {
    if (!initialView) return
    document
      .getElementById(SECTION_FOR_VIEW[initialView] ?? initialView)
      ?.scrollIntoView?.({ block: 'start' })
  }, [initialView])
  const { data: sponsor } = api.sponsor.crm.getById.useQuery({
    id: sponsorId,
  })

  const { data: activities } = api.sponsor.crm.activities.list.useQuery({
    sponsorForConferenceId: sponsorId,
  })

  // "Send Email" opens the panel with its send modal: one send path.
  const [sendOnOpen, setSendOnOpen] = useState<SendableKind>()
  // Clear it whenever the panel closes, Back and URL changes included, so a
  // later "Edit" never reopens the send modal.
  const [prevPanelId, setPrevPanelId] = useState(panel.id)
  if (prevPanelId !== panel.id) {
    setPrevPanelId(panel.id)
    if (!panel.id) setSendOnOpen(undefined)
  }
  const refreshSponsor = useRefreshSponsor()
  const refresh = () => refreshSponsor(sponsorId)

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-gray-900/50">
      <SponsorDetailHeader
        sponsorId={sponsorId}
        initialData={initialOverview}
        backHref={backHref}
        onOpenRecord={() => openRecord('pipeline')}
        onSendEmail={
          sponsor
            ? () => {
                setSendOnOpen('information')
                openRecord('communications')
              }
            : undefined
        }
      />

      <main className="flex-1 overflow-y-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 empty:hidden">
            <SponsorRenewalWidget sponsorId={sponsorId} onChanged={refresh} />
          </div>
          {sponsor && (
            <div className="mb-8">
              <SponsorPhaseWidget
                sponsor={sponsor}
                activities={activities}
                onOpenRecord={openRecord}
                onChanged={refresh}
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="flex flex-col gap-8 lg:col-span-1">
              <div id="overview" className="scroll-mt-4">
                <SponsorOverviewWidget
                  sponsorId={sponsorId}
                  initialData={initialOverview}
                  onEdit={() => openRecord('pipeline')}
                />
              </div>
              <div id="follow-up" className="scroll-mt-4">
                <SponsorFollowUpWidget
                  sponsorId={sponsorId}
                  initialData={initialOverview}
                  onChanged={refresh}
                />
              </div>
              <div id="contacts" className="scroll-mt-4">
                <SponsorContactsWidget
                  sponsorId={sponsorId}
                  onEdit={() => openRecord('contacts')}
                />
              </div>
            </div>

            <div className="flex h-[calc(100vh-12rem)] flex-col gap-8 lg:col-span-2">
              <div id="contract" className="scroll-mt-4">
                <SponsorContractWidget
                  sponsorId={sponsorId}
                  onEdit={() => openRecord('contract')}
                />
              </div>
              <div
                id="history"
                className="flex min-h-0 flex-1 scroll-mt-4 flex-col"
              >
                <SponsorActivityFeedWidget
                  sponsorId={sponsorId}
                  onNewActivity={() => openRecord('history')}
                />
              </div>
            </div>
          </div>
        </div>
      </main>

      {panel.id && (
        <SponsorRecordPanel
          sponsorId={sponsorId}
          view={panel.view}
          onViewChange={panel.setView}
          onClose={panel.close}
          onChanged={refresh}
          initialSendKind={sendOnOpen}
          conference={conference}
          domain={domain}
          canSendDiscountCodes={canSendDiscountCodes}
          workshopsEnabled={workshopsEnabled}
        />
      )}
    </div>
  )
}
